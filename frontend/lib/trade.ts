// lib/trade.ts
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { appUrl } from "@/lib/email";
import type { Trade } from "@prisma/client";

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

/**
 * Create a buyer embedded sign URL via Dropbox Sign (REST).
 * If envs are missing, returns your internal /sign page URL so the UI still navigates.
 */
export async function createBuyerSignatureLink(tradeId: string, buyerToken?: string | null): Promise<string> {
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
  // For now we route sellers to the internal page; mirror buyer flow later if needed.
  const apiKey = process.env.DROPBOX_SIGN_API_KEY;
  const clientId = process.env.DROPBOX_SIGN_CLIENT_ID;
  if (!apiKey || !clientId) {
    return appUrl(`/sign/${tradeId}?role=seller${sellerToken ? `&token=${sellerToken}` : ""}`);
  }
  return appUrl(`/sign/${tradeId}?role=seller${sellerToken ? `&token=${sellerToken}` : ""}`);
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
