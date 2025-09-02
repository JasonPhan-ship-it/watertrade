// app/api/sign-url/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/trade";
import { clerkClient } from "@clerk/nextjs/server";

/** Type guard for forbidden viewers */
function isForbidden(v: any): v is { role: "forbidden"; reason: string } {
  return v?.role === "forbidden";
}

/** Lazy-load Dropbox Sign SDK */
let SignatureRequestApi: any;
let EmbeddedApi: any;
let TemplateApi: any;
let dropboxApiKey = "";

async function loadDropbox() {
  if (SignatureRequestApi && EmbeddedApi && TemplateApi) return;
  const mod = await import("@dropbox/sign").catch(() => null);
  if (!mod) return;

  SignatureRequestApi = new mod.SignatureRequestApi();
  EmbeddedApi = new mod.EmbeddedApi();
  TemplateApi = new mod.TemplateApi();

  dropboxApiKey = process.env.DROPBOX_SIGN_API_KEY || "";
  if (dropboxApiKey) {
    SignatureRequestApi.username = dropboxApiKey;
    EmbeddedApi.username = dropboxApiKey;
    TemplateApi.username = dropboxApiKey;
  }
}

/** Better Dropbox error parsing */
function parseDropboxError(e: any) {
  const status =
    e?.status ??
    e?.response?.status ??
    e?.response?.statusCode ??
    e?.statusCode ??
    500;

  // SDK usually supplies response.text or response.body
  const text =
    typeof e?.response?.text === "string" ? e.response.text :
    typeof e?.text === "string" ? e.text :
    typeof e?.message === "string" ? e.message : "";

  let body = e?.response?.body ?? null;
  if (!body && text) {
    try { body = JSON.parse(text); } catch { /* ignore */ }
  }

  const err = body?.error || body?.errors?.[0] || body || {};
  const name =
    err?.error_name ||
    err?.type ||
    (status === 401 || status === 403 ? "unauthorized" : "dropbox_sign_error");
  const message =
    err?.error_msg ||
    err?.message ||
    text ||
    "HTTP request failed";

  return { status, name, message, raw: body || text || e?.message || e };
}

/** Resolve signer email+name from Trade → User → Clerk → Transaction */
async function resolveSigner(trade: any, role: "seller" | "buyer") {
  const isSeller = role === "seller";

  // 1) Trade fields
  const tradeEmail =
    (isSeller ? trade.sellerEmail : trade.buyerEmail) ??
    (isSeller ? trade.sellerUserEmail : trade.buyerUserEmail) ??
    (isSeller ? trade.seller_contact_email : trade.buyer_contact_email) ??
    (isSeller ? trade.seller_user_email : trade.buyer_user_email) ??
    null;

  const tradeName =
    (isSeller ? trade.sellerName : trade.buyerName) ??
    (isSeller ? trade.sellerUserName : trade.buyerUserName) ??
    (isSeller ? trade.seller_contact_name : trade.buyer_contact_name) ??
    "";

  if (tradeEmail) return { email: tradeEmail, name: tradeName || "Signer" };

  // 2) User table
  const [sellerUser, buyerUser] = await Promise.all([
    trade.sellerUserId ? prisma.user.findUnique({ where: { id: trade.sellerUserId } }) : null,
    trade.buyerUserId ? prisma.user.findUnique({ where: { id: trade.buyerUserId } }) : null,
  ]);
  let u = (isSeller ? sellerUser : buyerUser) || null;
  let email = u?.email || null;
  let name = u?.name || tradeName || "";

  // 3) Clerk
  if ((!email || !name) && u?.clerkId) {
    try {
      const cl = await clerkClient.users.getUser(u.clerkId);
      name = name || cl.firstName || cl.username || name;
      const primary = cl.emailAddresses?.find(e => e.id === cl.primaryEmailAddressId)?.emailAddress;
      const firstAny = cl.emailAddresses?.[0]?.emailAddress;
      email = email || primary || firstAny || null;
    } catch { /* ignore */ }
  }
  if (email) return { email, name: name || "Signer" };

  // 4) Source Transaction
  if (trade.transactionId) {
    const txn = await prisma.transaction.findUnique({ where: { id: trade.transactionId } });
    if (txn) {
      email =
        (isSeller ? (txn as any).sellerEmail : (txn as any).buyerEmail) ??
        (isSeller ? (txn as any).seller_user_email : (txn as any).buyer_user_email) ??
        null;
      name =
        name ||
        (isSeller ? (txn as any).sellerName : (txn as any).buyerName) ||
        (isSeller ? (txn as any).seller_user_name : (txn as any).buyer_user_name) ||
        name;
    }
  }

  return { email: email ?? null, name: name || "Signer" };
}

