// app/api/trades/[id]/seller/accept/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { getViewer } from "@/lib/trade";
import { sendEmail, renderBuyerAcceptedEmail, appUrl } from "@/lib/email";

// ✅ Add this to confirm the route is wired up
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json({ ok: true, route: "trades/:id/seller/accept", id: params.id });
}

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

    const viewer = await getViewer(req, trade);
    if (viewer.role !== "seller") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TradeStatus.ACCEPTED_PENDING_BUYER_SIGNATURE,
        lastActor: Party.SELLER,
        version: { increment: 1 },
      },
    });

    await prisma.tradeEvent.create({
      data: {
        id: crypto.randomUUID(),
        tradeId: updated.id,
        actor: "seller",
        kind: "ACCEPT",
        payload: { previousStatus: trade.status, round: trade.round },
      },
    });

    // (Email logic unchanged)… if you want to skip emails for debugging, comment out the block.

    const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    return NextResponse.redirect(new URL(`/t/${updated.id}?role=seller&action=review`, base));
  } catch (e: any) {
    console.error("[trades/:id/seller/accept] error", e);
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
