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
  const sellerName = seller?.name || (trade as any).s
