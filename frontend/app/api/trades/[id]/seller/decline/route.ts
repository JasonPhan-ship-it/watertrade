// app/api/trades/[id]/seller/decline/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer, findTradeByAnyId } from "@/lib/trade";
import { TradeStatus, TransactionStatus, Party } from "@prisma/client";

/** Create or fetch a Trade given a Trade.id OR a Transaction.id */
async function ensureTradeFromAnyIdOrThrow(id: string) {
  const existing = await findTradeByAnyId(id);
  if (existing) return existing;

  const txn = await prisma.transaction.findUnique({
    where: { id },
    include: { listing: { select: { id: true, district: true } } },
  });
  if (!txn) return null;

  const listingId = txn.listing?.id ?? null;
  const district =
    (txn as any).districtSnapshot ??
    txn.listing?.district ??
    null;

  if (!listingId || !district) {
    throw new Error("Cannot create Trade: missing listingId or district.");
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
      status: TradeStatus.OFFERED,
      round: 0,
    } as any,
  });
  return created;
}

/** Best-effort helpers to pick valid enum values across schemas */
function pickDeclinedTradeStatus(): (typeof TradeStatus)[keyof typeof TradeStatus] {
  const TS: any = TradeStatus;
  return TS.DECLINED_BY_SELLER ?? TS.SELLER_DECLINED ?? TS.DECLINED ?? TS.CANCELLED ?? TS.REJECTED ?? TS.EXPIRED;
}

function pickDeclinedTxnStatus(): (typeof TransactionStatus)[keyof typeof TransactionStatus] | null {
  const TXS: any = TransactionStatus;
  return TXS.DECLINED ?? TXS.CANCELLED ?? TXS.REJECTED ?? null;
}

export async function GET()  { return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 }); }
export async function HEAD() { return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 }); }

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const rawId = (params.id || "").trim();
    if (!rawId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Accept Trade.id OR Transaction.id (and create Trade if needed)
    const trade = await ensureTradeFromAnyIdOrThrow(rawId);
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Must be seller
    const viewer = await getViewer(req, trade as any);
    if (viewer.role !== "seller") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const DECLINED = pickDeclinedTradeStatus();

    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: DECLINED,
        lastActor: Party.SELLER,
        round: (trade as any).round ? (trade as any).round + 1 : 1,
        version: { increment: 1 },
        events: {
          create: {
            actor: "seller",
            kind: "DECLINE",
            payload: { previousStatus: (trade as any).status, round: (trade as any).round },
          },
        },
      },
      select: { id: true, status: true, transactionId: true },
    });

    // Best-effort Transaction sync
    if (updated.transactionId) {
      try {
        const txDeclined = pickDeclinedTxnStatus();
        if (txDeclined) {
          await prisma.transaction.update({
            where: { id: updated.transactionId },
            data: { status: txDeclined },
          });
        }
      } catch (e) {
        console.warn("[seller/decline] transaction sync skipped:", (e as any)?.message);
      }
    }

    return NextResponse.json({ ok: true, tradeId: updated.id, status: updated.status });
  } catch (e: any) {
    console.error("[api/trades/:id/seller/decline] error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
