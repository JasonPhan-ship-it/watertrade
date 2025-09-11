// app/api/sign-url/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTradeFromAnyIdOrCreate, getViewer } from "@/lib/trade";
import { auth, clerkClient } from "@clerk/nextjs/server";

/* ---------------- small helpers ---------------- */
function isForbidden(v: any): v is { role: "forbidden"; reason: string } {
  return v?.role === "forbidden";
}
function plusAlias(email: string, tag: string) {
  const parts = String(email || "").split("@");
  if (parts.length !== 2) return email;
  const [local, domain] = parts;
  const base = local.split("+")[0];
  return `${base}+${tag}@${domain}`;
}
function mask(s: string) {
  return s ? `${s.slice(0, 6)}…${s.slice(-6)}` : "";
}
function maskEmail(e?: string | null) {
  if (!e) return "";
  const [local, domain = ""] = e.split("@");
  if (!local) return e;
  return `${local[0] ?? ""}…@${domain}`;
}

/* ---------------- Dropbox Sign SDK (lazy) ---------------- */
let SignatureRequestApi: any;
let EmbeddedApi: any;
let TemplateApi: any;
let ApiAppApi: any;
let AccountApi: any;
let dropboxApiKey = "";

async function loadDropbox() {
  if (SignatureRequestApi && EmbeddedApi && TemplateApi && ApiAppApi && AccountApi) return;
  const mod = await import("@dropbox/sign").catch(() => null);
  if (!mod) return;

  SignatureRequestApi = new mod.SignatureRequestApi();
  EmbeddedApi = new mod.EmbeddedApi();
  TemplateApi = new mod.TemplateApi();
  ApiAppApi = new mod.ApiAppApi();
  AccountApi = new mod.AccountApi();

  dropboxApiKey = process.env.DROPBOX_SIGN_API_KEY || "";
  if (dropboxApiKey) {
    SignatureRequestApi.username = dropboxApiKey;
    EmbeddedApi.username = dropboxApiKey;
    TemplateApi.username = dropboxApiKey;
    ApiAppApi.username = dropboxApiKey;
    AccountApi.username = dropboxApiKey;
  }
}

/* ---------------- REST config (template create) ---------------- */
const DBX_BASE = process.env.DROPBOX_SIGN_BASE_URL || "https://api.hellosign.com/v3";
function dbxAuthHeader(apiKey: string) {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}

/* ---------------- error normalizer ---------------- */
function parseDropboxError(e: any) {
  const status =
    e?.status ?? e?.response?.status ?? e?.response?.statusCode ?? e?.statusCode ?? 500;

  const texts = [
    e?.response?.text,
    e?.response?.res?.text,
    e?.response?.error?.text,
    e?.text,
    e?.message,
  ].filter((x) => typeof x === "string" && x);

  let body = e?.response?.body ?? null;
  for (const t of texts) {
    if (!body) {
      try {
        body = JSON.parse(t as string);
      } catch {}
    }
  }

  const err = body?.error || body?.errors?.[0] || body || {};
  const name =
    err?.error_name ||
    err?.type ||
    (status === 401 || status === 403 ? "unauthorized" : "dropbox_sign_error");
  const message = err?.error_msg || err?.message || texts.find(Boolean) || "HTTP request failed";

  return { status, name, message, raw: body || texts[0] || e?.message || e };
}

