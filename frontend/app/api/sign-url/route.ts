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

/** Template meta (signer roles, CC roles, merge fields) */
async function getTemplateMeta(templateId: string): Promise<{
  signerRoles: string[]; ccRoles: string[]; mergeFieldNames: string[];
} | null> {
  if (!TemplateApi || !dropboxApiKey || !templateId) return null;
  try {
    const res = await TemplateApi.templateGet(templateId);
    const tpl: any = res?.body?.template ?? null;
    const signerRoles =
      tpl?.signerRoles?.map((r: any) => r?.name).filter(Boolean) ??
      tpl?.signer_roles?.map((r: any) => r?.name).filter(Boolean) ?? [];
    const ccRoles =
      tpl?.ccRoles?.map((r: any) => r?.role).filter(Boolean) ??
      tpl?.cc_roles?.map((r: any) => r?.role).filter(Boolean) ?? [];
    const mergeFieldNames =
      tpl?.mergeFields?.map((f: any) => f?.name).filter(Boolean) ??
      tpl?.merge_fields?.map((f: any) => f?.name).filter(Boolean) ?? [];
    return { signerRoles, ccRoles, mergeFieldNames };
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

    // AuthZ
    const viewer = await getViewer(req as any, trade as any);
    if (isForbidden(viewer)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (viewer.role !== "seller" && viewer.role !== "buyer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const effectiveRole: "seller" | "buyer" = viewer.role;

    // Resolve BOTH signers; templates require all signer roles
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

    // Template meta
    const meta = templateId ? await getTemplateMeta(templateId) : null;
    const tplRoles = meta?.signerRoles ?? null;

    // Map to template’s exact role names
    const mapRole = (want: "seller" | "buyer") => {
      const desired = want === "seller" ? ENV_SELLER : ENV_BUYER;
      if (!tplRoles?.length) return desired;
      return (
        tplRoles.find(r => r === desired) ||
        tplRoles.find(r => r.toLowerCase() === want) ||
        tplRoles.find(r => r.toLowerCase().includes(want)) ||
        desired
      );
    };
    const sellerRoleName = mapRole("seller");
    const buyerRoleName  = mapRole("buyer");
    const targetRole     = effectiveRole === "seller" ? sellerRoleName : buyerRoleName;

    // Two-signer payload
    const signersPayload = [
      { role: sellerRoleName, email_address: seller.email, name: seller.name },
      { role: buyerRoleName,  email_address: buyer.email,  name: buyer.name  },
    ];

    // CC roles (if any) → pull emails from env
    //   e.g. DROPBOX_SIGN_CC_<ROLE>=email@example.com or fallback DROPBOX_SIGN_CC_DEFAULT
    const ccRoles = meta?.ccRoles ?? [];
    const ccEmailsByRole = Object.fromEntries(
      ccRoles.map((role) => {
        const key = `DROPBOX_SIGN_CC_${role.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
        const email =
          process.env[key] ||
          process.env.DROPBOX_SIGN_CC_DEFAULT ||
          "";
        return [role, email];
      })
    );
    const missingCc = Object.entries(ccEmailsByRole).filter(([, email]) => !email).map(([r]) => r);
    const ccsPayload = Object.entries(ccEmailsByRole)
      .filter(([, email]) => !!email)
      .map(([role, email]) => ({ role, email_address: email as string }));

    if (!debug && missingCc.length && testMode !== 1) {
      return NextResponse.json(
        {
          error: "Missing CC emails for template roles",
          details: { missingCc, hint: `Set DROPBOX_SIGN_CC_${missingCc[0].toUpperCase()} or DROPBOX_SIGN_CC_DEFAULT` }
        },
        { status: 422 }
      );
    }

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
          templateRoles: tplRoles,
          ccRoles,
          targetRole,
          signersPayload,
          ccsPayload,
          signerForViewer: targetRole === sellerRoleName ? { email: seller.email, name: seller.name } : { email: buyer.email, name: buyer.name },
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

    if (templateId) {
      // If we know template roles and targetRole isn't included, fail early
      if (tplRoles && !tplRoles.includes(targetRole)) {
        return NextResponse.json(
          {
            error: "Template role mismatch",
            details: `Template expects roles: ${tplRoles.join(", ")}, you passed "${targetRole}".`,
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
          signers: signersPayload,             // ⬅️ BOTH signers
          ...(ccsPayload.length ? { ccs: ccsPayload } : {}),
          test_mode: testMode,
        } as any);

        const sigs: any[] = created?.body?.signature_request?.signatures ?? [];
        signatureId =
          sigs.find((s: any) => (s?.signer_role || s?.role) === targetRole)?.signature_id ||
          sigs[0]?.signature_id;
      } catch (e: any) {
        const info = parseDropboxError(e);
        console.error("[sign-url] create-with-template failed", info);
        return NextResponse.json(
          { error: info.message, provider: "dropbox_sign", code: info.name, status: info.status, raw: info.raw ?? null },
          { status: info.status || 502 }
        );
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
