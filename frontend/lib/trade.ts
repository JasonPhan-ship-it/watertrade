// lib/trade.ts
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { appUrl } from "@/lib/email";
import type { Trade } from "@prisma/client";
import * as docusign from "docusign-esign";
import { createRecipientViewUrl, getDsClient } from "@/lib/docusign";
import { getSiteSetting } from "@/lib/site-settings";

/* =========================
   Viewer / Auth helpers
   ========================= */

export type Viewer =
  | { role: "seller" | "buyer"; via: "auth" | "token"; userId?: string }
  | { role: "unknown" | "forbidden"; via: "none"; reason?: string };

function readUrl(req: NextRequest | Request) {
  const urlStr = (req as any)?.url ?? "";
  try {
    return new URL(urlStr);
  } catch {
    return new URL(appUrl("/"));
  }
}

function parseBearer(h?: string | null) {
  if (!h) return "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1] ?? "";
}

function tokenFromRequest(req: NextRequest | Request): string {
  const url = readUrl(req);
  const q = url.searchParams.get("token") || "";
  const headers = (req as any).headers;
  const hToken =
    headers?.get?.("x-trade-token") ||
    headers?.get?.("x-magic-token") ||
    parseBearer(headers?.get?.("authorization")) ||
    "";
  return q || hToken || "";
}

/**
 * Resolve both the Clerk userId and your local User.id (if mapped).
 * Safe if auth() throws in non-node runtimes; returns null IDs.
 */
async function resolveSessionIds() {
  try {
    const { userId: clerkId } = auth();
    if (!clerkId) return { localId: null as string | null, clerkId: null as string | null };

    const local = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true, clerkId: true },
    });

    return { localId: local?.id ?? null, clerkId };
  } catch {
    return { localId: null, clerkId: null };
  }
}

function matchesAny(target?: string | null, a?: string | null, b?: string | null) {
  if (!target) return false;
  return !!(target === a || target === b);
}

/**
 * Core role resolver given a concrete Trade row.
 * - Prefers authenticated session mapping (localId or clerkId)
 * - Falls back to magic tokens (sellerToken / buyerToken) if provided
 */
export async function getViewerForTrade(
  req: NextRequest | Request,
  trade: {
    sellerUserId: string | null;
    buyerUserId: string | null;
    sellerToken?: string | null;
    buyerToken?: string | null;
  }
): Promise<Viewer> {
  const token = tokenFromRequest(req);

  // 1) Check auth session first
  const { localId, clerkId } = await resolveSessionIds();
  if (localId || clerkId) {
    if (matchesAny(trade.sellerUserId, localId, clerkId)) {
      return { role: "seller", via: "auth", userId: localId ?? undefined };
    }
    if (matchesAny(trade.buyerUserId, localId, clerkId)) {
      return { role: "buyer", via: "auth", userId: localId ?? undefined };
    }
    // Authenticated but not tied to this trade
    return { role: "forbidden", via: "none", reason: "Signed in, but not the buyer or seller on this trade." };
  }

  // 2) Optional magic token
  if (token) {
    if (trade.sellerToken && token === trade.sellerToken) {
      return { role: "seller", via: "token" };
    }
    if (trade.buyerToken && token === trade.buyerToken) {
      return { role: "buyer", via: "token" };
    }
    return { role: "forbidden", via: "none", reason: "Token provided, but it did not match seller or buyer token." };
  }

  // 3) No auth and no valid token
  return { role: "unknown", via: "none", reason: "Not signed in and no token provided." };
}

/**
 * Convenience: given a Trade status, gate which party can act.
 */
export function assertCanAct(role: "seller" | "buyer", status: Trade["status"]) {
  switch (status) {
    case "OFFERED":
    case "COUNTERED_BY_BUYER":
      if (role !== "seller") throw new Error("Only seller can act on this step.");
      return;
    case "COUNTERED_BY_SELLER":
      if (role !== "buyer") throw new Error("Only buyer can act on this step.");
      return;
    default:
      throw new Error("Trade is not awaiting a counter/decision.");
  }
}

/* ================================
   Lookups (Trade.id OR Txn.id)
   ================================ */

/**
 * Try to resolve by Trade.id first; then by Transaction.id (via trade.transactionId).
 */
export async function findTradeByAnyId(id: string) {
  const byTrade = await prisma.trade.findUnique({ where: { id } });
  if (byTrade) return byTrade;
  return prisma.trade.findFirst({ where: { transactionId: id } });
}

