// lib/trade.ts
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { appUrl } from "@/lib/email"; // used by the signature link helpers

export type Viewer =
  | { role: "seller" | "buyer"; via: "auth" | "token"; userId?: string }
  | { role: "unknown"; via: "none" };

/** Accepts both NextRequest and native Request */
function readUrl(req: NextRequest | Request) {
  return new URL(req.url);
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
  const { userId } = auth();
  const url = readUrl(req);

  // Both NextRequest and Request expose Headers with .get()
  const token =
    url.searchParams.get("token") ||
    req.headers.get("x-trade-token") ||
    "";

  if (userId) {
    if (trade.sellerUserId && userId === trade.sellerUserId) {
      return { role: "seller", via: "auth", userId };
    }
    if (trade.buyerUserId && userId === trade.buyerUserId) {
      return { role: "buyer", via: "auth", userId };
    }
  }

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

// Stub: create signing links. Replace with your e-signature provider.
export async function createBuyerSignatureLink(tradeId: string, buyerToken: string | null | undefined) {
  return appUrl(`/sign/${tradeId}?role=buyer${buyerToken ? `&token=${buyerToken}` : ""}`);
}
export async function createSellerSignatureLink(tradeId: string, sellerToken: string | null | undefined) {
  return appUrl(`/sign/${tradeId}?role=seller${sellerToken ? `&token=${sellerToken}` : ""}`);
}
