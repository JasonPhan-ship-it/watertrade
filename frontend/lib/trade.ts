// lib/trade.ts
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { appUrl } from "@/lib/email";
import type { Trade, Transaction } from "@prisma/client";

/* =========================
   Viewer / Auth helpers
   ========================= */

export type Viewer =
  | { role: "seller" | "buyer"; via: "auth" | "token"; userId?: string } // userId is local User.id when via="auth"
  | { role: "unknown"; via: "none" };

/** Accept NextRequest or native Request safely */
function readUrl(req: NextRequest | Request) {
  const urlStr = (req as any)?.url ?? "";
  try {
    return new URL(urlStr);
  } catch {
    return new URL(appUrl("/")); // fallback, shouldn't happen in Next API
  }
}

function parseBearer(h?: string | null) {
  if (!h) return "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1] ?? "";
}

/** Resolve both local User.id and Clerk userId (for legacy rows that stored Clerk id) */
async function resolveSessionIds() {
  const { userId: clerkId } = auth();
  if (!clerkId) return { localId: null as string | null, clerkId: null as string | null };

  const local = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, clerkId: true },
  });

  return { localId: local?.id ?? null, clerkId };
}

/** Match helper: allow trades that stored either the local id OR the raw Clerk id */
function matchesAny(target?: string | null, a?: string | null, b?: string | null) {
  if (!target) return false;
  return target === a || target === b;
}

export async function getViewer(
  req: NextRequest | Request,
  trade: {
    sellerUserId: string | null;
    buyerUserId: string | null;
    sellerToken?: string | null;
    buyerToken?: string | null;
  }
): Promise<Viewer> {
  const url = readUrl(req);

  // Token can come from query or several header variants
  const tokenFromQuery = url.searchParams.get("token") || "";
  const headers = (req as any).headers;
  const tokenFromHeader =
    headers?.get?.("x-trade-token") ||
    headers?.get?.("x-magic-token") ||
    parseBearer(headers?.get?.("authorization")) ||
    "";
  const token = tokenFromQuery || tokenFromHeader;

  // 1) Auth path — accept *either* local user.id or raw Clerk id
  const { localId, clerkId } = await resolveSessionIds();
  if (localId || clerkId) {
    if (matchesAny(trade.sellerUserId, localId, clerkId)) {
      return { role: "seller", via: "auth", userId: localId ?? undefined };
    }
    if (matchesAny(trade.buyerUserId, localId, clerkId)) {
      return { role: "buyer", via: "auth", userId: localId ?? undefined };
    }
  }

  // 2) Magic-link / token path — role is determined by which token matches
  if (token) {
    if (trade.sellerToken && token === trade.sellerToken) {
      return { role: "seller", via: "token" };
    }
    if (trade.buyerToken && token === trade.buyerToken) {
      return { role: "buyer", via: "token" };
    }
  }

  return { role: "unknown", via: "none" };
}

/** Simple gate (leave as strings so it won't break if your enum changes) */
export function assertCanAct(role: "seller" | "buyer", status: string) {
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

/* =========================================
   Lookups that accept Trade.id OR Txn.id
   ========================================= */

/** Returns the Trade if id is a Trade.id, or if it's a Transaction.id linked to a Trade. */
export async function findTradeByAnyId(id: string) {
  const byTrade = await prisma.trade.findUnique({ where: { id } });
  if (byTrade) return byTrade;
  return prisma.trade.findFirst({ where: { transactionId: id } });
}

/**
 * Ensure a Trade exists given either a Trade.id or a Transaction.id.
 * If a Transaction exists but no Trade, this will create a minimal Trade row.
 * Throws if a required field is missing on the Transaction/Listing.
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

/* =========================================
   Signature link helpers (Dropbox Sign)
   - Returns an embedded sign_url if envs are present.
   - Throws with raw API error details on failure.
   - Falls back to /sign/:id when envs are missing.
   ========================================= */

type DbxErr = { message?: string; status?: number; response?: { status?: number; text?: string; data?: any } };

async function lazyDropbox() {
  return import("@dropbox/sign");
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
    } catch {
      /* non-fatal */
    }
  }

  if (!email) {
    // Embedded signing technically doesn't email, but Dropbox Sign still requires an email on the signer object.
    // Use a placeholder if you truly have none.
    email = `no-email+${trade.id}@example.com`;
  }

  return { name, email };
}

