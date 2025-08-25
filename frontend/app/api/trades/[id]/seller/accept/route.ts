// app/api/trades/[id]/seller/accept/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus, TransactionStatus } from "@prisma/client";
import { getViewer } from "@/lib/trade";

async function findTradeByAnyId(id: string) {
  const byTradeId = await prisma.trade.findUnique({ where: { id } });
  if (byTradeId) return byTradeId;
  const byTxn = await prisma.trade.findFirst({ where: { transactionId: id } });
  return byTxn ?? null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rawId = params.id;
    const trade = await findTradeByAnyId(rawId);
    if (!trade) {
      return NextResponse.json(
        { error: "Not found", hint: "No Trade with this id or transactionId" },
        { status: 404 }
      );
    }

    // AuthZ: only seller can accept
    const viewer = await getViewer(req, trade);
    if (viewer.role !== "seller") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update Trade to your valid enum value
    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TradeStatus.ACCEPTED_PENDING_BUYER_SIGNATURE,
        lastActor: Party.SELLER,
        version: { increment: 1 },
        events: {
          create: {
            actor: "seller",
            kind: "ACCEPT",
            payload: { previousStatus: trade.status, round: trade.round },
          },
        },
      },
      select: { id: true, transactionId: true },
    });

    // (Optional) reflect on Transaction
    if (updated.transactionId) {
      await prisma.transaction.update({
        where: { id: updated.transactionId },
        data: { status: TransactionStatus.ACCEPTED },
      });
    }

    const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const redirectUrl = `${base}/t/${updated.id}?role=seller&action=review`;

    const wantsJson =
      (req.headers.get("accept") || "").includes("application/json") ||
      (req.headers.get("x-requested-with") || "").toLowerCase() === "fetch";

    if (wantsJson) {
      return NextResponse.json({ ok: true, redirect: redirectUrl });
    }
    return NextResponse.redirect(redirectUrl, 303);
  } catch (e: any) {
    console.error("[trades/:id/seller/accept] error", e);
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
