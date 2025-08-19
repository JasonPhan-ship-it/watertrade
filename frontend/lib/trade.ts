// lib/trade.ts
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { appUrl } from "@/lib/email"; // we added this earlier

export type Viewer =
  | { role: "seller" | "buyer"; via: "auth" | "token"; userId?: string }
  | { role: "unknown"; via: "none" };

export async function getViewer(req: NextRequest, trade: { sellerUserId: string; buyerUserId: string; sellerToken: string; buyerToken: string; }) : Promise<Viewer> {
  const { userId } = auth();
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-trade-token") || "";

  if (userId) {
    if (userId === trade.sellerUserId) return { role: "seller", via: "auth", userId };
    if (userId === trade.buyerUserId) return { role: "buyer", via: "auth", userId };
  }
  if (token) {
    if (token === trade.sellerToken) return { role: "seller", via: "token" };
    if (token === trade.buyerToken) return { role: "buyer", via: "token" };
  }
  return { role: "unknown", via: "none" };
}

export function nextRound(r: number) { return Math.max(1, r + 1); }

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

// Stub: create signing links. Replace with your e-signature provider.
export async function createBuyerSignatureLink(tradeId: string, buyerToken: string) {
  return appUrl(`/sign/${tradeId}?role=buyer&token=${buyerToken}`);
}
export async function createSellerSignatureLink(tradeId: string, sellerToken: string) {
  return appUrl(`/sign/${tradeId}?role=seller&token=${sellerToken}`);
}