/**
 * Create a buyer embedded sign URL via Dropbox Sign.
 * If DROPBOX envs are missing, returns your internal /sign page URL so the UI still navigates.
 * On Dropbox failure, throws with details so the caller can surface/log real errors.
 */
export async function createBuyerSignatureLink(tradeId: string, buyerToken?: string | null): Promise<string> {
  const apiKey = process.env.DROPBOX_SIGN_API_KEY;
  const clientId = process.env.DROPBOX_SIGN_CLIENT_ID;

  // Fallback: no Dropbox configured → use your internal signer page
  if (!apiKey || !clientId) {
    return appUrl(`/sign/${tradeId}?role=buyer${buyerToken ? `&token=${buyerToken}` : ""}`);
  }

  const trade = await prisma.trade.findUnique({ where: { id: tradeId }, include: { listing: true } });
  if (!trade) throw new Error("Trade not found");

  const { SignatureRequestApi, EmbeddedApi, Configuration } = await lazyDropbox();
  const cfg = new Configuration({ username: apiKey });
  const sigApi = new SignatureRequestApi(cfg);
  const embApi = new EmbeddedApi(cfg);

  const { name, email } = await getBuyerNameEmail(trade);

  try {
    const testMode = (process.env.DROPBOX_SIGN_TEST_MODE ?? "1") === "1";
    const create = await sigApi.signatureRequestCreateEmbedded({
      clientId,
      testMode: testMode ? 1 : 0,
      title: `Water Traders — Trade ${tradeId}`,
      subject: "Please review and sign",
      message: "Review and sign to proceed.",
      signers: [{ emailAddress: email, name, order: 0 }],
      // TODO: swap to your generated doc; fileUrls keeps this example simple.
      fileUrls: [process.env.NEXT_PUBLIC_SAMPLE_PDF_URL || "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"],
      metadata: { tradeId },
    } as any);

    const signatureId = create.body.signatureRequest?.signatures?.[0]?.signatureId;
    if (!signatureId) throw new Error("Dropbox Sign did not return a signatureId");

    const sign = await embApi.embeddedSignUrl(signatureId);
    const signUrl = sign.body.embedded?.signUrl;
    if (!signUrl) throw new Error("Dropbox Sign did not return a sign_url");

    return signUrl;
  } catch (e: any) {
    // Bubble the *real* error to the caller (your route can log this and return a helpful message)
    const err = e as DbxErr;
    console.error("[createBuyerSignatureLink] error", {
      message: err?.message,
      status: err?.status || err?.response?.status,
      body: err?.response?.text || err?.response?.data,
    });
    throw new Error(err?.response?.text || err?.message || "Failed to create buyer sign URL");
  }
}

export async function createSellerSignatureLink(tradeId: string, sellerToken?: string | null): Promise<string> {
  // Mirror buyer behavior; many flows only need buyer signing first.
  const apiKey = process.env.DROPBOX_SIGN_API_KEY;
  const clientId = process.env.DROPBOX_SIGN_CLIENT_ID;

  if (!apiKey || !clientId) {
    return appUrl(`/sign/${tradeId}?role=seller${sellerToken ? `&token=${sellerToken}` : ""}`);
  }

  // Implement seller signer generation here if you need two-party signing.
  // For now, route seller to internal page (or replicate buyer logic with seller as signer).
  return appUrl(`/sign/${tradeId}?role=seller${sellerToken ? `&token=${sellerToken}` : ""}`);
}
