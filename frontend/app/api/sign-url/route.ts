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

/** Lazy-load Dropbox Sign SDK so builds work even if the package/env aren’t present locally */
let SignatureRequestApi: any;
let EmbeddedApi: any;
let TemplateApi: any;
let dropboxApiKey = "";

async function loadDropbox() {
  if (SignatureRequestApi && EmbeddedApi && TemplateApi) return;
  try {
    const mod = await import("@dropbox/sign");
    SignatureRequestApi = new mod.SignatureRequestApi();
    EmbeddedApi = new mod.EmbeddedApi();
    TemplateApi = new mod.TemplateApi();

    dropboxApiKey = process.env.DROPBOX_SIGN_API_KEY || "";
    SignatureRequestApi.username = dropboxApiKey;
    EmbeddedApi.username = dropboxApiKey;
    TemplateApi.username = dropboxApiKey;
  } catch {
    console.warn("[sign-url] @dropbox/sign not installed or API key missing.");
  }
}

/** Best-effort extraction of Dropbox Sign error details */
function parseDropboxError(e: any) {
  // The SDK often exposes e.response?.text (stringified JSON), sometimes e.body or e.message
  try {
    const status =
      e?.status ??
      e?.response?.status ??
      e?.response?.statusCode ??
      e?.statusCode ??
      500;

    const text =
      typeof e?.response?.text === "string" ? e.response.text :
      typeof e?.text === "string" ? e.text :
      typeof e?.message === "string" ? e.message :
      "";

    let parsed: any;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }

    const err = parsed?.error || parsed?.errors?.[0] || parsed;
    const name =
      err?.error_name ||
      err?.type ||
      (status === 401 || status === 403 ? "unauthorized" : "dropbox_sign_error");
    const message =
      err?.error_msg ||
      err?.message ||
      text ||
      "HTTP request failed";

    return { status, name, message, raw: text || err || e };
  } catch {
    return { status: 500, name: "dropbox_sign_error", message: "HTTP request failed" };
  }
}

/** Resolve signer email+name from Trade → User → Clerk → Transaction */
async function resolveSigner(
  trade: any,
  effectiveRole: "seller" | "buyer"
): Promise<{ email: string | null; name: string }> {
  const isSeller = effectiveRole === "seller";

  // 1) Trade fields (try several common variants)
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

  // 2) Local User table
  const [sellerUser, buyerUser] = await Promise.all([
    trade.sellerUserId ? prisma.user.findUnique({ where: { id: trade.sellerUserId } }) : null,
    trade.buyerUserId ? prisma.user.findUnique({ where: { id: trade.buyerUserId } }) : null,
  ]);
  let fallbackUser = (isSeller ? sellerUser : buyerUser) || null;
  let userEmail = fallbackUser?.email || null;
  let userName = fallbackUser?.name || tradeName || "";

  // 3) Clerk (if user has clerkId)
  if ((!userEmail || !userName) && fallbackUser?.clerkId) {
    try {
      const cl = await clerkClient.users.getUser(fallbackUser.clerkId);
      userName = userName || cl.firstName || cl.username || userName;
      const primary = cl.emailAddresses?.find(e => e.id === cl.primaryEmailAddressId)?.emailAddress;
      const firstAny = cl.emailAddresses?.[0]?.emailAddress;
      userEmail = userEmail || primary || firstAny || null;
    } catch {
      /* ignore */
    }
  }
  if (userEmail) return { email: userEmail, name: userName || "Signer" };

  // 4) Source Transaction
  if (trade.transactionId) {
    const txn = await prisma.transaction.findUnique({ where: { id: trade.transactionId } });
    if (txn) {
      const txnEmail =
        (isSeller ? (txn as any).sellerEmail : (txn as any).buyerEmail) ??
        (isSeller ? (txn as any).seller_user_email : (txn as any).buyer_user_email) ??
        null;
      const txnName =
        (isSeller ? (txn as any).sellerName : (txn as any).buyerName) ??
        (isSeller ? (txn as any).seller_user_name : (txn as any).buyer_user_name) ??
        userName;

      if (txnEmail) return { email: txnEmail, name: (txnName || "Signer") as string };
    }
  }

  return { email: null, name: userName || "Signer" };
}