/** Template signer roles (for validation) */
async function getTemplateSignerRoles(templateId: string): Promise<string[] | null> {
  if (!TemplateApi || !dropboxApiKey || !templateId) return null;
  try {
    const res = await TemplateApi.templateGet(templateId);
    const roles = res?.body?.template?.signer_roles?.map((r: any) => r?.name).filter(Boolean) || [];
    return roles.length ? roles : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    await loadDropbox();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || "";
    const debug = searchParams.get("debug") === "1";
    const token = searchParams.get("token") || "";

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const trade = await prisma.trade.findUnique({ where: { id } });
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Authorization
    const viewer = await getViewer(req as any, trade);
    if (isForbidden(viewer)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (viewer.role !== "seller" && viewer.role !== "buyer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const effectiveRole: "seller" | "buyer" = viewer.role;

    // Resolve signer
    const { email: signerEmail, name: signerName } = await resolveSigner(trade, effectiveRole);
    if (!signerEmail) {
      console.error("[sign-url] Missing signer email", {
        tradeId: trade.id, effectiveRole, tradeSellerUserId: trade.sellerUserId,
        tradeBuyerUserId: trade.buyerUserId, transactionId: trade.transactionId ?? null
      });
      return NextResponse.json({ error: "Missing signer email on trade" }, { status: 422 });
    }

    // Config
    const clientId = process.env.DROPBOX_SIGN_CLIENT_ID || "";
    const templateId = process.env.DROPBOX_SIGN_TEMPLATE_ID || "";
    const fileUrl = process.env.DROPBOX_SIGN_FILE_URL || "";
    const SELLER_ROLE = process.env.DROPBOX_SIGN_ROLE_SELLER || "seller";
    const BUYER_ROLE  = process.env.DROPBOX_SIGN_ROLE_BUYER  || "buyer";
    const targetRole = effectiveRole === "seller" ? SELLER_ROLE : BUYER_ROLE;

    const testMode =
      process.env.DROPBOX_SIGN_TEST_MODE === "1" ? 1 :
      (process.env.NODE_ENV !== "production" ? 1 : 0);

    if (debug) {
      const roles = templateId ? await getTemplateSignerRoles(templateId) : null;
      return NextResponse.json({
        ok: true,
        debug: {
          hasSdk: Boolean(SignatureRequestApi && EmbeddedApi),
          hasTemplateApi: Boolean(TemplateApi),
          apiKeyPresent: Boolean(dropboxApiKey),
          clientIdPresent: Boolean(clientId),
          templateId,
          fileUrlPresent: Boolean(fileUrl),
          effectiveRole,
          targetRole,
          templateRoles: roles,
          signer: { email: signerEmail, name: signerName },
          testMode,
        },
      });
    }

    // Hard error if SDK/ClientID missing (no fake URL here; we want a real signal)
    if (!SignatureRequestApi || !EmbeddedApi || !clientId || !dropboxApiKey) {
      return NextResponse.json(
        {
          error: "Dropbox Sign not configured",
          details: {
            hasSdk: Boolean(SignatureRequestApi && EmbeddedApi),
            apiKeyPresent: Boolean(dropboxApiKey),
            clientIdPresent: Boolean(clientId),
          },
        },
        { status: 500 }
      );
    }

    let signatureId: string | undefined;

    // Prefer template if provided
    if (templateId) {
      // Validate role against template if we can fetch roles
      const allowedRoles = await getTemplateSignerRoles(templateId);
      if (allowedRoles && !allowedRoles.includes(targetRole)) {
        return NextResponse.json(
          {
            error: "Template role mismatch",
            details: `Template expects roles: ${allowedRoles.join(", ")}, you passed "${targetRole}".`,
            hint: "Set DROPBOX_SIGN_ROLE_SELLER / DROPBOX_SIGN_ROLE_BUYER to match, or rename roles in the template.",
          },
          { status: 422 }
        );
      }

      try {
        const created = await SignatureRequestApi.signatureRequestCreateEmbeddedWithTemplate({
          client_id: clientId,
          template_id: templateId,
          subject: "Sign the Water Traders agreement",
          message: "Please review and sign.",
          signers: [
            {
              role: targetRole, // <- must match template's signer role exactly
              email_address: signerEmail,
              name: signerName,
            },
          ],
          test_mode: testMode,
        } as any);
        signatureId = created?.body?.signature_request?.signatures?.[0]?.signature_id;
      } catch (e: any) {
        const info = parseDropboxError(e);
        console.error("[sign-url] create-with-template failed", info);

        // Optional fallback to non-template if configured
        if (fileUrl) {
          try {
            const created = await SignatureRequestApi.signatureRequestCreateEmbedded({
              client_id: clientId,
              title: `Water Traders – Trade ${id}`,
              subject: "Sign the Water Traders agreement",
              message: "Please review and sign.",
              signers: [{ email_address: signerEmail, name: signerName, role: "signer" }],
              file_urls: [fileUrl],
              test_mode: testMode,
            } as any);
            signatureId = created?.body?.signature_request?.signatures?.[0]?.signature_id;
          } catch (e2: any) {
            const info2 = parseDropboxError(e2);
            console.error("[sign-url] create-embedded fallback failed", info2);
            return NextResponse.json(
              { error: info2.message, provider: "dropbox_sign", code: info2.name, status: info2.status },
              { status: info2.status || 502 }
            );
          }
        } else {
          return NextResponse.json(
            { error: info.message, provider: "dropbox_sign", code: info.name, status: info.status },
            { status: info.status || 502 }
          );
        }
      }
    } else if (fileUrl) {
      try {
        const created = await SignatureRequestApi.signatureRequestCreateEmbedded({
          client_id: clientId,
          title: `Water Traders – Trade ${id}`,
          subject: "Sign the Water Traders agreement",
          message: "Please review and sign.",
          signers: [{ email_address: signerEmail, name: signerName, role: "signer" }],
          file_urls: [fileUrl],
          test_mode: testMode,
        } as any);
        signatureId = created?.body?.signature_request?.signatures?.[0]?.signature_id;
      } catch (e: any) {
        const info = parseDropboxError(e);
        console.error("[sign-url] create-embedded failed", info);
        return NextResponse.json(
          { error: info.message, provider: "dropbox_sign", code: info.name, status: info.status },
          { status: info.status || 502 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "No template or fileUrl configured. Set DROPBOX_SIGN_TEMPLATE_ID or DROPBOX_SIGN_FILE_URL." },
        { status: 422 }
      );
    }

    if (!signatureId) {
      return NextResponse.json({ error: "Failed to create signature request" }, { status: 500 });
    }

    try {
      const embedded = await EmbeddedApi.embeddedSignUrl(signatureId);
      const signUrl = embedded?.body?.embedded?.sign_url;
      if (!signUrl) return NextResponse.json({ error: "Failed to get embedded URL" }, { status: 500 });
      return NextResponse.json({ url: signUrl });
    } catch (e: any) {
      const info = parseDropboxError(e);
      console.error("[sign-url] embeddedSignUrl failed", info);
      return NextResponse.json(
        { error: info.message, provider: "dropbox_sign", code: info.name, status: info.status },
        { status: info.status || 502 }
      );
    }
  } catch (e: any) {
    console.error("[sign-url] error", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
