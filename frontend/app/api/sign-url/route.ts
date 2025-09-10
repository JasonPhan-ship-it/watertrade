// app/api/sign-url/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTradeFromAnyIdOrCreate, getViewer } from "@/lib/trade";
import { clerkClient } from "@clerk/nextjs/server";
import * as DropboxSign from "@dropbox/sign";

/* --------------------- helpers --------------------- */

function isForbidden(v: any): v is { role: "forbidden"; reason: string } {
  return v?.role === "forbidden";
}

const DBX_BASE = process.env.DROPBOX_SIGN_BASE_URL || "https://api.hellosign.com/v3";
function dbxAuthHeader(apiKey: string) {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}

function parseDropboxError(e: any) {
  const status =
    e?.status ?? e?.response?.status ?? e?.response?.statusCode ?? e?.statusCode ?? 500;

  const texts = [e?.response?.text, e?.text, e?.message].filter((x) => typeof x === "string" && x);
  let body = e?.response?.body ?? null;
  for (const t of texts) {
    if (!body) {
      try { body = JSON.parse(t as string); } catch {}
    }
  }

  const err = body?.error || body?.errors?.[0] || body || {};
  const name =
    err?.error_name ||
    err?.type ||
    (status === 401 || status === 403 ? "unauthorized" : "dropbox_sign_error");
  const message = err?.error_msg || err?.message || texts[0] || "HTTP request failed";

  return { status, name, message, raw: body || texts[0] || e?.message || e };
}

