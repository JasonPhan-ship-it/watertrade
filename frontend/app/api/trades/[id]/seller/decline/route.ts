export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const tradeId = params.id;

  try {
    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      select: { id: true, status: true },
    });
    if (!trade) {
      return NextResponse.json({ ok: false, error: "Trade not found" }, { status: 404 });
    }

    const updated = await prisma.trade.update({
      where: { id: tradeId },
      data: {
        status: TradeStatus.DECLINED,
        lastActor: Party.SELLER,
        events: {
          create: {
            actor: "seller",
            kind: "DECLINE",
            payload: { previousStatus: trade.status },
          },
        },
      },
      select: { id: true, status: true },
    });

    return NextResponse.redirect(new URL(`/t/${updated.id}`, process.env.NEXT_PUBLIC_APP_URL));
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
