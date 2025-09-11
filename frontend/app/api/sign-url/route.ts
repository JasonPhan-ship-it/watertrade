// app/api/sign-url/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTradeFromAnyIdOrCreate, getViewer } from "@/lib/trade";
import { auth, clerkClient } from "@clerk/nextjs/server";

/** ---- auth guard helper ---- */
function isForbidden(v: any): v is { role: "forbidden"; reason: string } {
  return v?.role === "forbidden";
}

/** ---- lazy Dropbox Sign SDK (for template meta + embedded URL only) ---- */
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
    // v3 SDK supports basic auth by setting username
    SignatureRequestApi.username = dropboxApiKey;
    EmbeddedApi.username = dropboxApiKey;
    TemplateApi.username = dropboxApiKey;
  }
}

/** ---- REST config (for create_embedded_with_template) ---- */
const DBX_BASE = process.env.DROPBOX_SIGN_BASE_URL || "https://api.hellosign.com/v3";
function dbxAuthHeader(apiKey: string) {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}

/** ---- error normalizer (SDK or REST) ---- */
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

/** ---- helpers ---- */
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

/** Resolve signer from Trade → User → Clerk → Transaction */
async function resolveSigner(trade: any, role: "seller" | "buyer") {
  const isSeller = role === "seller";

  // 1) Try trade fields
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

  // 2) Local user table
  const [sellerUser, buyerUser] = await Promise.all([
    trade.sellerUserId ? prisma.user.findUnique({ where: { id: trade.sellerUserId } }) : null,
    trade.buyerUserId ? prisma.user.findUnique({ where: { id: trade.buyerUserId } }) : null,
  ]);
  let u = (isSeller ? sellerUser : buyerUser) || null;
  let email = u?.email || null;
  let name = u?.name || tradeName || "";

  // 3) Clerk profile
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

  // 4) Source transaction as last resort
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

/** Get template metadata (roles/cc/merge fields) */
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

/** ---- route handler ---- */
export async function GET(req: NextRequest) {
  try {
    await loadDropbox();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || "";
    const debug = searchParams.get("debug") === "1";
    const roleParam = (searchParams.get("role") || "").toLowerCase();

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Accept Trade.id OR Transaction.id; create Trade if missing
    const trade = await ensureTradeFromAnyIdOrCreate(id);
    if (!trade) {
      return NextResponse.json(
        { error: "Not found", details: "No Trade or Transaction with this id" },
        { status: 404 }
      );
    }

    // -------- 1) Viewer (from your existing guard) --------
    const viewer = await getViewer(req as any, trade as any);
    if (isForbidden(viewer)) {
      return NextResponse.json(
        { error: "Forbidden", reason: viewer.reason || "unauthorized" },
        { status: 403 }
      );
    }

    // -------- 2) Resolve signers early (for email matching) --------
    const sellerResolved = await resolveSigner(trade, "seller");
    const buyerResolved = await resolveSigner(trade, "buyer");
    const fallbackEmail = `no-email+${trade.id}@example.com`;
    const seller = {
      email: sellerResolved.email || fallbackEmail,
      name: sellerResolved.name || "Seller",
    };
    const buyer = {
      email: buyerResolved.email || fallbackEmail,
      name: buyerResolved.name || "Buyer",
    };

    // Ensure distinct emails
    if (seller.email.toLowerCase() === buyer.email.toLowerCase()) {
      buyer.email = plusAlias(buyer.email, `buyer.${trade.id.slice(-6)}`);
    }

    // -------- 3) Try to infer role from logged-in Clerk user emails --------
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

    let inferredRole: "seller" | "buyer" | null = null;
    if (matchesSeller) inferredRole = "seller";
    else if (matchesBuyer) inferredRole = "buyer";

    // -------- 4) Effective role selection logic --------
    const requestedRole: "seller" | "buyer" | null =
      roleParam === "seller" ? "seller" : roleParam === "buyer" ? "buyer" : null;

    // Start with viewer.role if already trusted
    let effectiveRole: "seller" | "buyer" | null =
      viewer.role === "seller" || viewer.role === "buyer" ? viewer.role : null;

    // If viewer was unknown, allow soft inference by email
    if (!effectiveRole && inferredRole) {
      effectiveRole = inferredRole;
    }

    // If a ?role= is provided, only allow it when it agrees with a trusted role
    if (requestedRole && effectiveRole && requestedRole !== effectiveRole) {
      return NextResponse.json(
        {
          error: "Forbidden",
          reason: `requested role "${requestedRole}" does not match your verified role "${effectiveRole}"`,
        },
        { status: 403 }
      );
    }

    // If we still have no effective role, deny with a precise reason
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

    // -------- 5) Config & template meta --------
    const clientId = process.env.DROPBOX_SIGN_CLIENT_ID || "";
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

    // -------- 6) Debug block with viewer/inference context --------
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
        },
      });
    }

    // -------- 7) Config sanity --------
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

    // -------- 8) Create embedded request (template or file URL) --------
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

    // -------- 9) Get embedded sign URL --------
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
