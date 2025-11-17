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
function mask(s?: string | null, keep = 6) {
  if (!s) return "";
  const v = String(s);
  return v.length <= keep ? `${v.slice(0, 2)}…` : `${v.slice(0, keep)}…${v.slice(-keep)}`;
}
function maskEmail(e?: string | null) {
  if (!e) return "";
  const [local, domain = ""] = e.split("@");
  if (!local) return e;
  return `${local[0] ?? ""}…@${domain}`;
}
function noCacheHeaders(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noimageindex");
  res.headers.set("X-Content-Type-Options", "nosniff");
  return res;
}
function json(data: any, init?: ResponseInit) {
  return noCacheHeaders(NextResponse.json(data, init));
}

/* ---- DOCUSIGN OAUTH BASE NORMALIZER ---- */
function normalizeOAuthBase(input?: string) {
  const raw = (input || "").trim() || "https://account-d.docusign.com";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `DOCUSIGN_BASE_PATH must be a full https URL. Use "https://account-d.docusign.com" (demo) or "https://account.docusign.com" (prod). Got: "${raw}"`
    );
  }
  const host = url.hostname.toLowerCase();
  const allowed = new Set(["account-d.docusign.com", "account.docusign.com"]);
  if (!allowed.has(host)) {
    throw new Error(
      `DOCUSIGN_BASE_PATH host must be "account-d.docusign.com" (demo) or "account.docusign.com" (prod). ` +
        `Do not use "demo.docusign.net" or append "/restapi". Got host "${host}".`
    );
  }
  return { oauthBase: `https://${host}`, oauthHost: host };
}

/* ---------------- DocuSign SDK (lazy) ---------------- */
let docusign: any = null;
let jwtApiClient: any = null;

