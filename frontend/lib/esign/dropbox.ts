// lib/esign/dropbox.ts
import { prisma } from "@/lib/prisma";

/**
 * Dropbox Sign (HelloSign) minimal client helpers
 * - Email delivery: sendTradeForSignatureUsingTemplate(...)
 * - Embedded signing: createEmbeddedWithTemplate(...), getEmbeddedSignUrl(...),
 *   and a convenience wrapper: sendTradeForEmbeddedSignatureUsingTemplate(...)
 */

const API_BASE = "https://api.hellosign.com/v3";

/* ---------------------------- Auth & Config ---------------------------- */

function getApiKey(): string {
  const key = process.env.DROPBOX_SIGN_API_KEY || "";
  if (!key) throw new Error("DROPBOX_SIGN_API_KEY is required for Dropbox Sign API calls.");
  return key;
}

function authHeader() {
  const key = getApiKey();
  // Basic auth: base64("apiKey:")
  const token = Buffer.from(`${key}:`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

function isTestMode() {
  // default to test unless explicitly disabled
  return String(process.env.DROPBOX_SIGN_TEST_MODE ?? "true") === "true";
}

/** Prefer server var but allow the public var as a fallback (useful for local dev). */
function getClientId(): string | undefined {
  const fromServer = (process.env.DROPBOX_SIGN_CLIENT_ID || "").trim();
  const fromPublic = (process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID || "").trim();
  const id = fromServer || fromPublic;
  return id || undefined;
}

/* ------------------------------ HTTP core ------------------------------ */

async function hsPostJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      ...authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    // Dropbox Sign often returns JSON bodies with useful info
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    const error = json?.error || json?.message || text || res.statusText;
    throw new Error(`Dropbox Sign ${path} failed: ${res.status} ${typeof error === "string" ? error : JSON.stringify(error)}`);
  }
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new Error(`Dropbox Sign ${path} returned non-JSON response`);
  }
}

async function hsGetJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      ...authHeader(),
    },
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    const error = json?.error || json?.message || text || res.statusText;
    throw new Error(`Dropbox Sign GET ${path} failed: ${res.status} ${typeof error === "string" ? error : JSON.stringify(error)}`);
  }
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new Error(`Dropbox Sign GET ${path} returned non-JSON response`);
  }
}

/* --------------------------- Domain utilities -------------------------- */

