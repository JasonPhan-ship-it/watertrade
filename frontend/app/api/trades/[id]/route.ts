// app/api/trades/[id]/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/trade";

export async function GET(req: NextRequest, { params }: { params: { id: string }}) {
  const trade = await prisma.trade.findUnique({ where: { id: params.id } });
  if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const viewer = await getViewer(req, trade);
  if (viewer.role === "unknown") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // shape tailored to client
  return NextResponse.json({
    trade: {
      id: trade.id,
      listingId: trade.listingId,
      district: trade.district,
      waterType: trade.waterType,
      volumeAf: trade.volumeAf,
      pricePerAf: trade.pricePerAf,
      windowLabel: trade.windowLabel,
      status: trade.status,
      round: trade.round,
      lastActor: trade.lastActor,
      role: viewer.role,
      // signature statuses (show only when relevant)
      buyerSignStatus: trade.buyerSignStatus,
      sellerSignStatus: trade.sellerSignStatus,
    },
  });
}