function readDocuSignPrivateKey(): string {
  const raw = process.env.DOCUSIGN_PRIVATE_KEY || "";
  const b64 = process.env.DOCUSIGN_PRIVATE_KEY_B64 || "";

  if (raw && raw.includes("PRIVATE KEY")) return raw;

  if (b64) {
    try {
      const asUtf8 = Buffer.from(b64, "base64").toString("utf8");
      if (asUtf8.includes("PRIVATE KEY")) return asUtf8;
    } catch {}
    try {
      const der = Buffer.from(b64, "base64");
      const wrapped = der.toString("base64").match(/.{1,64}/g)?.join("\n") || der.toString("base64");
      return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----\n`;
    } catch {}
  }
  return "";
}

async function loadDocuSign() {
  if (docusign && jwtApiClient) return;
  const mod = await import("docusign-esign").catch(() => null);
  if (!mod) return;
  docusign = mod;

  const { oauthBase, oauthHost } = normalizeOAuthBase(process.env.DOCUSIGN_BASE_PATH);
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY || "";
  const userId = process.env.DOCUSIGN_USER_ID || "";
  const privateKey = readDocuSignPrivateKey();

  const apiClient = new docusign.ApiClient();
  apiClient.setOAuthBasePath(oauthHost); // host only

  jwtApiClient = {
    apiClient,
    oauthBase,
    oauthHost,
    integrationKey,
    userId,
    privateKey,
    scopes: ["signature", "impersonation"],
  };
}

function parseErr(e: any) {
  const status = e?.response?.status ?? e?.status ?? null;
  const body = e?.response?.body ?? null;
  const text = e?.response?.text ?? e?.message ?? String(e);
  return { status, text, body };
}

function buildConsentUrl(oauthBase: string, clientId: string, returnUrl?: string) {
  const redirect = returnUrl || "https://example.com/docusign/return";
  return `${oauthBase}/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(redirect)}`;
}

async function getAccessToken(): Promise<{ accessToken: string; expiresAt: number; diag?: any }> {
  if (!docusign || !jwtApiClient) await loadDocuSign();

  const { integrationKey, userId, privateKey, apiClient, oauthBase, oauthHost } = jwtApiClient || {};
  if (!privateKey?.includes("PRIVATE KEY")) {
    throw new Error("Invalid/missing DocuSign private key (set DOCUSIGN_PRIVATE_KEY or DOCUSIGN_PRIVATE_KEY_B64).");
  }
  if (!integrationKey || !userId) {
    throw new Error("Missing DOCUSIGN_INTEGRATION_KEY or DOCUSIGN_USER_ID.");
  }

  try {
    const targetLifetime = 60 * 60; // 1h
    const res = await apiClient.requestJWTUserToken(
      integrationKey,
      userId,
      ["signature", "impersonation"],
      privateKey,
      targetLifetime
    );
    const accessToken = res.body.access_token;
    const expiresAt = Math.floor(Date.now() / 1000) + (res.body.expires_in ?? targetLifetime) - 600;
    return { accessToken, expiresAt };
  } catch (e: any) {
    const status = e?.response?.status ?? e?.status ?? null;
    let body = e?.response?.body || e?.body || null;
    const text = e?.response?.text || e?.message || String(e);
    if (!body && typeof text === "string") {
      try {
        body = JSON.parse(text);
      } catch {}
    }
    const error = body?.error || null;
    const description = body?.error_description || text || null;

    let hint = "Check that your Integration Key, User GUID, and RSA key belong to the same environment (demo vs prod).";
    const consentUrl = buildConsentUrl(oauthBase, integrationKey, process.env.DOCUSIGN_RETURN_URL);

    if (status === 404) {
      hint = `OAuth host must be ${oauthBase} (host: ${oauthHost}). Do not use demo.docusign.net.`;
    } else if (error === "consent_required") {
      hint = `Consent required. Open this while logged in as the API user: ${consentUrl}`;
    } else if (error === "invalid_grant") {
      hint =
        "invalid_grant: Verify USER_ID (API Username GUID), user is in the app's account, RSA keypair matches the app, and server clock is accurate.";
    } else if (error === "unauthorized_client") {
      hint = "unauthorized_client: Ensure JWT is enabled and the RSA public key is added to the app.";
    }

    const diag = { status, error, description, oauthBase, oauthHost, consentUrl };
    const err = new Error(`JWT token request failed (${status ?? "?"}): ${error || ""} ${description || ""} ${hint}`);
    (err as any).diag = diag;
    throw err;
  }
}

/** Resolve account + REST base via /oauth/userinfo (prevents wrong-cluster 404s) */
async function getUserInfoAndRestBase(accessToken: string) {
  if (!jwtApiClient) await loadDocuSign();
  const oauthBase = jwtApiClient.oauthBase || "https://account-d.docusign.com";

  const resp = await fetch(`${oauthBase}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await resp.text();
  let info: any = null;
  try {
    info = text ? JSON.parse(text) : null;
  } catch {}

  if (!resp.ok) throw new Error(`userinfo failed ${resp.status}: ${text || ""}`);

  const envAcct = (process.env.DOCUSIGN_ACCOUNT_ID || "").trim();
  const accounts: any[] = info?.accounts || [];
  const byEnv = envAcct ? accounts.find((a) => a?.account_id === envAcct) : null;
  const byDefault = accounts.find((a) => a?.is_default) || accounts[0];
  const account = byEnv || byDefault;

  if (!account) throw new Error("No DocuSign account on token");

  if (envAcct && account.account_id !== envAcct) {
    const available = accounts.map((a) => a?.account_id).filter(Boolean).join(", ");
    throw new Error(`DOCUSIGN_ACCOUNT_ID (${envAcct}) not on token. Available: ${available}`);
  }

  const baseUri = (account.base_uri || account.baseUri || info?.base_uri || "").replace(/\/+$/, "");
  if (!baseUri) throw new Error("No base_uri in userinfo");

  const restBase = `${baseUri}/restapi`;
  return { accountId: account.account_id, restBase, info, oauthBase };
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
      const primary = cl.emailAddresses?.find((e) => e.id === cl.primaryEmailAddressId)?.emailAddress;
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

/* ---------------- helpers: fetch & base64 ---------------- */
async function fetchAsBase64(url: string): Promise<{ name: string; data: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentDisp = res.headers.get("content-disposition") || "";
  const fromDisp = /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i.exec(contentDisp);
  const rawName = decodeURIComponent(fromDisp?.[1] || fromDisp?.[2] || "");
  const guessedName = rawName || new URL(url).pathname.split("/").pop() || "document.pdf";
  return { name: guessedName, data: buf.toString("base64") };
}

/* ---------------- route handler ---------------- */
export async function GET(req: NextRequest) {
  let PHASE = "start";
  const fail = (status: number, error: string, details?: any) =>
    json({ ok: false, error, status, phase: PHASE, details }, { status });

  try {
    PHASE = "sdk.load";
    await loadDocuSign();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("tx") || searchParams.get("id") || "";
    const debug = searchParams.get("debug") === "1";
    const format = (searchParams.get("format") || "").toLowerCase(); // "json" to prevent redirect
    const redirectParam = (searchParams.get("redirect") || "").toLowerCase();
    const acceptHeader = req.headers.get("accept") || "";
    const acceptsJson = acceptHeader
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .some((v) => v.startsWith("application/json"));
    const redirectPref = redirectParam
      ? !["0", "false", "no", "off"].includes(redirectParam)
      : null;
    const wantsJson = format === "json" || acceptsJson || redirectPref === false;
    const wantConsent = searchParams.get("consent") === "1";
    let useSample = searchParams.get("sample") === "1";
    const roleParam = (searchParams.get("role") || "").toLowerCase();

    // Emails should land in DocuSign immediately; default to redirect unless caller asks for JSON.
    const forceRedirect =
      redirectPref !== null && format !== "json"
        ? redirectPref
        : !wantsJson && !debug;

    // Utility: return consent URL on demand
    if (wantConsent) {
      const { oauthBase } = jwtApiClient || {};
      const clientId = process.env.DOCUSIGN_INTEGRATION_KEY || "";
      const consentUrl = buildConsentUrl(oauthBase, clientId, process.env.DOCUSIGN_RETURN_URL);
      return json({ ok: true, consentUrl });
    }

    if (!id) return fail(400, "Missing id|tx");

    PHASE = "trade.load";
    const trade = await ensureTradeFromAnyIdOrCreate(id);
    if (!trade) return fail(404, "Not found", "No Trade or Transaction with this id");

    /* -------- viewer -------- */
    PHASE = "viewer.authz";
    const viewer = await getViewer(req as any, trade as any);
    if (isForbidden(viewer)) {
      return fail(403, "Forbidden", viewer.reason || "unauthorized");
    }

    /* -------- resolve signers -------- */
    PHASE = "signers.resolve";
    const sellerResolved = await resolveSigner(trade, "seller");
    const buyerResolved = await resolveSigner(trade, "buyer");
    const fallbackEmail = `no-email+${trade.id}@example.com`;
    const seller = { email: sellerResolved.email || fallbackEmail, name: sellerResolved.name || "Seller" };
    const buyer = { email: buyerResolved.email || fallbackEmail, name: buyerResolved.name || "Buyer" };
    if ((seller.email || "").toLowerCase() === (buyer.email || "").toLowerCase()) {
      buyer.email = plusAlias(buyer.email, `buyer.${trade.id.slice(-6)}`);
    }

    /* -------- infer role from Clerk -------- */
    PHASE = "role.infer";
    const { userId } = auth();
    let authedEmails: string[] = [];
    if (userId) {
      try {
        const u = await clerkClient.users.getUser(userId);
        authedEmails = u?.emailAddresses?.map((e) => (e?.emailAddress || "").toLowerCase()).filter(Boolean) || [];
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
      (viewer as any).role === "seller" || (viewer as any).role === "buyer" ? (viewer as any).role : null;
    if (!effectiveRole && inferredRole) effectiveRole = inferredRole;

    if (requestedRole && effectiveRole && requestedRole !== effectiveRole) {
      return fail(403, "Forbidden", `requested role "${requestedRole}" != verified role "${effectiveRole}"`);
    }
    if (!effectiveRole) {
      return fail(403, "Forbidden", {
        reason:
          'viewer role is "unknown" and we could not match your signed-in email to the seller/buyer on this trade',
        hint:
          "Sign in with the seller/buyer email for this trade, or open the secure link that includes a valid token.",
        context: {
          authedEmailsMasked: authedEmails.map(maskEmail),
          sellerEmailMasked: maskEmail(seller.email),
          buyerEmailMasked: maskEmail(buyer.email),
        },
      });
    }

    /* -------- config -------- */
    // Template-based envelopes are disabled; we always send fully generated documents
    const templateId = "";
    const fileUrl = process.env.DOCUSIGN_FILE_URL || "";
    const sampleUrl =
      process.env.DOCUSIGN_SAMPLE_PDF_URL ||
      "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
    let effectiveFileUrl = useSample ? sampleUrl : fileUrl;

    // Gracefully fall back to the sample file when DOCUSIGN_FILE_URL is not configured.
    if (!effectiveFileUrl && sampleUrl) {
      useSample = true;
      effectiveFileUrl = sampleUrl;
    }
    const ENV_SELLER = process.env.DOCUSIGN_ROLE_SELLER || "seller";
    const ENV_BUYER = process.env.DOCUSIGN_ROLE_BUYER || "buyer";
    const returnUrl = process.env.DOCUSIGN_RETURN_URL || "https://example.com/docusign/return";
    const pingUrl = process.env.DOCUSIGN_PING_URL || "";

    /* -------- OAuth -------- */
    PHASE = "jwt.token";
    let access: { accessToken: string; expiresAt: number; diag?: any };
    try {
      access = await getAccessToken();
    } catch (e: any) {
      const diag = (e as any)?.diag || null;
      return fail(500, "Failed to obtain DocuSign access token", {
        message: e?.message || String(e),
        ...diag,
        env: {
          basePath: process.env.DOCUSIGN_BASE_PATH || "",
          hasPrivateKey: !!(process.env.DOCUSIGN_PRIVATE_KEY || process.env.DOCUSIGN_PRIVATE_KEY_B64),
          integrationKeyMasked: mask(process.env.DOCUSIGN_INTEGRATION_KEY || ""),
          userIdMasked: mask(process.env.DOCUSIGN_USER_ID || ""),
        },
      });
    }

    /* -------- account + REST base -------- */
    PHASE = "oauth.userinfo";
    let accountId: string, restBase: string, userinfo: any, oauthBase: string;
    try {
      const u = await getUserInfoAndRestBase(access.accessToken);
      accountId = u.accountId;
      restBase = u.restBase;
      userinfo = u.info;
      oauthBase = u.oauthBase;
    } catch (e: any) {
      return fail(500, "Failed to resolve DocuSign account/base", e?.message || parseErr(e));
    }

    /* -------- API client -------- */
    PHASE = "client.init";
    const apiClient = new docusign.ApiClient();
    apiClient.setBasePath(restBase);
    apiClient.addDefaultHeader("Authorization", "Bearer " + access.accessToken);
    const envelopesApi = new docusign.EnvelopesApi(apiClient);

    /* -------- map roles -------- */
    const sellerRoleName = ENV_SELLER;
    const buyerRoleName = ENV_BUYER;
    const targetRole = effectiveRole === "seller" ? sellerRoleName : buyerRoleName;

    if (!effectiveFileUrl) {
      return fail(422, "No file configured. Set DOCUSIGN_FILE_URL or call this endpoint with ?sample=1.", {
        tip: "Template-based envelopes have been disabled in favor of generated documents.",
      });
    }

    /* -------- custom fields (tabs) -------- */
    const customPairs: Record<string, string> = {
      trade_id: trade.id || "",
      transaction_id: trade.transactionId || "",
      listing_id: trade.listingId || "",
      district: trade.district || "",
      water_type: trade.waterType || "",
      price_per_af: typeof trade.pricePerAf === "number" ? (trade.pricePerAf / 100).toFixed(2) : "",
      volume_af: typeof trade.volumeAf === "number" ? String(trade.volumeAf) : "",
      seller_name: seller.name || "",
      seller_email: seller.email || "",
      buyer_name: buyer.name || "",
      buyer_email: buyer.email || "",
    };

    /* -------- build envelope -------- */
    PHASE = "envelope.build";
    const envelopeDefinition: any = new docusign.EnvelopeDefinition();
    envelopeDefinition.emailSubject = `Water Traders – Trade ${trade.id}`;
    envelopeDefinition.emailBlurb = "Please review and sign the Water Traders agreement.";

    // Envelope-level custom field so webhooks can always see trade_id
    (() => {
      const tcf = new docusign.TextCustomField();
      tcf.name = "trade_id";
      tcf.value = trade.id || "";
      tcf.required = "false";
      tcf.show = "false";
      const cf = new docusign.CustomFields();
      cf.textCustomFields = [tcf];
      envelopeDefinition.customFields = cf;
    })();

    if (effectiveFileUrl) {
      const { name, data } = await fetchAsBase64(effectiveFileUrl);
      const doc = new docusign.Document();
      doc.documentBase64 = data;
      doc.name = name;
      doc.fileExtension = (name.split(".").pop() || "pdf").toLowerCase();
      doc.documentId = "1";

      envelopeDefinition.documents = [doc];

      const buyerSigner = new docusign.Signer();
      buyerSigner.email = buyer.email;
      buyerSigner.name = buyer.name;
      buyerSigner.recipientId = "1";
      buyerSigner.clientUserId = buyerRoleName;
      buyerSigner.routingOrder = "1";

      const sellerSigner = new docusign.Signer();
      sellerSigner.email = seller.email;
      sellerSigner.name = seller.name;
      sellerSigner.recipientId = "2";
      sellerSigner.clientUserId = sellerRoleName;
      sellerSigner.routingOrder = "1";

      envelopeDefinition.recipients = new docusign.Recipients();
      envelopeDefinition.recipients.signers = [buyerSigner, sellerSigner];
    }

    // 🔔 Event Notification → your webhook
    {
      const origin = new URL(req.url).origin;
      const webhookUrl = process.env.DOCUSIGN_WEBHOOK_URL || `${origin}/api/webhook/docsign`;
      const en = new docusign.EventNotification();
      en.url = webhookUrl;
      en.includeTimeZone = "true";
      en.loggingEnabled = "true";
      en.requireAcknowledgment = "true";
      en.includeDocuments = "false"; // we'll fetch PDFs ourselves
      en.signMessageWithX509Cert = "false";
      en.useSoapInterface = "false";
      en.includeCertificateWithSoap = "false";
      // Trigger when a recipient completes, and when the whole envelope completes
      en.recipientEvents = [{ recipientEventStatusCode: "Completed" }];
      en.envelopeEvents = [{ envelopeEventStatusCode: "Completed" }];
      envelopeDefinition.eventNotification = en;
    }

    envelopeDefinition.status = "sent";

    /* -------- create envelope -------- */
    PHASE = "envelopes.create";
    let envelopeSummary;
    try {
      envelopeSummary = await envelopesApi.createEnvelope(accountId, { envelopeDefinition });
    } catch (e: any) {
      const { status, text, body } = parseErr(e);
      return fail(502, "DocuSign createEnvelope failed", { status, text, body });
    }

    const envelopeId = envelopeSummary?.envelopeId;
    if (!envelopeId) return fail(502, "No envelopeId returned", envelopeSummary);

    /* -------- verify recipients -------- */
    PHASE = "recipients.list";
    try {
      const recips = await envelopesApi.listRecipients(accountId, envelopeId);
      const allSigners: any[] = recips?.signers || [];
      const wantClientUserId = effectiveRole === "seller" ? sellerRoleName : buyerRoleName;
      const wantEmail = (effectiveRole === "seller" ? seller.email : buyer.email).toLowerCase();
      const wantName = effectiveRole === "seller" ? seller.name : buyer.name;

      const match = allSigners.find(
        (s) => (s.clientUserId || s.clientUserID) === wantClientUserId && (s.email || "").toLowerCase() === wantEmail
      );

      if (!match) {
        return fail(422, "Embedded recipient not found on envelope (clientUserId/email mismatch)", {
          target: { clientUserId: wantClientUserId, email: wantEmail, name: wantName },
          presentRecipients: allSigners.map((s) => ({
            email: s.email,
            name: s.name,
            clientUserId: s.clientUserId || s.clientUserID || null,
            roleName: s.roleName || null,
            status: s.status,
          })),
        });
      }
    } catch (e: any) {
      const { status, text, body } = parseErr(e);
      return fail(502, "listRecipients failed", { status, text, body });
    }

    /* -------- recipient view (embedded sign URL) -------- */
    PHASE = "recipientView.create";
    const isSeller = effectiveRole === "seller";
    const signerEmail = isSeller ? seller.email : buyer.email;
    const signerName = isSeller ? seller.name : buyer.name;
    const clientUserId = isSeller ? sellerRoleName : buyerRoleName;

    const viewRequest = new docusign.RecipientViewRequest();
    viewRequest.returnUrl = returnUrl;
    if (pingUrl) {
      viewRequest.pingUrl = pingUrl;
      viewRequest.pingFrequency = 600;
    }
    viewRequest.authenticationMethod = "none";
    viewRequest.email = signerEmail;
    viewRequest.userName = signerName;
    viewRequest.clientUserId = clientUserId;

    let recipientView;
    try {
      recipientView = await envelopesApi.createRecipientView(accountId, envelopeId, { recipientViewRequest: viewRequest });
    } catch (e: any) {
      const { status, text, body } = parseErr(e);
      return fail(404, "DocuSign createRecipientView failed", { status, text, body });
    }

    const signUrl = recipientView?.url;
    if (!signUrl) return fail(500, "No sign URL returned", recipientView);

    /* -------- Default: redirect to DocuSign; JSON if requested -------- */
    if (forceRedirect) {
      const res = NextResponse.redirect(signUrl, 302);
      return noCacheHeaders(res);
    }

    if (debug) {
      return json({
        ok: true,
        debug: {
          provider: "docusign",
          oauthBase,
          restBase,
          accountIdMasked: mask(accountId),
          integrationKeyMasked: mask(process.env.DOCUSIGN_INTEGRATION_KEY || ""),
          userIdMasked: mask(process.env.DOCUSIGN_USER_ID || ""),
          templateId: templateId || null,
          fileUrlPresent: !!effectiveFileUrl,
          usedSample: useSample || undefined,
          viewer: { role: (viewer as any)?.role ?? null, authedEmailsMasked: authedEmails.map(maskEmail) },
          inferredRole,
          requestedRole,
          effectiveRole,
          targetRole,
          envRoles: { seller: ENV_SELLER, buyer: ENV_BUYER },
          seller,
          buyer,
          envelopeId,
          returnUrl,
          pingUrl,
          signUrl,
          webhookUrl: process.env.DOCUSIGN_WEBHOOK_URL || `${new URL(req.url).origin}/api/webhook/docsign`,
          userinfo,
        },
      });
    }

    return json({ ok: true, url: signUrl, envelopeId });
  } catch (e: any) {
    console.error("[sign-url] error", e);
    return json({ ok: false, error: e?.message || "Internal error", phase: "caught" }, { status: 500 });
  }
}
