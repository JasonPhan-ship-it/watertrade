// app/api/trades/[id]/seller/decline/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer, findTradeByAnyId } from "@/lib/trade";
import { TradeStatus, TransactionStatus, Party } from "@prisma/client";

export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
export async function HEAD() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const rawId = (params.id || "").trim();
    if (!rawId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Support Trade.id or Transaction.id
    const trade = await findTradeByAnyId(rawId);
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Must be seller
    const viewer = await getViewer(req, trade as any);
    if (viewer.role !== "seller") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Transition Trade
    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TradeStatus.DECLINED_BY_SELLER,
        lastActor: Party.SELLER,
        version: { increment: 1 },
        events: {
          create: {
            actor: "seller",
            kind: "DECLINE",
            payload: { previousStatus: trade.status, round: trade.round },
          },
        },
      },
      select: { id: true, status: true, transactionId: true },
    });

    // Best-effort Transaction sync (if linked)
    if (updated.transactionId) {
      try {
        const txDeclined =
          (TransactionStatus as any)?.DECLINED ||
          (TransactionStatus as any)?.CANCELLED ||
          null;
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
  } catch (e) {
    console.error("[api/trades/:id/seller/decline] error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
