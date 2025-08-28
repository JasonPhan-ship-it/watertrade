// lib/trade.ts
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { appUrl } from "@/lib/email";

export type Viewer =
  | { role: "seller" | "buyer"; via: "auth" | "token"; userId?: string } // userId is local User.id when via="auth"
  | { role: "unknown"; via: "none" };

/** Accept NextRequest or native Request safely */
function readUrl(req: NextRequest | Request) {
  return new URL((req as any).url);
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

/** Accepts either a Trade.id or a Transaction.id and returns the Trade if linked */
export async function findTradeByAnyId(id: string) {
  const byTrade = await prisma.trade.findUnique({ where: { id } });
  if (byTrade) return byTrade;
  return prisma.trade.findFirst({ where: { transactionId: id } });
}

// Signature links
export async function createBuyerSignatureLink(tradeId: string, buyerToken?: string | null) {
  return appUrl(`/sign/${tradeId}?role=buyer${buyerToken ? `&token=${buyerToken}` : ""}`);
}
export async function createSellerSignatureLink(tradeId: string, sellerToken?: string | null) {
  return appUrl(`/sign/${tradeId}?role=seller${sellerToken ? `&token=${sellerToken}` : ""}`);
}
