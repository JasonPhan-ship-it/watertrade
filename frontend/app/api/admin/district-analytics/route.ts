export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}
function sum(ns: number[]) { return ns.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0); }
function median(ns: number[]) {
  if (!ns.length) return null;
  const a = [...ns].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export async function GET() {
  const { userId, sessionId } = auth();
  if (!userId || !sessionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sells = await prisma.listing.findMany({
    where: { status: "ACTIVE", kind: "SELL" },
    select: { district: true, acreFeet: true, pricePerAF: true },
    take: 2000,
  });
  const buys = await prisma.listing.findMany({
    where: { status: "ACTIVE", kind: "BUY" },
    select: { district: true, acreFeet: true, pricePerAF: true },
    take: 2000,
  });
  const recentTxns = await prisma.transaction.findMany({
    where: { status: { in: ["APPROVED", "FUNDS_RELEASED"] } },
    select: { listing: { select: { district: true } }, pricePerAF: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  const districts = new Set<string>([
    ...sells.map((x) => x.district),
    ...buys.map((x) => x.district),
    ...recentTxns.map((t) => t.listing?.district).filter(Boolean) as string[],
  ]);

  const rows = Array.from(districts).map((d) => {
    const sellsD = sells.filter((x) => x.district === d);
    const buysD  = buys.filter((x) => x.district === d);
    const txnsD  = recentTxns.filter((t) => t.listing?.district === d);

    const supplyAF = sum(sellsD.map((x) => x.acreFeet));
    const demandAF = sum(buysD.map((x) => x.acreFeet));

    const sellMedian = median(sellsD.map((x) => x.pricePerAF).filter(isFiniteNumber)) ?? null;
    const txnMedian  = median(txnsD.map((t) => t.pricePerAF).filter(isFiniteNumber)) ?? null;

    const alpha = 0.6;
    let base: number | null = null;
    if (txnMedian != null && sellMedian != null) base = Math.round(alpha * txnMedian + (1 - alpha) * sellMedian);
    else if (txnMedian != null) base = txnMedian;
    else if (sellMedian != null) base = sellMedian;

    const pressure = (demandAF + 1) / (supplyAF + 1);
    const suggested = base != null ? Math.round(base * clamp(pressure, 0.85, 1.25)) : null;

    return {
      district: d || "(Unspecified)",
      supplyAF,
      demandAF,
      activeSellMedianCents: sellMedian,
      recentTxnMedianCents: txnMedian,
      suggestedCents: suggested,
    };
  });

  return NextResponse.json({ rows });
}