/** (Optional) read signer roles from a template so we can validate before calling create */
async function getTemplateSignerRoles(templateId: string): Promise<string[] | null> {
  if (!TemplateApi || !dropboxApiKey || !templateId) return null;
  try {
    const res = await TemplateApi.templateGet(templateId);
    const roles = res?.body?.template?.signer_roles?.map((r: any) => r?.name).filter(Boolean) || [];
    return roles.length ? roles : null;
  } catch (e) {
    // Non-fatal; just skip role introspection
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    await loadDropbox();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || "";
    const roleParam = (searchParams.get("role") || "").toLowerCase();
    const token = searchParams.get("token") || "";

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const trade = await prisma.trade.findUnique({ where: { id } });
    if (!trade) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Authorization
    const viewer = await getViewer(req as any, trade);
    if (isForbidden(viewer)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (viewer.role !== "seller" && viewer.role !== "buyer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const effectiveRole: "seller" | "buyer" = viewer.role;

    // Resolve signer
    const { email: signerEmail, name: signerName } = await resolveSigner(trade, effectiveRole);
    if (!signerEmail) {
      console.error("[sign-url] Missing signer email", {
        tradeId: trade.id,
        effectiveRole,
        tradeSellerUserId: trade.sellerUserId,
        tradeBuyerUserId: trade.buyerUserId,
        transactionId: trade.transactionId ?? null,
        note: "Checked Trade fields, User table, Clerk, and Transaction.",
      });
      return NextResponse.json({ error: "Missing signer email on trade" }, { status: 422 });
    }

    // Dev-safe fallback
    const clientId = process.env.DROPBOX_SIGN_CLIENT_ID || "";
    if (!SignatureRequestApi || !clientId) {
      const fake = `https://example.com/fake-dropbox-sign?trade=${encodeURIComponent(
        id
      )}&role=${encodeURIComponent(effectiveRole)}&token=${encodeURIComponent(
        token
      )}&roleParam=${encodeURIComponent(roleParam)}`;
      return NextResponse.json({ url: fake });
    }

    const templateId = process.env.DROPBOX_SIGN_TEMPLATE_ID || "";
    const fileUrl = process.env.DROPBOX_SIGN_FILE_URL || "";
    const testMode = process.env.NODE_ENV !== "production" ? 1 : 0;

    let signatureId: string | undefined;

    if (templateId) {
      // Validate signer role against template roles (if we can read them)
      const allowedRoles = await getTemplateSignerRoles(templateId);
      const targetRole = effectiveRole === "seller" ? "seller" : "buyer"; // CHANGE if your template uses different names

      if (allowedRoles && !allowedRoles.includes(targetRole)) {
        return NextResponse.json(
          {
            error: "Template role mismatch",
            details: `Template ${templateId} expects roles: ${allowedRoles.join(", ")}; you passed "${targetRole}".`,
            hint: "Update the role string in /api/sign-url or rename the signer role in the template.",
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
              role: targetRole, // must match your template's signer role name
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
        return NextResponse.json(
          { error: info.message, provider: "dropbox_sign", code: info.name, status: info.status },
          { status: info.status || 502 }
        );
      }
    } else {
      try {
        const created = await SignatureRequestApi.signatureRequestCreateEmbedded({
          client_id: clientId,
          title: `Water Traders – Trade ${id}`,
          subject: "Sign the Water Traders agreement",
          message: "Please review and sign.",
          signers: [
            {
              email_address: signerEmail,
              name: signerName,
              role: "signer",
            },
          ],
          ...(fileUrl ? { file_urls: [fileUrl] } : {}),
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
    }

    if (!signatureId) {
      return NextResponse.json(
        { error: "Failed to create signature request" },
        { status: 500 }
      );
    }

    try {
      const embedded = await EmbeddedApi.embeddedSignUrl(signatureId);
      const signUrl = embedded?.body?.embedded?.sign_url;

      if (!signUrl) {
        return NextResponse.json(
          { error: "Failed to get embedded URL" },
          { status: 500 }
        );
      }

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
    return NextResponse.json(
      { error: e?.message || "Internal error" },
      { status: 500 }
    );
  }
}