async function resolveSigner(trade: any, role: "seller" | "buyer") {
  const isSeller = role === "seller";

  // 1) try trade fields first
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

  // 2) user table
  const [sellerUser, buyerUser] = await Promise.all([
    trade.sellerUserId ? prisma.user.findUnique({ where: { id: trade.sellerUserId } }) : null,
    trade.buyerUserId ? prisma.user.findUnique({ where: { id: trade.buyerUserId } }) : null,
  ]);
  let u = (isSeller ? sellerUser : buyerUser) || null;
  let email = u?.email || null;
  let name = u?.name || tradeName || "";

  // 3) clerk
  if ((!email || !name) && u?.clerkId) {
    try {
      const cl = await clerkClient.users.getUser(u.clerkId);
      name = name || cl.firstName || cl.username || name;
      const primary = cl.emailAddresses?.find((e) => e.id === cl.primaryEmailAddressId)?.emailAddress;
      const firstAny = cl.emailAddresses?.[0]?.emailAddress;
      email = email || primary || firstAny || null;
    } catch {}
  }
  if (email) return { email, name: name || "Signer" };

  // 4) source transaction as last resort
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

function plusAlias(email: string, tag: string) {
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const [local, domain] = parts;
  const base = local.split("+")[0];
  return `${base}+${tag}@${domain}`;
}

async function getTemplateMeta(templateId: string, apiKey: string) {
  // Use SDK just to fetch template meta (no Configuration class used)
  const templateApi = new DropboxSign.TemplateApi();
  (templateApi as any).username = apiKey;
  try {
    const res = await templateApi.templateGet(templateId as any);
    const tpl: any = res?.body?.template ?? null;
    const signerRoles =
      tpl?.signerRoles?.map((r: any) => r?.name).filter(Boolean) ??
      tpl?.signer_roles?.map((r: any) => r?.name).filter(Boolean) ??
      [];
    const ccRoles =
      tpl?.ccRoles?.map((r: any) => r?.role).filter(Boolean) ??
      tpl?.cc_roles?.map((r: any) => r?.role).filter(Boolean) ??
      [];
    const mergeFields =
      tpl?.mergeFields?.map((f: any) => ({ name: f?.name, required: f?.required }))?.filter((f: any) => !!f.name) ??
      tpl?.merge_fields?.map((f: any) => ({ name: f?.name, required: f?.required }))?.filter((f: any) => !!f.name) ??
      [];
    return { signerRoles, ccRoles, mergeFields };
  } catch {
    return { signerRoles: [], ccRoles: [], mergeFields: [] };
  }
}

function buildCustomFields(
  mergeFields: Array<{ name: string; required?: boolean }>,
  trade: any,
  seller: { email: string; name: string },
  buyer: { email: string; name: string }
) {
  if (!mergeFields?.length) return [];
  const valFor = (name: string) => {
    const n = name.toLowerCase();
    if (n === "trade_id" || n === "tradeid") return trade.id || "";
    if (n === "transaction_id" || n === "transactionid") return trade.transactionId || "";
    if (n === "listing_id" || n === "listingid") return trade.listingId || "";
    if (n === "district") return trade.district || "";
    if (n === "water_type" || n === "watertype") return trade.waterType || "";
    if (n === "price_per_af" || n === "price" || n === "price_usd_af") {
      return typeof trade.pricePerAf === "number" ? (trade.pricePerAf / 100).toFixed(2) : "";
    }
    if (n === "volume_af" || n === "volume" || n === "acre_feet") {
      return typeof trade.volumeAf === "number" ? String(trade.volumeAf) : "";
    }
    if (n === "seller_name") return seller.name || "";
    if (n === "seller_email") return seller.email || "";
    if (n === "buyer_name") return buyer.name || "";
    if (n === "buyer_email") return buyer.email || "";
    return "";
  };
  return mergeFields.map(({ name }) => ({ name, value: String(valFor(name) || "") || "-" }));
}

/* --------------------- route --------------------- */

export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.DROPBOX_SIGN_API_KEY || "";
    const clientId = process.env.DROPBOX_SIGN_CLIENT_ID || "";
    const templateId = process.env.DROPBOX_SIGN_TEMPLATE_ID || "";
    const fileUrl = process.env.DROPBOX_SIGN_FILE_URL || ""; // optional fallback (no template)
    const ENV_SELLER = process.env.DROPBOX_SIGN_ROLE_SELLER || "SELLER";
    const ENV_BUYER = process.env.DROPBOX_SIGN_ROLE_BUYER || "BUYER";
    const testMode =
      process.env.DROPBOX_SIGN_TEST_MODE === "1" ? 1 : (process.env.NODE_ENV !== "production" ? 1 : 0);

    if (!apiKey || !clientId) {
      return NextResponse.json(
        { error: "Dropbox Sign not configured (API key / Client ID missing)" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || "";
    const debug = searchParams.get("debug") === "1";

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // trade + viewer
    const trade = await ensureTradeFromAnyIdOrCreate(id);
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const viewer = await getViewer(req as any, trade as any);
    if (isForbidden(viewer)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (viewer.role !== "seller" && viewer.role !== "buyer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const effectiveRole: "seller" | "buyer" = viewer.role;

    // both signers
    const sellerResolved = await resolveSigner(trade, "seller");
    const buyerResolved = await resolveSigner(trade, "buyer");
    const fallbackEmail = `no-email+${trade.id}@example.com`;
    const seller = { email: sellerResolved.email || fallbackEmail, name: sellerResolved.name || "Seller" };
    const buyer = { email: buyerResolved.email || fallbackEmail, name: buyerResolved.name || "Buyer" };

    // ensure distinct emails
    if (seller.email.toLowerCase() === buyer.email.toLowerCase()) {
      buyer.email = plusAlias(buyer.email, `buyer.${trade.id.slice(-6)}`);
    }

    // template meta
    const meta = templateId ? await getTemplateMeta(templateId, apiKey) : { signerRoles: [], ccRoles: [], mergeFields: [] };
    const tplRoles = meta.signerRoles;

    // map role strings to template
    const mapRole = (want: "seller" | "buyer") => {
      const desired = want === "seller" ? ENV_SELLER : ENV_BUYER;
      if (!tplRoles.length) return desired;
      const exact = tplRoles.find((r) => r === desired);
      if (exact) return exact;
      const ci = tplRoles.find((r) => r.toLowerCase() === want);
      if (ci) return ci;
      const sub = tplRoles.find((r) => r.toLowerCase().includes(want));
      return sub || desired;
    };

    const sellerRoleName = mapRole("seller");
    const buyerRoleName = mapRole("buyer");
    const targetRole = effectiveRole === "seller" ? sellerRoleName : buyerRoleName;

    const signersPayload = [
      { role: sellerRoleName, email_address: seller.email, name: seller.name },
      { role: buyerRoleName, email_address: buyer.email, name: buyer.name },
    ];

    // CCs (optional via env: DROPBOX_SIGN_CC_<ROLE>=email or DROPBOX_SIGN_CC_DEFAULT)
    const ccEmailsByRole = Object.fromEntries(
      (meta.ccRoles || []).map((role) => {
        const key = `DROPBOX_SIGN_CC_${role.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
        const email = process.env[key] || process.env.DROPBOX_SIGN_CC_DEFAULT || "";
        return [role, email];
      })
    );
    const ccsPayload = Object.entries(ccEmailsByRole)
      .filter(([, email]) => !!email)
      .map(([role, email]) => ({ role, email_address: email as string }));

    const customFields = buildCustomFields(meta.mergeFields || [], trade, seller, buyer);

    if (debug) {
      return NextResponse.json({
        ok: true,
        debug: {
          hasSdk: true,
          apiKeyPresent: true,
          clientIdPresent: true,
          templateId,
          fileUrlPresent: !!fileUrl,
          templateRoles: tplRoles,
          ccRoles: meta.ccRoles,
          mergeFields: meta.mergeFields,
          targetRole,
          signersPayload,
          emailsDistinct: seller.email.toLowerCase() !== buyer.email.toLowerCase(),
          ccsPayload,
          customFields,
          signerForViewer:
            targetRole === sellerRoleName ? { email: seller.email, name: seller.name } : { email: buyer.email, name: buyer.name },
          testMode,
          tradeId: trade.id,
          tradeStatus: trade.status,
        },
      });
    }

    /* ----------------- Create request ----------------- */
    let signatureId: string | undefined;

    if (templateId) {
      // REST: /signature_request/create_embedded_with_template
      const form = new URLSearchParams();
      form.set("client_id", clientId);
      form.set("test_mode", String(testMode ? 1 : 0));
      form.append("template_ids[]", templateId);
      signersPayload.forEach((s, i) => {
        form.set(`signers[${i}][role]`, s.role);
        form.set(`signers[${i}][email_address]`, s.email_address);
        form.set(`signers[${i}][name]`, s.name);
      });
      ccsPayload.forEach((c, j) => {
        form.set(`ccs[${j}][role]`, c.role);
        form.set(`ccs[${j}][email_address]`, c.email_address);
      });
      if (customFields.length) {
        form.set("custom_fields", JSON.stringify(customFields));
      }

      const createResp = await fetch(`${DBX_BASE}/signature_request/create_embedded_with_template`, {
        method: "POST",
        headers: {
          Authorization: dbxAuthHeader(apiKey),
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        body: form.toString(),
      });

      const createText = await createResp.text();
      let createBody: any = null;
      try { createBody = createText ? JSON.parse(createText) : null; } catch {}

      if (!createResp.ok) {
        const name = createBody?.error?.error_name || "dropbox_sign_error";
        const msg = createBody?.error?.error_msg || "HTTP request failed";
        return NextResponse.json(
          { error: msg, provider: "dropbox_sign", code: name, status: createResp.status, raw: createBody ?? createText ?? null },
          { status: createResp.status || 502 }
        );
      }

      const signatures: any[] =
        createBody?.signature_request?.signatures ||
        createBody?.signatureRequest?.signatures ||
        [];

      signatureId =
        signatures.find((s: any) =>
          (s?.signer_role || s?.role || "").toString().toLowerCase() === targetRole.toLowerCase()
        )?.signature_id || signatures[0]?.signature_id;

      if (!signatureId) {
        return NextResponse.json(
          { error: "No signature_id returned by Dropbox Sign", raw: createBody ?? createText ?? null },
          { status: 502 }
        );
      }
    } else if (fileUrl) {
      // simple embedded with file (SDK is OK)
      const sigApi = new DropboxSign.SignatureRequestApi();
      (sigApi as any).username = apiKey;
      const created = await sigApi.signatureRequestCreateEmbedded({
        client_id: clientId,
        title: `Water Traders – Trade ${trade.id}`,
        subject: "Sign the Water Traders agreement",
        message: "Please review and sign.",
        signers: [{
          email_address: effectiveRole === "seller" ? seller.email : buyer.email,
          name:          effectiveRole === "seller" ? seller.name  : buyer.name,
          role: "signer",
        }],
        file_urls: [fileUrl],
        test_mode: testMode,
      } as any);
      signatureId = created?.body?.signature_request?.signatures?.[0]?.signature_id;
      if (!signatureId) {
        return NextResponse.json({ error: "No signature_id returned by Dropbox Sign" }, { status: 502 });
      }
    } else {
      return NextResponse.json(
        { error: "No template or fileUrl configured. Set DROPBOX_SIGN_TEMPLATE_ID or DROPBOX_SIGN_FILE_URL." },
        { status: 422 }
      );
    }

    /* ----------------- Embedded URL ----------------- */
    const embeddedApi = new DropboxSign.EmbeddedApi();
    (embeddedApi as any).username = apiKey;

    const embedded = await embeddedApi.embeddedSignUrl(signatureId);
    const signUrl = embedded?.body?.embedded?.sign_url;
    if (!signUrl) return NextResponse.json({ error: "Failed to get embedded URL" }, { status: 500 });

    return NextResponse.json({ url: signUrl, testMode });
  } catch (e: any) {
    const info = parseDropboxError(e);
    console.error("[sign-url] error", info);
    return NextResponse.json(
      { error: info.message, provider: "dropbox_sign", code: info.name, status: info.status, raw: info.raw ?? null },
      { status: info.status || 500 }
    );
  }
}
