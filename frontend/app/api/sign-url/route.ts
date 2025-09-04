// app/api/sign-url/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTradeFromAnyIdOrCreate, getViewer } from "@/lib/trade";
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

/** Template signer roles (supports camelCase & snake_case) */
async function getTemplateSignerRoles(templateId: string): Promise<string[] | null> {
  if (!TemplateApi || !dropboxApiKey || !templateId) return null;
  try {
    const res = await TemplateApi.templateGet(templateId);
    const tpl: any = res?.body?.template ?? null;
    const roles =
      tpl?.signerRoles?.map((r: any) => r?.name).filter(Boolean) ??
      tpl?.signer_roles?.map((r: any) => r?.name).filter(Boolean) ??
      [];
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

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Accept Trade.id OR Transaction.id; create Trade if missing
    const trade = await ensureTradeFromAnyIdOrCreate(id);
    if (!trade) {
      return NextResponse.json(
        { error: "Not found", details: "No Trade or Transaction with this id" },
        { status: 404 }
      );
    }

    // AuthZ (viewer derived from auth or token in query/header)
    const viewer = await getViewer(req as any, trade as any);
    if (isForbidden(viewer)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (viewer.role !== "seller" && viewer.role !== "buyer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const effectiveRole: "seller" | "buyer" = viewer.role;

    // Resolve BOTH signers (templates require all roles)
    const sellerResolved = await resolveSigner(trade, "seller");
    const buyerResolved  = await resolveSigner(trade, "buyer");
    const fallbackEmail = `no-email+${trade.id}@example.com`;
    const seller = { email: sellerResolved.email || fallbackEmail, name: sellerResolved.name || "Seller" };
    const buyer  = { email: buyerResolved.email  || fallbackEmail, name: buyerResolved.name  || "Buyer"  };

    // Config
    const clientId   = process.env.DROPBOX_SIGN_CLIENT_ID || "";
    const templateId = process.env.DROPBOX_SIGN_TEMPLATE_ID || "";
    const fileUrl    = process.env.DROPBOX_SIGN_FILE_URL || "";
    const ENV_SELLER = process.env.DROPBOX_SIGN_ROLE_SELLER || "seller";
    const ENV_BUYER  = process.env.DROPBOX_SIGN_ROLE_BUYER  || "buyer";

    const testMode =
      process.env.DROPBOX_SIGN_TEST_MODE === "1" ? 1 :
      (process.env.NODE_ENV !== "production" ? 1 : 0);

    // Map seller/buyer to template's exact role names (when available)
    const rolesFromTpl = templateId ? await getTemplateSignerRoles(templateId) : null;
    const pickRole = (want: "seller" | "buyer") => {
      const desired = want === "seller" ? ENV_SELLER : ENV_BUYER;
      if (!rolesFromTpl?.length) return desired;
      const exact = rolesFromTpl.find(r => r === desired);
      if (exact) return exact;
      const ci = rolesFromTpl.find(r => r.toLowerCase() === want);
      if (ci) return ci;
      const sub = rolesFromTpl.find(r => r.toLowerCase().includes(want));
      return sub || desired;
    };
    const sellerRoleName = pickRole("seller");
    const buyerRoleName  = pickRole("buyer");
    const targetRole     = effectiveRole === "seller" ? sellerRoleName : buyerRoleName;

    // Two-signer payload for template requests
    const signersPayload = [
      { role: sellerRoleName, email_address: seller.email, name: seller.name },
      { role: buyerRoleName,  email_address: buyer.email,  name: buyer.name  },
    ];

    if (debug) {
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
          templateRoles: rolesFromTpl ?? null,
          // helpful to confirm we're sending BOTH signers:
          signersPayload,
          signer: targetRole === sellerRoleName ? { email: seller.email, name: seller.name } : { email: buyer.email, name: buyer.name },
          testMode,
          tradeId: trade.id,
          tradeStatus: trade.status,
        },
      });
    }

    // Hard error if SDK/ClientID missing
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
      // If we know template roles and targetRole isn't included, fail early
      if (rolesFromTpl && !rolesFromTpl.includes(targetRole)) {
        return NextResponse.json(
          {
            error: "Template role mismatch",
            details: `Template expects roles: ${rolesFromTpl.join(", ")}, you passed "${targetRole}".`,
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
          // ⬇️ IMPORTANT: send BOTH signers for multi-role templates
          signers: signersPayload,
          test_mode: testMode,
        } as any);

        const sigs: any[] = created?.body?.signature_request?.signatures ?? [];
        signatureId =
          sigs.find((s: any) => (s?.signer_role || s?.role) === targetRole)?.signature_id ||
          sigs[0]?.signature_id;
      } catch (e: any) {
        const info = parseDropboxError(e);
        console.error("[sign-url] create-with-template failed", info);

        // Optional fallback to non-template if configured
        if (fileUrl) {
          try {
            const created = await SignatureRequestApi.signatureRequestCreateEmbedded({
              client_id: clientId,
              title: `Water Traders – Trade ${trade.id}`,
              subject: "Sign the Water Traders agreement",
              message: "Please review and sign.",
              signers: [{
                email_address: effectiveRole === "seller" ? seller.email : buyer.email,
                name:        effectiveRole === "seller" ? seller.name  : buyer.name,
                role: "signer",
              }],
              file_urls: [fileUrl],
              test_mode: testMode,
            } as any);
            signatureId = created?.body?.signature_request?.signatures?.[0]?.signature_id;
          } catch (e2: any) {
            const info2 = parseDropboxError(e2);
            console.error("[sign-url] create-embedded fallback failed", info2);
            return NextResponse.json(
              { error: info2.message, provider: "dropbox_sign", code: info2.name, status: info2.status, raw: info2.raw ?? null },
              { status: info2.status || 502 }
            );
          }
        } else {
          return NextResponse.json(
            { error: info.message, provider: "dropbox_sign", code: info.name, status: info.status, raw: info.raw ?? null },
            { status: info.status || 502 }
          );
        }
      }
    } else if (fileUrl) {
      // No template configured — simple embedded with file_url
      try {
        const created = await SignatureRequestApi.signatureRequestCreateEmbedded({
          client_id: clientId,
          title: `Water Traders – Trade ${trade.id}`,
          subject: "Sign the Water Traders agreement",
          message: "Please review and sign.",
          signers: [{
            email_address: effectiveRole === "seller" ? seller.email : buyer.email,
            name:        effectiveRole === "seller" ? seller.name  : buyer.name,
            role: "signer",
          }],
          file_urls: [fileUrl],
          test_mode: testMode,
        } as any);
        signatureId = created?.body?.signature_request?.signatures?.[0]?.signature_id;
      } catch (e: any) {
        const info = parseDropboxError(e);
        console.error("[sign-url] create-embedded failed", info);
        return NextResponse.json(
          { error: info.message, provider: "dropbox_sign", code: info.name, status: info.status, raw: info.raw ?? null },
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
      // Include testMode so client can decide skipDomainVerification
      return NextResponse.json({ url: signUrl, testMode });
    } catch (e: any) {
      const info = parseDropboxError(e);
      console.error("[sign-url] embeddedSignUrl failed", info);
      return NextResponse.json(
        { error: info.message, provider: "dropbox_sign", code: info.name, status: info.status, raw: info.raw ?? null },
        { status: info.status || 502 }
      );
    }
  } catch (e: any) {
    console.error("[sign-url] error", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