/* ---------------- resolve signer ---------------- */
async function resolveSigner(trade: any, role: "seller" | "buyer") {
  const isSeller = role === "seller";
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

  const [sellerUser, buyerUser] = await Promise.all([
    trade.sellerUserId ? prisma.user.findUnique({ where: { id: trade.sellerUserId } }) : null,
    trade.buyerUserId ? prisma.user.findUnique({ where: { id: trade.buyerUserId } }) : null,
  ]);
  let u = (isSeller ? sellerUser : buyerUser) || null;
  let email = u?.email || null;
  let name = u?.name || tradeName || "";

  if ((!email || !name) && u?.clerkId) {
    try {
      const cl = await clerkClient.users.getUser(u.clerkId);
      name = name || cl.firstName || cl.username || name;
      const primary = cl.emailAddresses?.find((e) => e.id === cl.primaryEmailAddressId)
        ?.emailAddress;
      const firstAny = cl.emailAddresses?.[0]?.emailAddress;
      email = email || primary || firstAny || null;
    } catch {}
  }
  if (email) return { email, name: name || "Signer" };

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

/* ---------------- template metadata ---------------- */
async function getTemplateMeta(templateId: string): Promise<{
  signerRoles: string[];
  ccRoles: string[];
  mergeFields: Array<{ name: string; required?: boolean }>;
} | null> {
  if (!TemplateApi || !dropboxApiKey || !templateId) return null;
  try {
    const res = await TemplateApi.templateGet(templateId);
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
      tpl?.mergeFields
        ?.map((f: any) => ({ name: f?.name, required: f?.required }))
        ?.filter((f: any) => !!f.name) ??
      tpl?.merge_fields
        ?.map((f: any) => ({ name: f?.name, required: f?.required }))
        ?.filter((f: any) => !!f.name) ??
      [];
    return { signerRoles, ccRoles, mergeFields };
  } catch {
    return null;
  }
}

/* ---------------- route handler ---------------- */
export async function GET(req: NextRequest) {
  try {
    await loadDropbox();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || "";
    const debug = searchParams.get("debug") === "1";
    const roleParam = (searchParams.get("role") || "").toLowerCase();

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const trade = await ensureTradeFromAnyIdOrCreate(id);
    if (!trade) {
      return NextResponse.json(
        { error: "Not found", details: "No Trade or Transaction with this id" },
        { status: 404 }
      );
    }

    /* -------- viewer -------- */
    const viewer = await getViewer(req as any, trade as any);
    if (isForbidden(viewer)) {
      return NextResponse.json(
        { error: "Forbidden", reason: viewer.reason || "unauthorized" },
        { status: 403 }
      );
    }

    /* -------- resolve signers -------- */
    const sellerResolved = await resolveSigner(trade, "seller");
    const buyerResolved = await resolveSigner(trade, "buyer");
    const fallbackEmail = `no-email+${trade.id}@example.com`;
    const seller = { email: sellerResolved.email || fallbackEmail, name: sellerResolved.name || "Seller" };
    const buyer  = { email: buyerResolved.email  || fallbackEmail, name: buyerResolved.name  || "Buyer"  };
    if (seller.email.toLowerCase() === buyer.email.toLowerCase()) {
      buyer.email = plusAlias(buyer.email, `buyer.${trade.id.slice(-6)}`);
    }

    /* -------- infer role from Clerk -------- */
    const { userId } = auth();
    let authedEmails: string[] = [];
    if (userId) {
      try {
        const u = await clerkClient.users.getUser(userId);
        authedEmails =
          u?.emailAddresses?.map((e) => (e?.emailAddress || "").toLowerCase()).filter(Boolean) ||
          [];
      } catch {}
    }
    const sellerEmailLc = (seller.email || "").toLowerCase();
    const buyerEmailLc = (buyer.email || "").toLowerCase();
    const matchesSeller = authedEmails.includes(sellerEmailLc);
    const matchesBuyer = authedEmails.includes(buyerEmailLc);
    let inferredRole: "seller" | "buyer" | null = matchesSeller ? "seller" : matchesBuyer ? "buyer" : null;

    const requestedRole: "seller" | "buyer" | null =
      roleParam === "seller" ? "seller" : roleParam === "buyer" ? "buyer" : null;

    let effectiveRole: "seller" | "buyer" | null =
      viewer.role === "seller" || viewer.role === "buyer" ? viewer.role : null;
    if (!effectiveRole && inferredRole) effectiveRole = inferredRole;

    if (requestedRole && effectiveRole && requestedRole !== effectiveRole) {
      return NextResponse.json(
        {
          error: "Forbidden",
          reason: `requested role "${requestedRole}" does not match your verified role "${effectiveRole}"`,
        },
        { status: 403 }
      );
    }
    if (!effectiveRole) {
      return NextResponse.json(
        {
          error: "Forbidden",
          reason:
            'viewer role is "unknown" and we could not match your signed-in email to the seller/buyer on this trade',
          hint:
            "Sign in with the seller/buyer email for this trade, or open the secure link that includes a valid token.",
          context: {
            authedEmailsMasked: authedEmails.map(maskEmail),
            sellerEmailMasked: maskEmail(seller.email),
            buyerEmailMasked: maskEmail(buyer.email),
          },
        },
        { status: 403 }
      );
    }

    /* -------- config -------- */
    const clientId = process.env.DROPBOX_SIGN_CLIENT_ID || "";
    const browserClientId = process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID || "";
    const templateId = process.env.DROPBOX_SIGN_TEMPLATE_ID || "";
    const fileUrl = process.env.DROPBOX_SIGN_FILE_URL || "";

    const ENV_SELLER = process.env.DROPBOX_SIGN_ROLE_SELLER || "seller";
    const ENV_BUYER = process.env.DROPBOX_SIGN_ROLE_BUYER || "buyer";

    const testMode =
      process.env.DROPBOX_SIGN_TEST_MODE === "1"
        ? 1
        : process.env.NODE_ENV !== "production"
        ? 1
        : 0;

    /* ---- sanity: ids present ---- */
    if (!clientId) {
      return NextResponse.json(
        { error: "Dropbox Sign client_id missing on server (DROPBOX_SIGN_CLIENT_ID)" },
        { status: 500 }
      );
    }
    if (!dropboxApiKey) {
      return NextResponse.json(
        { error: "Dropbox Sign API key missing (DROPBOX_SIGN_API_KEY)" },
        { status: 500 }
      );
    }

    /* ---- very common cause: server vs browser clientId mismatch ---- */
    const serverVsBrowserClientIdMismatch =
      !!browserClientId && browserClientId !== clientId;
    if (serverVsBrowserClientIdMismatch) {
      return NextResponse.json(
        {
          error: "Server and browser client IDs differ",
          reason:
            "DROPBOX_SIGN_CLIENT_ID (server) must equal NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID (browser) for embedded signing.",
          details: {
            serverClientIdMasked: mask(clientId),
            browserClientIdMasked: mask(browserClientId),
          },
        },
        { status: 422 }
      );
    }

    /* -------- diagnostics: try to fetch owner info, but don't block if unavailable -------- */
    let whoami: { account_id?: string; email_address?: string } | null = null;
    let whoamiError: any = null;
    try {
      const acctRes = await AccountApi.accountGet();
      whoami = {
        account_id: acctRes?.body?.account?.account_id,
        email_address: acctRes?.body?.account?.email_address,
      };
    } catch (e: any) {
      whoamiError = parseDropboxError(e);
    }

    let appInfo:
      | {
          client_id?: string;
          name?: string;
          owner_account_id?: string;
          is_embedded?: boolean;
          domains?: string[];
        }
      | null = null;
    let appInfoError: any = null;
    try {
      if (clientId) {
        const appRes = await ApiAppApi.apiAppGet(clientId);
        appInfo = {
          client_id: appRes?.body?.api_app?.client_id,
          name: appRes?.body?.api_app?.name,
          owner_account_id: appRes?.body?.api_app?.owner_account_id,
          is_embedded: !!appRes?.body?.api_app?.options?.can_use_embedded_signing,
          domains: (appRes?.body?.api_app?.domains || [])
            .map((d: any) => d?.value)
            .filter(Boolean),
        };
      }
    } catch (e: any) {
      appInfoError = parseDropboxError(e);
    }

    const haveOwnershipData = !!(whoami?.account_id && appInfo?.owner_account_id);
    const sameOwner = haveOwnershipData && whoami!.account_id === appInfo!.owner_account_id;

    if (haveOwnershipData && !sameOwner) {
      return NextResponse.json(
        {
          error: "Invalid client_id / API key pairing",
          reason:
            "The API key's account is not the owner of the Dropbox Sign app (client_id). Use an API key from the same account that owns the app.",
          details: {
            clientIdMasked: mask(clientId),
            apiKeyAccountId: whoami?.account_id || null,
            apiKeyEmail: whoami?.email_address || null,
            appOwnerAccountId: appInfo?.owner_account_id || null,
          },
        },
        { status: 422 }
      );
    }
    if (appInfo && haveOwnershipData && !appInfo.is_embedded) {
      return NextResponse.json(
        {
          error: "Embedded Signing is not enabled for this Dropbox Sign app",
          details: {
            clientIdMasked: mask(clientId),
            appName: appInfo?.name || null,
            domains: appInfo?.domains || [],
          },
          hint:
            "Enable Embedded Signing for this app in the Dropbox Sign dashboard and add your allowed domains.",
        },
        { status: 422 }
      );
    }

    /* -------- template meta / roles -------- */
    const meta = templateId ? await getTemplateMeta(templateId) : null;
    const tplRoles: string[] = meta?.signerRoles ?? [];
    const mapRole = (want: "seller" | "buyer") => {
      const desired = want === "seller" ? ENV_SELLER : ENV_BUYER;
      if (!tplRoles.length) return desired;
      const exact = tplRoles.find((r: string) => r === desired);
      if (exact) return exact;
      const ci = tplRoles.find((r: string) => r.toLowerCase() === want);
      if (ci) return ci;
      const sub = tplRoles.find((r: string) => r.toLowerCase().includes(want));
      return sub || desired;
    };
    const sellerRoleName = mapRole("seller");
    const buyerRoleName = mapRole("buyer");
    const targetRole = effectiveRole === "seller" ? sellerRoleName : buyerRoleName;

    const signersPayload = [
      { role: sellerRoleName, email_address: seller.email, name: seller.name },
      { role: buyerRoleName, email_address: buyer.email, name: buyer.name },
    ];

    const ccRoles: string[] = meta?.ccRoles ?? [];
    const ccEmailsByRole = Object.fromEntries(
      ccRoles.map((role) => {
        const key = `DROPBOX_SIGN_CC_${role.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
        const email = process.env[key] || process.env.DROPBOX_SIGN_CC_DEFAULT || "";
        return [role, email];
      })
    );
    const ccsPayload = Object.entries(ccEmailsByRole)
      .filter(([, email]) => !!email)
      .map(([role, email]) => ({ role, email_address: email as string }));

    const customFields: Array<{ name: string; value: string }> = [];
    if (meta?.mergeFields?.length) {
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
      for (const f of meta.mergeFields) {
        customFields.push({ name: f.name, value: String(valFor(f.name) || "") || "-" });
      }
    }

    /* -------- debug short-circuit -------- */
    if (debug) {
      return NextResponse.json({
        ok: true,
        debug: {
          hasSdk: Boolean(SignatureRequestApi && EmbeddedApi),
          hasTemplateApi: Boolean(TemplateApi),
          apiKeyPresent: Boolean(dropboxApiKey),
          clientIdPresent: Boolean(clientId),
          clientIdMasked: mask(clientId),
          templateId,
          fileUrlPresent: Boolean(fileUrl),
          templateRoles: tplRoles.length ? tplRoles : null,
          ccRoles,
          mergeFields: meta?.mergeFields ?? [],
          viewer: {
            role: (viewer as any)?.role ?? null,
            authedEmailsMasked: authedEmails.map(maskEmail),
          },
          inferredRole,
          requestedRole,
          effectiveRole,
          targetRole,
          signersPayload,
          emailsDistinct: seller.email.toLowerCase() !== buyer.email.toLowerCase(),
          ccsPayload,
          customFields,
          signerForViewer:
            targetRole === sellerRoleName
              ? { email: seller.email, name: seller.name }
              : { email: buyer.email, name: buyer.name },
          testMode,
          tradeId: trade.id,
          tradeStatus: trade.status,

          // Ownership / app diagnostics
          whoami,
          whoamiError,
          appInfo,
          appInfoError,
          haveOwnershipData,
          sameOwner,

          // Server vs Browser
          browserClientIdMasked: mask(browserClientId),
          serverVsBrowserClientIdMismatch,
        },
      });
    }

    /* -------- create embedded request -------- */
    let signatureId: string | undefined;

    if (templateId) {
      if (tplRoles.length && !tplRoles.includes(targetRole)) {
        return NextResponse.json(
          {
            error: "Template role mismatch",
            details: `Template expects roles: ${tplRoles.join(", ")}, got "${targetRole}".`,
            hint:
              "Update DROPBOX_SIGN_ROLE_SELLER / DROPBOX_SIGN_ROLE_BUYER to match the template, or rename roles in the template.",
          },
          { status: 422 }
        );
      }

      try {
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

        const createResp = await fetch(
          `${DBX_BASE}/signature_request/create_embedded_with_template`,
          {
            method: "POST",
            headers: {
              Authorization: dbxAuthHeader(dropboxApiKey),
              "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
              Accept: "application/json",
            },
            body: form.toString(),
          }
        );

        const createText = await createResp.text();
        let createBody: any = null;
        try {
          createBody = createText ? JSON.parse(createText) : null;
        } catch {}

        if (!createResp.ok) {
          const errName =
            createBody?.error?.error_name || createResp.statusText || "dropbox_sign_error";
          const errMsg = createBody?.error?.error_msg || "HTTP request failed";
          return NextResponse.json(
            {
              error: errMsg,
              provider: "dropbox_sign",
              code: errName,
              status: createResp.status,
              raw: createBody ?? createText ?? null,
            },
            { status: createResp.status || 502 }
          );
        }

        const signatures: any[] =
          createBody?.signature_request?.signatures ||
          createBody?.signatureRequest?.signatures ||
          [];

        signatureId =
          signatures.find(
            (s: any) =>
              ((s?.signer_role || s?.role || "") as string).toLowerCase() ===
              targetRole.toLowerCase()
          )?.signature_id ||
          signatures[0]?.signature_id ||
          signatures[0]?.signatureId;

        if (!signatureId) {
          return NextResponse.json(
            { error: "No signature_id returned by Dropbox Sign", raw: createBody ?? createText },
            { status: 502 }
          );
        }
      } catch (e: any) {
        const info = parseDropboxError(e);
        console.error("[sign-url] create-with-template (REST) failed", info);
        return NextResponse.json(
          {
            error: info.message,
            provider: "dropbox_sign",
            code: info.name,
            status: info.status,
            raw: info.raw ?? null,
          },
          { status: info.status || 502 }
        );
      }
    } else if (fileUrl) {
      try {
        const created = await SignatureRequestApi.signatureRequestCreateEmbedded({
          client_id: clientId,
          title: `Water Traders – Trade ${trade.id}`,
          subject: "Sign the Water Traders agreement",
          message: "Please review and sign.",
          signers: [
            {
              email_address: effectiveRole === "seller" ? seller.email : buyer.email,
              name: effectiveRole === "seller" ? seller.name : buyer.name,
              role: "signer",
            },
          ],
          file_urls: [fileUrl],
          test_mode: testMode,
        } as any);

        const sr =
          created?.body?.signature_request || created?.body?.signatureRequest || created?.signatureRequest;
        const sigs: any[] = sr?.signatures || [];
        signatureId = sigs[0]?.signature_id || sigs[0]?.signatureId;
        if (!signatureId) {
          return NextResponse.json(
            { error: "No signature_id returned by Dropbox Sign", raw: created?.body ?? null },
            { status: 502 }
          );
        }
      } catch (e: any) {
        const info = parseDropboxError(e);
        console.error("[sign-url] create-embedded (file) failed", info);
        return NextResponse.json(
          {
            error: info.message,
            provider: "dropbox_sign",
            code: info.name,
            status: info.status,
            raw: info.raw ?? null,
          },
          { status: info.status || 502 }
        );
      }
    } else {
      return NextResponse.json(
        {
          error:
            "No template or fileUrl configured. Set DROPBOX_SIGN_TEMPLATE_ID or DROPBOX_SIGN_FILE_URL.",
        },
        { status: 422 }
      );
    }

    /* -------- embedded sign URL -------- */
    try {
      const embeddedResp = await EmbeddedApi.embeddedSignUrl(signatureId!);
      const embeddedBody = embeddedResp?.body || embeddedResp;
      const embeddedObj =
        embeddedBody?.embedded ||
        embeddedBody?.Embedded ||
        embeddedBody?.data?.embedded ||
        embeddedBody;
      const signUrl = embeddedObj?.sign_url || embeddedObj?.signUrl;

      if (!signUrl) {
        return NextResponse.json(
          { error: "Failed to get embedded URL", raw: embeddedBody ?? null },
          { status: 500 }
        );
      }
      return NextResponse.json({ url: signUrl, testMode });
    } catch (e: any) {
      const info = parseDropboxError(e);
      console.error("[sign-url] embeddedSignUrl failed", info);
      return NextResponse.json(
        {
          error: info.message,
          provider: "dropbox_sign",
          code: info.name,
          status: info.status,
          raw: info.raw ?? null,
        },
        { status: info.status || 502 }
      );
    }
  } catch (e: any) {
    console.error("[sign-url] error", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