/**
 * If no Trade exists for a Transaction.id, optionally create one
 * using fields mirrored off Transaction/Listing.
 */
export async function ensureTradeFromAnyIdOrCreate(id: string): Promise<Trade | null> {
  const existing = await findTradeByAnyId(id);
  if (existing) return existing;

  const txn = await prisma.transaction.findUnique({
    where: { id },
    include: { listing: { select: { id: true, district: true, title: true, waterType: true } } },
  });
  if (!txn) return null;

  const listingId = txn.listing?.id ?? null;
  const district =
    (txn as any).districtSnapshot ??
    txn.listing?.district ??
    null;

  if (!listingId || !district) {
    throw new Error("Cannot create Trade: missing listingId or district on Transaction/Listing.");
  }

  const created = await prisma.trade.create({
    data: {
      transactionId: txn.id,
      listingId,
      district,
      sellerUserId: (txn as any).sellerUserId ?? (txn as any).sellerId ?? undefined,
      buyerUserId:  (txn as any).buyerUserId  ?? (txn as any).buyerId  ?? undefined,
      pricePerAf:   (txn as any).pricePerAf   ?? (txn as any).pricePerAF ?? undefined,
      volumeAf:     (txn as any).volumeAf     ?? (txn as any).acreFeet   ?? undefined,
      status: "OFFERED" as Trade["status"],
      round: 0,
    } as any,
  });

  return created;
}

/**
 * 🔑 High-level entry point you should use in pages & API routes.
 * Accepts either a Trade.id or a Transaction.id. If a Trade does not exist
 * for a Transaction, it can auto-create one (configurable).
 */
export async function getViewerById(
  req: NextRequest | Request,
  id: string,
  opts: { createIfMissing?: boolean } = { createIfMissing: true }
): Promise<{ viewer: Viewer; trade: Trade | null }> {
  // Resolve trade (Trade.id OR Transaction.id). Optionally create.
  const trade = opts.createIfMissing
    ? await ensureTradeFromAnyIdOrCreate(id)
    : await findTradeByAnyId(id);

  if (!trade) {
    return {
      viewer: { role: "forbidden", via: "none", reason: "Trade not found for id (may be a Transaction.id without an associated Trade yet)." },
      trade: null,
    };
  }

  const viewer = await getViewerForTrade(req, {
    sellerUserId: trade.sellerUserId,
    buyerUserId: trade.buyerUserId,
    sellerToken: (trade as any).sellerToken ?? null,
    buyerToken: (trade as any).buyerToken ?? null,
  });

  return { viewer, trade };
}

/* =========================================
   DocuSign helpers
   ========================================= */

const USD_FORMATTER = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const NUMBER_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" });

