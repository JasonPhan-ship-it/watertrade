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

/* ---------------- DocuSign SDK (lazy) ---------------- */
let docusign: any = null;
let jwtApiClient: any = null;

async function loadDocuSign() {
  if (docusign && jwtApiClient) return;
  const mod = await import("docusign-esign").catch(() => null);
  if (!mod) return;
  docusign = mod;

  const basePath = process.env.DOCUSIGN_BASE_PATH || "https://account-d.docusign.com";
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY || "";
  const userId = process.env.DOCUSIGN_USER_ID || "";
  const privateKeyB64 = process.env.DOCUSIGN_PRIVATE_KEY_B64 || "";
  const privateKey = privateKeyB64 ? Buffer.from(privateKeyB64, "base64").toString("utf8") : "";

  const apiClient = new docusign.ApiClient();
  apiClient.setOAuthBasePath(new URL(basePath).hostname);
  jwtApiClient = {
    apiClient,
    basePath,
    integrationKey,
    userId,
    privateKey,
    scopes: ["signature", "impersonation"],
  };
}

async function getAccessToken(): Promise<{ accessToken: string; expiresAt: number }> {
  if (!docusign || !jwtApiClient) await loadDocuSign();
  if (!jwtApiClient?.privateKey || !jwtApiClient?.integrationKey || !jwtApiClient?.userId) {
    throw new Error("DocuSign credentials missing: check DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_PRIVATE_KEY_B64");
  }

  const dsApi = jwtApiClient.apiClient;
  // 10 minutes before expiry safety margin
  const targetLifetime = 60 * 60; // 1 hour
  const results = await dsApi.requestJWTUserToken(
    jwtApiClient.integrationKey,
    jwtApiClient.userId,
    jwtApiClient.scopes,
    jwtApiClient.privateKey,
    targetLifetime
  );
  const accessToken = results.body.access_token;
  const expiresAt = Math.floor(Date.now() / 1000) + (results.body.expires_in ?? targetLifetime) - 600;
  return { accessToken, expiresAt };
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
    const accountId = process.env.DOCUSIGN_ACCOUNT_ID || "";
    const templateId = process.env.DOCUSIGN_TEMPLATE_ID || "";
    const fileUrl = process.env.DOCUSIGN_FILE_URL || "";
    const ENV_SELLER = process.env.DOCUSIGN_ROLE_SELLER || "seller";
    const ENV_BUYER = process.env.DOCUSIGN_ROLE_BUYER || "buyer";
    const returnUrl = process.env.DOCUSIGN_RETURN_URL || "https://example.com/docusign/return";
    const pingUrl = process.env.DOCUSIGN_PING_URL || "";

    if (!accountId) {
      return NextResponse.json(
        { error: "DocuSign accountId missing (DOCUSIGN_ACCOUNT_ID)" },
        { status: 500 }
      );
    }

    // OAuth
    let access: { accessToken: string; expiresAt: number };
    try {
      access = await getAccessToken();
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "Failed to obtain DocuSign access token" },
        { status: 500 }
      );
    }

    // API clients
    const apiClient = new docusign.ApiClient();
    apiClient.setBasePath(process.env.DOCUSIGN_BASE_PATH ? new URL(process.env.DOCUSIGN_BASE_PATH).origin.replace("account", "demo").replace("account-d", "demo") : "https://demo.docusign.net/restapi");
    apiClient.addDefaultHeader("Authorization", "Bearer " + access.accessToken);

    const envelopesApi = new docusign.EnvelopesApi(apiClient);

    /* -------- map roles -------- */
    const sellerRoleName = ENV_SELLER;
    const buyerRoleName = ENV_BUYER;
    const targetRole = effectiveRole === "seller" ? sellerRoleName : buyerRoleName;

    /* -------- custom fields (tabs) -------- */
    // Note: For template-based flows, prefill via "templateRoles[x].tabs.textTabs".
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
    let envelopeDefinition: any = new docusign.EnvelopeDefinition();
    envelopeDefinition.emailSubject = `Water Traders – Trade ${trade.id}`;
    envelopeDefinition.emailBlurb = "Please review and sign the Water Traders agreement.";

    if (templateId) {
      // With template
      const sellerRole = new docusign.TemplateRole();
      sellerRole.roleName = sellerRoleName;
      sellerRole.name = seller.name;
      sellerRole.email = seller.email;

      const buyerRole = new docusign.TemplateRole();
      buyerRole.roleName = buyerRoleName;
      buyerRole.name = buyer.name;
      buyerRole.email = buyer.email;

      // Prefill text fields if your template has matching data labels
      const toTextTabs = (pairs: Record<string, string>) =>
        Object.entries(pairs).map(([label, value]) => {
          const t = new docusign.Text();
          t.tabLabel = label; // must match the Template's Data Label exactly
          t.value = value ?? "";
          return t;
        });

      sellerRole.tabs = new docusign.Tabs();
      buyerRole.tabs = new docusign.Tabs();
      sellerRole.tabs.textTabs = toTextTabs(customPairs);
      buyerRole.tabs.textTabs = toTextTabs(customPairs);

      envelopeDefinition.templateId = templateId;
      envelopeDefinition.templateRoles = [sellerRole, buyerRole];

    } else if (fileUrl) {
      // From a file URL (download and attach)
      const { name, data } = await fetchAsBase64(fileUrl);
      const doc = new docusign.Document();
      doc.documentBase64 = data;
      doc.name = name;
      doc.fileExtension = (name.split(".").pop() || "pdf").toLowerCase();
      doc.documentId = "1";

      envelopeDefinition.documents = [doc];

      // Recipients: create two signers; your routing order can be enforced if desired
      const sellerSigner = new docusign.Signer();
      sellerSigner.email = seller.email;
      sellerSigner.name = seller.name;
      sellerSigner.recipientId = "1";
      sellerSigner.clientUserId = sellerRoleName; // required for embedded

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
      return NextResponse.json(
        {
          error: "DocuSign createEnvelope failed",
          details: e?.response?.text || e?.message || String(e),
        },
        { status: 502 }
      );
    }

    const envelopeId = envelopeSummary?.envelopeId;
    if (!envelopeId) {
      return NextResponse.json(
        { error: "DocuSign did not return an envelopeId", raw: envelopeSummary || null },
        { status: 502 }
      );
    }

    /* -------- recipient view (embedded sign URL) -------- */
    // For embedded signing with templates, we must specify the role's recipient.
    // We use clientUserId to force embedded signer.
    const isSeller = effectiveRole === "seller";
    const signerEmail = isSeller ? seller.email : buyer.email;
    const signerName = isSeller ? seller.name : buyer.name;
    const clientUserId = isSeller ? sellerRoleName : buyerRoleName;

    // If using a template, ensure the TemplateRole's roleName matches your template,
    // and that you used the same clientUserId above (DocuSign uses name+email+clientUserId triple).
    const viewRequest = new docusign.RecipientViewRequest();
    viewRequest.returnUrl = returnUrl;
    if (pingUrl) {
      viewRequest.pingUrl = pingUrl;
      viewRequest.pingFrequency = 600; // seconds
    }
    viewRequest.authenticationMethod = "none";
    viewRequest.email = signerEmail;
    viewRequest.userName = signerName;
    viewRequest.clientUserId = clientUserId;

    let recipientView;
    try {
      recipientView = await envelopesApi.createRecipientView(accountId, envelopeId, { recipientViewRequest: viewRequest });
    } catch (e: any) {
      return NextResponse.json(
        {
          error: "DocuSign createRecipientView failed",
          details: e?.response?.text || e?.message || String(e),
        },
        { status: 502 }
      );
    }

    const signUrl = recipientView?.url;
    if (!signUrl) {
      return NextResponse.json(
        { error: "Failed to get embedded signing URL from DocuSign", raw: recipientView || null },
        { status: 500 }
      );
    }

    /* -------- debug short-circuit -------- */
    if (debug) {
      return NextResponse.json({
        ok: true,
        debug: {
          provider: "docusign",
          accountIdMasked: mask(process.env.DOCUSIGN_ACCOUNT_ID || ""),
          integrationKeyMasked: mask(process.env.DOCUSIGN_INTEGRATION_KEY || ""),
          userIdMasked: mask(process.env.DOCUSIGN_USER_ID || ""),
          templateId: templateId || null,
          fileUrlPresent: !!fileUrl,
          viewer: {
            role: (viewer as any)?.role ?? null,
            authedEmailsMasked: authedEmails.map(maskEmail),
          },
          inferredRole,
          requestedRole,
          effectiveRole,
          targetRole,
          seller,
          buyer,
          envelopeId,
          returnUrl,
          pingUrl,
        },
      });
    }

    return NextResponse.json({ url: signUrl });
  } catch (e: any) {
    console.error("[sign-url] error", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
