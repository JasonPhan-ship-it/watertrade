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

  const oauthBase = process.env.DOCUSIGN_BASE_PATH || "https://account-d.docusign.com";
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY || "";
  const userId = process.env.DOCUSIGN_USER_ID || "";
  const privateKey = readDocuSignPrivateKey();

  const apiClient = new docusign.ApiClient();
  apiClient.setOAuthBasePath(new URL(oauthBase).hostname);
  jwtApiClient = {
    apiClient,
    oauthBase,
    integrationKey,
    userId,
    privateKey,
    scopes: ["signature", "impersonation"],
  };
}

function parseErr(e: any) {
  const status = e?.response?.status ?? e?.status ?? null;
  const text = e?.response?.text ?? e?.message ?? String(e);
  return { status, text };
}

async function getAccessToken(): Promise<{ accessToken: string; expiresAt: number }> {
  if (!docusign || !jwtApiClient) await loadDocuSign();

  if (!jwtApiClient?.privateKey?.includes("PRIVATE KEY")) {
    throw new Error("Invalid/missing DocuSign private key");
  }
  if (!jwtApiClient?.integrationKey || !jwtApiClient?.userId) {
    throw new Error("Missing DOCUSIGN_INTEGRATION_KEY or DOCUSIGN_USER_ID");
  }

  const targetLifetime = 60 * 60;
  const res = await jwtApiClient.apiClient.requestJWTUserToken(
    jwtApiClient.integrationKey,
    jwtApiClient.userId,
    jwtApiClient.scopes,
    jwtApiClient.privateKey,
    targetLifetime
  );
  const accessToken = res.body.access_token;
  const expiresAt = Math.floor(Date.now() / 1000) + (res.body.expires_in ?? targetLifetime) - 600;
  return { accessToken, expiresAt };
}