function formatUsd(amount: number) {
  try {
    return USD_FORMATTER.format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function formatNumber(amount: number) {
  try {
    return NUMBER_FORMATTER.format(amount);
  } catch {
    return amount.toString();
  }
}

function formatDate(date: Date) {
  try {
    return DATE_FORMATTER.format(date);
  } catch {
    return date.toISOString().split("T")[0];
  }
}

function escapeHtml(input: string | null | undefined) {
  if (!input) return "";
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildDocuSignSellerHtml(args: {
  trade: any;
  listing: any;
  buyerAccount: string;
  sellerFarmLabel: string;
  sellerName: string;
  sellerEntity: string;
  buyerName: string;
  buyerEntity: string;
  agreementDate: string;
  agreementYear: string;
}) {
  const {
    trade,
    listing,
    buyerAccount,
    sellerFarmLabel,
    sellerName,
    sellerEntity,
    buyerName,
    buyerEntity,
    agreementDate,
    agreementYear,
  } = args;
  const district = trade?.district || listing?.district || "";
  const waterType = trade?.waterType || listing?.waterType || "";
  const volumeAf = Number(trade?.volumeAf ?? 0);
  const pricePerAfDollars = Number(trade?.pricePerAf ?? 0) / 100;
  const totalValue = volumeAf * pricePerAfDollars;
  const waterCodeValue = listing?.waterCodeValue || listing?.waterCode?.code || "";
  const waterCodeYear = listing?.waterCodeYear || listing?.waterCode?.year || "";
  const waterCodeDescription = listing?.waterCodeDescription || listing?.waterCode?.description || "";

  const partyRows = [
    { label: "Seller name", value: sellerName },
    { label: "Seller entity", value: sellerEntity },
    { label: "Buyer name", value: buyerName },
    { label: "Buyer entity", value: buyerEntity },
  ];

  const detailRows = [
    { label: "Agreement year", value: agreementYear },
    { label: "Agreement date", value: agreementDate },
    { label: "District", value: district },
    { label: "Water type", value: waterType },
    { label: "Water code", value: waterCodeValue },
    { label: "Water year", value: waterCodeYear },
    { label: "Description", value: waterCodeDescription },
    { label: "Volume (AF)", value: volumeAf ? formatNumber(volumeAf) : "" },
    { label: "Price / AF", value: pricePerAfDollars ? formatUsd(pricePerAfDollars) : "" },
    { label: "Estimated value", value: totalValue ? formatUsd(totalValue) : "" },
    { label: "Seller farm", value: sellerFarmLabel },
    { label: "Buyer water account #", value: buyerAccount },
  ];

  function buildTableRows(rows: { label: string; value: string }[]) {
    return rows
      .map((row) => {
        const safeValue = row.value ? escapeHtml(String(row.value)) : "—";
        return `
          <tr>
            <td style="padding:6px 4px;border-bottom:1px solid #e2e8f0;color:#475569;width:40%;">${escapeHtml(row.label)}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #e2e8f0;color:#0f172a;">${safeValue}</td>
          </tr>
        `;
      })
      .join("");
  }

  const partyTableRows = buildTableRows(partyRows);
  const detailTableRows = buildTableRows(detailRows);

  return `<!DOCTYPE html>
  <html>
    <body style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;padding:24px;">
      <h2 style="margin-top:0;color:#0f172a;">Water Transfer Summary</h2>
      <p style="font-size:14px;color:#1e293b;">Trade ID: <strong>${escapeHtml(trade?.id || "")}</strong></p>
      <h3 style="margin-top:24px;color:#0f172a;font-size:16px;">Parties</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px;">
        <tbody>
          ${partyTableRows}
        </tbody>
      </table>
      <h3 style="margin-top:24px;color:#0f172a;font-size:16px;">Transfer details</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px;">
        <tbody>
          ${detailTableRows}
        </tbody>
      </table>
      <p style="margin-top:24px;font-size:13px;color:#1e293b;">Please sign here: /sn1/</p>
    </body>
  </html>`;
}

async function createSellerDocuSignEnvelope(trade: any, sellerToken?: string | null) {
  const { name, email } = await getSellerNameEmail(trade as Trade);
  const { apiClient, accountId } = await getDsClient();
  const envelopesApi = new docusign.EnvelopesApi(apiClient);

  const listing = trade?.listing || {};
  const transaction = trade?.transaction || {};
  const sellerFarm = listing?.sellerFarm || null;
  const docuSignDefaults = await getSiteSetting("docuSignDefaults");
  const sellerFarmLabel = sellerFarm
    ? [sellerFarm.name, sellerFarm.accountNumber ? `#${sellerFarm.accountNumber}` : null].filter(Boolean).join(" ")
    : "";
  const buyerAccount = (
    transaction?.buyerWaterAccount ||
    listing?.buyerWaterAccount ||
    docuSignDefaults.buyerWaterAccountNumber ||
    ""
  ).trim();
   
  const buyerProfile = (trade as any)?.buyer?.profile || {};
  const sellerProfile = (trade as any)?.seller?.profile || {};

  const { name: buyerFallbackName } = await getBuyerNameEmail(trade as Trade);

  const sellerNameSnapshot = transaction?.sellerNameSnapshot || "";
  const buyerNameSnapshot = transaction?.buyerNameSnapshot || "";

  const sellerName =
    sellerNameSnapshot || sellerProfile.fullName || (trade as any)?.seller?.name || name;
  const buyerName =
    buyerNameSnapshot || buyerProfile.fullName || (trade as any)?.buyer?.name || buyerFallbackName;

  const sellerEntity =
    sellerProfile.company || sellerFarm?.name || docuSignDefaults.sellerLegalEntity || "";
  const buyerEntity = buyerProfile.company || docuSignDefaults.buyerLegalEntity || "";

  const agreementBaseDate = transaction?.createdAt ? new Date(transaction.createdAt) : new Date();
  const agreementDate = formatDate(agreementBaseDate);
  const agreementYear = String(agreementBaseDate.getFullYear());

  const html = buildDocuSignSellerHtml({
    trade,
    listing,
    buyerAccount,
    sellerFarmLabel,
    sellerName,
    sellerEntity,
    buyerName,
    buyerEntity,
    agreementDate,
    agreementYear,
  });

  const document = new docusign.Document();
  document.documentBase64 = Buffer.from(html, "utf8").toString("base64");
  document.name = `Trade-${trade.id}.html`;
  document.fileExtension = "html";
  document.documentId = "1";

  const signHere = new docusign.SignHere();
  signHere.documentId = "1";
  signHere.recipientId = "1";
  signHere.anchorString = "/sn1/";
  signHere.anchorUnits = "pixels";
  signHere.anchorXOffset = "0";
  signHere.anchorYOffset = "0";

  const tabs = new docusign.Tabs();
  tabs.signHereTabs = [signHere];

  const signer = new docusign.Signer();
  signer.email = email;
  signer.name = name;
  signer.recipientId = "1";
  signer.clientUserId = trade.id;
  signer.routingOrder = "1";
  signer.tabs = tabs;

  const recipients = new docusign.Recipients();
  recipients.signers = [signer];

  const env = new docusign.EnvelopeDefinition();
  env.emailSubject = `Sign water transfer for ${listing?.title || trade?.district || "Water trade"}`;
  env.documents = [document];
  env.recipients = recipients;
  env.status = "sent";

  const customField = new docusign.TextCustomField();
  customField.name = "tradeId";
  customField.value = trade.id;
  const customFields = new docusign.CustomFields();
  customFields.textCustomFields = [customField];
  env.customFields = customFields;

  const created = await envelopesApi.createEnvelope(accountId, { envelopeDefinition: env });
  const envelopeId = String((created as any)?.envelopeId || (created as any)?.envelopeID || "");

  const returnPath = `/api/trades/${trade.id}/seller/signing-complete${
    sellerToken ? `?token=${encodeURIComponent(sellerToken)}` : ""
  }`;
  const signUrl = await createRecipientViewUrl({
    envelopeId,
    recipient: { clientUserId: trade.id, email, name },
    returnUrl: appUrl(returnPath),
  });

  if (trade.transactionId) {
    await prisma.transaction
      .update({
        where: { id: trade.transactionId },
        data: {
          docusignEnvelopeId: envelopeId,
          sellerClientUserId: trade.id,
          sellerSignUrl: signUrl,
          buyerWaterAccount: buyerAccount || transaction?.buyerWaterAccount || listing?.buyerWaterAccount || null,
          sellerFarmId: listing?.sellerFarmId ?? transaction?.sellerFarmId ?? null,
        },
      })
      .catch(() => null);
  }

  return signUrl;
}

/* =========================================
   Dropbox Sign helpers (REST, no SDK)
   ========================================= */

// Base URL: US by default; set DROPBOX_SIGN_BASE_URL to EU if needed.
const DBX_BASE = process.env.DROPBOX_SIGN_BASE_URL || "https://api.hellosign.com/v3";

// Build Basic auth header: "Basic base64(API_KEY:)"
function dbxAuthHeader(apiKey: string) {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}

async function getBuyerNameEmail(trade: Trade): Promise<{ name: string; email: string }> {
  const buyer = trade.buyerUserId
    ? await prisma.user.findUnique({ where: { id: trade.buyerUserId }, select: { name: true, email: true, clerkId: true } })
    : null;

  let name = buyer?.name || "Buyer";
  let email = buyer?.email || "";

  if ((!email || !name) && buyer?.clerkId) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const u = await clerkClient.users.getUser(buyer.clerkId);
      name = name || u.firstName || u.username || "Buyer";
      const primary = u.emailAddresses?.find(e => e.id === u.primaryEmailAddressId)?.emailAddress;
      email = email || primary || u.emailAddresses?.[0]?.emailAddress || "";
    } catch { /* non-fatal */ }
  }

  // Embedded flow still requires a signer email field
  if (!email) email = `no-email+${trade.id}@example.com`;

  return { name, email };
}

async function getSellerNameEmail(trade: Trade): Promise<{ name: string; email: string }> {
  const seller = trade.sellerUserId
    ? await prisma.user.findUnique({ where: { id: trade.sellerUserId }, select: { name: true, email: true, clerkId: true } })
    : null;

  let name = seller?.name || "Seller";
  let email = seller?.email || "";

  if ((!email || !name) && seller?.clerkId) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const u = await clerkClient.users.getUser(seller.clerkId);
      name = name || u.firstName || u.username || "Seller";
      const primary = u.emailAddresses?.find(e => e.id === u.primaryEmailAddressId)?.emailAddress;
      email = email || primary || u.emailAddresses?.[0]?.emailAddress || "";
    } catch { /* non-fatal */ }
  }

  if (!email) email = `no-email-seller+${trade.id}@example.com`;

  return { name, email };
}