function usdPerAf(cents?: number | null) {
  const dollars = (cents ?? 0) / 100;
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/AF`;
}

/** Safely get (name, email) for buyer & seller based on trade record. */
async function loadBuyerSellerForTrade(tradeId: string) {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new Error("Trade not found");

  const [buyer, seller] = await Promise.all([
    trade.buyerUserId ? prisma.user.findUnique({ where: { id: trade.buyerUserId } }) : null,
    trade.sellerUserId ? prisma.user.findUnique({ where: { id: trade.sellerUserId } }) : null,
  ]);

  const buyerEmail = buyer?.email || (trade as any).buyerEmail || (trade as any).buyer_user_email || null;
  const sellerEmail = seller?.email || (trade as any).sellerEmail || (trade as any).seller_user_email || null;

  if (!buyerEmail || !sellerEmail) throw new Error("Buyer/Seller must have emails on file");

  const buyerName = buyer?.name || (trade as any).buyerName || (trade as any).buyer_user_name || "Buyer";
  const sellerName = seller?.name || (trade as any).sellerName || (trade as any).seller_user_name || "Seller";

  return {
    trade,
    buyer: { name: buyerName, email: buyerEmail },
    seller: { name: sellerName, email: sellerEmail },
  };
}

/* ----------------------- Email delivery (existing) ---------------------- */
/**
 * Create and send a Signature Request using a Template (Dropbox Sign emails signers).
 * Assumptions:
 * - Template roles: "Buyer" and "Seller" (case-sensitive)
 * - Populates custom fields from Trade
 */
export async function sendTradeForSignatureUsingTemplate(
  tradeId: string,
  args: { templateId: string }
) {
  const { trade, buyer, seller } = await loadBuyerSellerForTrade(tradeId);

  const priceLabel = usdPerAf(trade.pricePerAf);

  const body = {
    template_ids: [args.templateId],
    subject: "Water Transfer Agreement",
    message: "Please review and sign the agreement.",
    test_mode: isTestMode(),
    // Optional branding/callbacks (non-embedded flow can still include client_id)
    client_id: getClientId(),
    signers: [
      { role: "Buyer", name: buyer.name, email_address: buyer.email },
      { role: "Seller", name: seller.name, email_address: seller.email },
    ],
    // These names must match your template's custom field names
    custom_fields: [
      { name: "listing_title", value: trade.windowLabel || trade.listingTitle || "Offer Terms" },
      { name: "district",      value: trade.district || "" },
      { name: "water_type",    value: trade.waterType || "" },
      { name: "volume_af",     value: String(trade.volumeAf ?? "") },
      { name: "price_per_af",  value: priceLabel },
      { name: "window_label",  value: trade.windowLabel || "" },
    ],
    metadata: {
      tradeId: trade.id,
      transactionId: trade.transactionId || "",
      listingId: trade.listingId || "",
    },
  };

  type SendResp = {
    signature_request: {
      signature_request_id: string;
      signatures: Array<{
        signature_id: string;
        signer_role: string;
        signer_email_address: string;
        status_code: string;
      }>;
    };
  };

  const resp = await hsPostJson<SendResp>("/signature_request/send_with_template", body);

  return {
    requestId: resp.signature_request.signature_request_id,
    signatures: resp.signature_request.signatures,
  };
}

/* ----------------------- Embedded signing helpers ----------------------- */

/**
 * Create an **embedded** Signature Request using a Template.
 * Requires a **client_id** (API App) and returns the created request + signatures.
 * Docs: https://developers.hellosign.com/reference/operation/signatureRequestCreateEmbeddedWithTemplate/
 */
export async function createEmbeddedWithTemplate(tradeId: string, args: {
  templateId: string;
}) {
  const { trade, buyer, seller } = await loadBuyerSellerForTrade(tradeId);
  const client_id = getClientId();
  if (!client_id) throw new Error("DROPBOX_SIGN_CLIENT_ID (or NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID) is required for embedded signing.");

  const priceLabel = usdPerAf(trade.pricePerAf);

  const body = {
    template_ids: [args.templateId],
    subject: "Water Transfer Agreement",
    message: "Please review and sign the agreement.",
    test_mode: isTestMode(),
    client_id,
    signers: [
      { role: "Buyer",  name: buyer.name,  email_address: buyer.email },
      { role: "Seller", name: seller.name, email_address: seller.email },
    ],
    custom_fields: [
      { name: "listing_title", value: trade.windowLabel || trade.listingTitle || "Offer Terms" },
      { name: "district",      value: trade.district || "" },
      { name: "water_type",    value: trade.waterType || "" },
      { name: "volume_af",     value: String(trade.volumeAf ?? "") },
      { name: "price_per_af",  value: priceLabel },
      { name: "window_label",  value: trade.windowLabel || "" },
    ],
    metadata: {
      tradeId: trade.id,
      transactionId: trade.transactionId || "",
      listingId: trade.listingId || "",
    },
  };

  type Resp = {
    signature_request: {
      signature_request_id: string;
      signatures: Array<{
        signature_id: string;
        signer_role: string;
        signer_email_address: string;
        status_code: string;
      }>;
    };
  };

  const resp = await hsPostJson<Resp>("/signature_request/create_embedded_with_template", body);
  return {
    requestId: resp.signature_request.signature_request_id,
    signatures: resp.signature_request.signatures,
  };
}

/**
 * Get a **sign URL** for an embedded signing (one-time URL).
 * Docs: https://developers.hellosign.com/reference/operation/embeddedSignUrl/
 */
export async function getEmbeddedSignUrl(signatureId: string) {
  type SignUrlResp = {
    embedded: { sign_url: string; expires_at: number };
  };
  const resp = await hsPostJson<SignUrlResp>("/embedded/sign_url", { signature_id: signatureId });
  return resp.embedded;
}

/**
 * Convenience: create an embedded request via template and return the target signer’s sign URL.
 *
 * `forRole`: "Buyer" | "Seller"
 */
export async function sendTradeForEmbeddedSignatureUsingTemplate(
  tradeId: string,
  args: { templateId: string; forRole: "Buyer" | "Seller" }
) {
  const { requestId, signatures } = await createEmbeddedWithTemplate(tradeId, { templateId: args.templateId });

  const target = signatures.find(s => s.signer_role === args.forRole);
  if (!target) {
    const roles = signatures.map(s => s.signer_role);
    throw new Error(`Embedded request created (${requestId}) but role "${args.forRole}" not found. Present roles: ${roles.join(", ")}`);
  }

  const { sign_url, expires_at } = await getEmbeddedSignUrl(target.signature_id);
  return { requestId, signatureId: target.signature_id, signUrl: sign_url, expiresAt: expires_at };
}
