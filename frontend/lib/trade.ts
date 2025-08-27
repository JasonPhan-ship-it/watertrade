// lib/trade.ts
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { appUrl } from "@/lib/email";

export type Viewer =
  | { role: "seller" | "buyer"; via: "auth" | "token"; userId?: string } // userId here will be the *local* User.id when via="auth"
  | { role: "unknown"; via: "none" };

/** Accepts both NextRequest and native Request */
function readUrl(req: NextRequest | Request) {
  return new URL(req.url);
}

async function getLocalUserIdFromClerk(): Promise<string | null> {
  const { userId: clerkId } = auth();
  if (!clerkId) return null;
  const me = await prisma.user.findUnique({
    where: { clerkId }, // your User table has clerkId based on your other code
    select: { id: true },
  });
  return me?.id ?? null;
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
  const token = url.searchParams.get("token") || req.headers.get("x-trade-token") || "";

  // 1) Auth path (map Clerk -> local user.id, then compare to Trade foreign keys)
  const localUserId = await getLocalUserIdFromClerk();
  if (localUserId) {
    if (trade.sellerUserId && localUserId === trade.sellerUserId) {
      return { role: "seller", via: "auth", userId: localUserId };
    }
    if (trade.buyerUserId && localUserId === trade.buyerUserId) {
      return { role: "buyer", via: "auth", userId: localUserId };
    }
  }

  // 2) Magic-link / token path (optionally use ?role=seller|buyer for clarity)
  if (token) {
    const roleHint = (url.searchParams.get("role") || "").toLowerCase();
    if (trade.sellerToken && token === trade.sellerToken) {
      return { role: roleHint === "buyer" ? "buyer" : "seller", via: "token" };
    }
    if (trade.buyerToken && token === trade.buyerToken) {
      return { role: roleHint === "seller" ? "seller" : "buyer", via: "token" };
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