/**
 * Create a buyer embedded sign URL via Dropbox Sign (REST).
 * If envs are missing, returns your internal /sign page URL so the UI still navigates.
 */
export async function createBuyerSignatureLink(
  tradeId: string,
  buyerToken?: string | null,
  opts?: { redirectTo?: string }
): Promise<string> {
  const apiKey = process.env.DROPBOX_SIGN_API_KEY;
  const clientId = process.env.DROPBOX_SIGN_CLIENT_ID;

  // Fallback: not configured → use internal page
  if (!apiKey || !clientId) {
    return appUrl(`/sign/${tradeId}?role=buyer${buyerToken ? `&token=${buyerToken}` : ""}`);
  }

  const trade = await prisma.trade.findUnique({ where: { id: tradeId }, include: { listing: true } });
  if (!trade) throw new Error("Trade not found");

  const { name, email } = await getBuyerNameEmail(trade);

  // 1) Create embedded signature request
  const form = new URLSearchParams();
  const testMode = (process.env.DROPBOX_SIGN_TEST_MODE ?? "1") === "1";
  form.set("client_id", clientId);
  form.set("test_mode", testMode ? "1" : "0");
  form.set("title", `Water Traders — Trade ${tradeId}`);
  form.set("subject", "Please review and sign");
  form.set("message", "Review and sign to proceed.");
  form.set("signers[0][email_address]", email);
  form.set("signers[0][name]", name);
  form.set("signers[0][order]", "0");
  form.append(
    "file_url[]",
    process.env.NEXT_PUBLIC_SAMPLE_PDF_URL ||
      "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
  );
  // Optional metadata
  form.set("metadata[tradeId]", tradeId);
  const redirectTarget = opts?.redirectTo
    ? opts.redirectTo
    : `/api/trades/${tradeId}/buyer/signing-complete${
        buyerToken ? `?token=${encodeURIComponent(buyerToken)}` : ""
      }`;
  form.set("signing_redirect_url", appUrl(redirectTarget));

  const createResp = await fetch(`${DBX_BASE}/signature_request/create_embedded`, {
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
    const msg =
      createBody?.error?.error_name ||
      createBody?.error ||
      createResp.statusText ||
      "Dropbox Sign create_embedded failed";
    throw new Error(msg);
  }

  const signatureId =
    createBody?.signature_request?.signatures?.[0]?.signature_id ||
    createBody?.signatureRequest?.signatures?.[0]?.signature_id;

  if (!signatureId) {
    throw new Error("Dropbox Sign did not return a signature_id");
  }

  // 2) Get embedded sign URL
  const signResp = await fetch(`${DBX_BASE}/embedded/sign_url/${encodeURIComponent(signatureId)}`, {
    method: "GET",
    headers: {
      Authorization: dbxAuthHeader(apiKey),
      Accept: "application/json",
    },
  });

  const signText = await signResp.text();
  let signBody: any = null;
  try { signBody = signText ? JSON.parse(signText) : null; } catch {}

  if (!signResp.ok) {
    const msg =
      signBody?.error?.error_name ||
      signBody?.error ||
      signResp.statusText ||
      "Dropbox Sign embedded/sign_url failed";
    throw new Error(msg);
  }

  const signUrl = signBody?.embedded?.sign_url || signBody?.embedded?.signUrl;
  if (!signUrl) throw new Error("Dropbox Sign did not return a sign_url");

  // 🔑 Ensure the embedded page receives your client_id
  const cid = process.env.DROPBOX_SIGN_CLIENT_ID || process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID;
  const urlWithClient = cid
    ? `${signUrl}${signUrl.includes("?") ? "&" : "?"}client_id=${encodeURIComponent(cid)}`
    : signUrl;

  return urlWithClient;
}

export async function createSellerSignatureLink(tradeId: string, sellerToken?: string | null): Promise<string> {
  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: {
      listing: { include: { waterCode: true, sellerFarm: true } },
      transaction: {
        select: {
          id: true,
          buyerWaterAccount: true,
          sellerFarmId: true,
          docusignEnvelopeId: true,
          buyerNameSnapshot: true,
          sellerNameSnapshot: true,
          createdAt: true,
        },
      },
      seller: {
        select: {
          id: true,
          name: true,
          profile: {
            select: { company: true, fullName: true },
          },
        },
      },
      buyer: {
        select: {
          id: true,
          name: true,
          profile: {
            select: { company: true, fullName: true },
          },
        },
      },
    },
  });
  if (!trade) throw new Error("Trade not found");

  const resolvedSellerToken = sellerToken ?? (trade as any).sellerToken ?? null;

  const docuSignConfigured = Boolean(
    process.env.DOCUSIGN_INTEGRATION_KEY && process.env.DOCUSIGN_USER_ID && process.env.DOCUSIGN_PRIVATE_KEY
  );

  if (docuSignConfigured) {
    try {
      const docuSignLink = await createSellerDocuSignEnvelope(trade, resolvedSellerToken);
      if (docuSignLink) return docuSignLink;
    } catch (err) {
      console.error("[trade] DocuSign seller envelope failed; falling back to Dropbox Sign", err);
    }
  }

  const apiKey = process.env.DROPBOX_SIGN_API_KEY;
  const clientId = process.env.DROPBOX_SIGN_CLIENT_ID;

  if (!apiKey || !clientId) {
    return appUrl(`/sign/${tradeId}?role=seller${resolvedSellerToken ? `&token=${resolvedSellerToken}` : ""}`);
  }

  const { name, email } = await getSellerNameEmail(trade as Trade);

  const form = new URLSearchParams();
  const testMode = (process.env.DROPBOX_SIGN_TEST_MODE ?? "1") === "1";
  form.set("client_id", clientId);
  form.set("test_mode", testMode ? "1" : "0");
  form.set("title", `Water Traders — Seller Signature ${tradeId}`);
  form.set("subject", "Sign the transfer agreement");
  form.set("message", "Please sign to continue the transaction.");
  form.set("signers[0][email_address]", email);
  form.set("signers[0][name]", name);
  form.set("signers[0][order]", "0");
  form.append(
    "file_url[]",
    process.env.NEXT_PUBLIC_SAMPLE_PDF_URL ||
      "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
  );
  form.set("metadata[tradeId]", tradeId);
  const redirectTarget = `/api/trades/${tradeId}/seller/signing-complete${
    resolvedSellerToken ? `?token=${encodeURIComponent(resolvedSellerToken)}` : ""
  }`;
  form.set("signing_redirect_url", appUrl(redirectTarget));

  const createResp = await fetch(`${DBX_BASE}/signature_request/create_embedded`, {
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
    const msg =
      createBody?.error?.error_name ||
      createBody?.error ||
      createResp.statusText ||
      "Dropbox Sign create_embedded failed";
    throw new Error(msg);
  }

  const signatureId =
    createBody?.signature_request?.signatures?.[0]?.signature_id ||
    createBody?.signatureRequest?.signatures?.[0]?.signature_id;

  if (!signatureId) {
    throw new Error("Dropbox Sign did not return a signature_id");
  }

  const signResp = await fetch(`${DBX_BASE}/embedded/sign_url/${encodeURIComponent(signatureId)}`, {
    method: "GET",
    headers: {
      Authorization: dbxAuthHeader(apiKey),
      Accept: "application/json",
    },
  });

  const signText = await signResp.text();
  let signBody: any = null;
  try { signBody = signText ? JSON.parse(signText) : null; } catch {}

  if (!signResp.ok) {
    const msg =
      signBody?.error?.error_name ||
      signBody?.error ||
      signResp.statusText ||
      "Dropbox Sign embedded/sign_url failed";
    throw new Error(msg);
  }

  const signUrl = signBody?.embedded?.sign_url || signBody?.embedded?.signUrl;
  if (!signUrl) throw new Error("Dropbox Sign did not return a sign_url");

  const cid = process.env.DROPBOX_SIGN_CLIENT_ID || process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID;
  const urlWithClient = cid
    ? `${signUrl}${signUrl.includes("?") ? "&" : "?"}client_id=${encodeURIComponent(cid)}`
    : signUrl;

  return urlWithClient;
}

export async function getViewer(
  req: NextRequest | Request,
  arg:
    | string
    | {
        sellerUserId: string | null;
        buyerUserId: string | null;
        sellerToken?: string | null;
        buyerToken?: string | null;
      },
  opts?: { createIfMissing?: boolean }
): Promise<Viewer> {
  if (typeof arg === "string") {
    const { viewer } = await getViewerById(req, arg, opts ?? { createIfMissing: true });
    return viewer;
  }
  // arg is a Trade-like object
  return getViewerForTrade(req, arg);
}