/** Build account + REST base from /oauth/userinfo (prevents 404s) */
async function getUserInfoAndRestBase(accessToken: string) {
  if (!jwtApiClient) await loadDocuSign();
  const oauthBase = jwtApiClient.oauthBase || "https://account-d.docusign.com";

  const resp = await fetch(`${oauthBase}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await resp.text();
  let info: any = null;
  try { info = text ? JSON.parse(text) : null; } catch {}

  if (!resp.ok) throw new Error(`userinfo failed ${resp.status}: ${text || ""}`);

  const envAcct = (process.env.DOCUSIGN_ACCOUNT_ID || "").trim();
  const accounts: any[] = info?.accounts || [];
  const byEnv = envAcct ? accounts.find(a => a?.account_id === envAcct) : null;
  const byDefault = accounts.find(a => a?.is_default) || accounts[0];
  const account = byEnv || byDefault;

  if (!account) throw new Error("No DocuSign account on token");

  if (envAcct && account.account_id !== envAcct) {
    const available = accounts.map(a => a?.account_id).filter(Boolean).join(", ");
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
  try {
    await loadDocuSign();

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
    if ((seller.email || "").toLowerCase() === (buyer.email || "").toLowerCase()) {
      buyer.email = plusAlias(buyer.email, `buyer.${trade.id.slice(-6)}`);
    }

    /* -------- infer role from Clerk -------- */
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
      viewer.role === "seller" || viewer.role === "buyer" ? viewer.role : null;
    if (!effectiveRole && inferredRole) effectiveRole = inferredRole;

    if (requestedRole && effectiveRole && requestedRole !== effectiveRole) {
      return NextResponse.json(
        { error: "Forbidden", reason: `requested role "${requestedRole}" does not match your verified role "${effectiveRole}"` },
        { status: 403 }
      );
    }
    if (!effectiveRole) {
      return NextResponse.json(
        {
          error: "Forbidden",
          reason: 'viewer role is "unknown" and we could not match your signed-in email to the seller/buyer on this trade',
          hint: "Sign in with the seller/buyer email for this trade, or open the secure link that includes a valid token.",
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
    const templateId = process.env.DOCUSIGN_TEMPLATE_ID || "";
    const fileUrl = process.env.DOCUSIGN_FILE_URL || "";
    const ENV_SELLER = process.env.DOCUSIGN_ROLE_SELLER || "seller";
    const ENV_BUYER = process.env.DOCUSIGN_ROLE_BUYER || "buyer";
    const returnUrl = process.env.DOCUSIGN_RETURN_URL || "https://example.com/docusign/return";
    const pingUrl = process.env.DOCUSIGN_PING_URL || "";

    // OAuth
    let access: { accessToken: string; expiresAt: number };
    try {
      access = await getAccessToken();
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Failed to obtain DocuSign access token" }, { status: 500 });
    }

    // Account + REST base from userinfo (prevents 404s)
    let accountId: string, restBase: string, userinfo: any, oauthBase: string;
    try {
      const u = await getUserInfoAndRestBase(access.accessToken);
      accountId = u.accountId;
      restBase = u.restBase;
      userinfo = u.info;
      oauthBase = u.oauthBase;
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Failed to resolve DocuSign account/base" }, { status: 500 });
    }

    // API client bound to the right cluster
    const apiClient = new docusign.ApiClient();
    apiClient.setBasePath(restBase);
    apiClient.addDefaultHeader("Authorization", "Bearer " + access.accessToken);

    const envelopesApi = new docusign.EnvelopesApi(apiClient);

    /* -------- map roles -------- */
    const sellerRoleName = ENV_SELLER;
    const buyerRoleName = ENV_BUYER;
    const targetRole = effectiveRole === "seller" ? sellerRoleName : buyerRoleName;

    /* -------- optional: verify template roles exist (prevents latent 404) -------- */
    if (templateId) {
      try {
        const templatesApi = new docusign.TemplatesApi(apiClient);
        const tpl = await templatesApi.get(accountId, templateId);
        const tplRoles = (tpl?.roles || []).map((r: any) => r?.roleName || r?.name).filter(Boolean);
        const missing: string[] = [];
        if (!tplRoles.includes(sellerRoleName)) missing.push(sellerRoleName);
        if (!tplRoles.includes(buyerRoleName)) missing.push(buyerRoleName);
        if (missing.length) {
          return NextResponse.json(
            {
              error: "Template role mismatch",
              hint: "Update DOCUSIGN_ROLE_SELLER / DOCUSIGN_ROLE_BUYER to match the template’s role names.",
              details: { templateId, templateRoles: tplRoles, missing },
            },
            { status: 422 }
          );
        }
      } catch (e: any) {
        const { status, text } = parseErr(e);
        return NextResponse.json(
          { error: "Template not found in selected account", status, details: text, templateId },
          { status: 404 }
        );
      }
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
    const envelopeDefinition: any = new docusign.EnvelopeDefinition();
    envelopeDefinition.emailSubject = `Water Traders – Trade ${trade.id}`;
    envelopeDefinition.emailBlurb = "Please review and sign the Water Traders agreement.";

    if (templateId) {
      const toTextTabs = (pairs: Record<string, string>) =>
        Object.entries(pairs).map(([label, value]) => {
          const t = new docusign.Text(); t.tabLabel = label; t.value = value ?? ""; return t;
        });

      const sellerRole = new docusign.TemplateRole();
      sellerRole.roleName = sellerRoleName;
      sellerRole.name = seller.name;
      sellerRole.email = seller.email;
      sellerRole.clientUserId = sellerRoleName; // embedded

      const buyerRole = new docusign.TemplateRole();
      buyerRole.roleName = buyerRoleName;
      buyerRole.name = buyer.name;
      buyerRole.email = buyer.email;
      buyerRole.clientUserId = buyerRoleName; // embedded

      sellerRole.tabs = new docusign.Tabs();
      buyerRole.tabs = new docusign.Tabs();
      sellerRole.tabs.textTabs = toTextTabs(customPairs);
      buyerRole.tabs.textTabs = toTextTabs(customPairs);

      envelopeDefinition.templateId = templateId;
      envelopeDefinition.templateRoles = [sellerRole, buyerRole];
    } else if (fileUrl) {
      const { name, data } = await fetchAsBase64(fileUrl);
      const doc = new docusign.Document();
      doc.documentBase64 = data;
      doc.name = name;
      doc.fileExtension = (name.split(".").pop() || "pdf").toLowerCase();
      doc.documentId = "1";

      envelopeDefinition.documents = [doc];

      const sellerSigner = new docusign.Signer();
      sellerSigner.email = seller.email;
      sellerSigner.name = seller.name;
      sellerSigner.recipientId = "1";
      sellerSigner.clientUserId = sellerRoleName;

      const buyerSigner = new docusign.Signer();
      buyerSigner.email = buyer.email;
      buyerSigner.name = buyer.name;
      buyerSigner.recipientId = "2";
      buyerSigner.clientUserId = buyerRoleName;

      envelopeDefinition.recipients = new docusign.Recipients();
      envelopeDefinition.recipients.signers = [sellerSigner, buyerSigner];
    } else {
      return NextResponse.json(
        { error: "No template or file configured. Set DOCUSIGN_TEMPLATE_ID or DOCUSIGN_FILE_URL." },
        { status: 422 }
      );
    }

    envelopeDefinition.status = "sent";

    /* -------- create envelope -------- */
    let envelopeSummary;
    try {
      envelopeSummary = await envelopesApi.createEnvelope(accountId, { envelopeDefinition });
    } catch (e: any) {
      const { status, text } = parseErr(e);
      return NextResponse.json({ error: "DocuSign createEnvelope failed", status, details: text }, { status: 502 });
    }

    const envelopeId = envelopeSummary?.envelopeId;
    if (!envelopeId) {
      return NextResponse.json({ error: "DocuSign did not return an envelopeId", raw: envelopeSummary || null }, { status: 502 });
    }

    /* -------- verify recipients before creating view (prevents 404) -------- */
    try {
      const recips = await envelopesApi.listRecipients(accountId, envelopeId);
      const allSigners: any[] = recips?.signers || [];
      const wantClientUserId = effectiveRole === "seller" ? sellerRoleName : buyerRoleName;
      const wantEmail = (effectiveRole === "seller" ? seller.email : buyer.email).toLowerCase();
      const wantName = (effectiveRole === "seller" ? seller.name : buyer.name);

      const match = allSigners.find(s =>
        (s.clientUserId || s.clientUserID) === wantClientUserId &&
        (s.email || "").toLowerCase() === wantEmail
      );

      if (!match) {
        return NextResponse.json(
          {
            error: "Embedded recipient not found on envelope (clientUserId/email mismatch).",
            hint:
              "Ensure clientUserId on template role or signer matches the one used for createRecipientView, and emails/names are identical.",
            details: {
              target: { clientUserId: wantClientUserId, email: wantEmail, name: wantName },
              presentRecipients: allSigners.map(s => ({
                email: s.email,
                name: s.name,
                clientUserId: s.clientUserId || s.clientUserID || null,
                roleName: s.roleName || null,
                status: s.status,
              })),
            },
          },
          { status: 422 }
        );
      }
    } catch (e: any) {
      const { status, text } = parseErr(e);
      return NextResponse.json({ error: "listRecipients failed", status, details: text }, { status: 502 });
    }

    /* -------- recipient view (embedded sign URL) -------- */
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
      const { status, text } = parseErr(e);
      return NextResponse.json(
        {
          error: "DocuSign createRecipientView failed",
          status,
          details: text,
          hint:
            "Double-check the name/email/clientUserId triple matches a recipient on this envelope. Recipient view URLs are single-use and expire quickly; generate right before redirect.",
        },
        { status: 502 }
      );
    }

    const signUrl = recipientView?.url;
    if (!signUrl) {
      return NextResponse.json({ error: "Failed to get embedded signing URL", raw: recipientView || null }, { status: 500 });
    }

    /* -------- debug short-circuit -------- */
    if (debug) {
      return NextResponse.json({
        ok: true,
        debug: {
          provider: "docusign",
          oauthBase,
          restBase,
          accountIdMasked: mask(accountId),
          integrationKeyMasked: mask(process.env.DOCUSIGN_INTEGRATION_KEY || ""),
          userIdMasked: mask(process.env.DOCUSIGN_USER_ID || ""),
          templateId: templateId || null,
          fileUrlPresent: !!fileUrl,
          viewer: { role: (viewer as any)?.role ?? null, authedEmailsMasked: authedEmails.map(maskEmail) },
          inferredRole,
          requestedRole,
          effectiveRole,
          targetRole,
          seller,
          buyer,
          envelopeId,
          returnUrl,
          pingUrl,
          userinfoAccounts: (userinfo?.accounts || []).map((a: any) => ({
            name: a?.account_name,
            idMasked: mask(a?.account_id || ""),
            baseUri: a?.base_uri || a?.baseUri || null,
            isDefault: !!a?.is_default,
          })),
        },
      });
    }

    return NextResponse.json({ url: signUrl });
  } catch (e: any) {
    console.error("[sign-url] error", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
