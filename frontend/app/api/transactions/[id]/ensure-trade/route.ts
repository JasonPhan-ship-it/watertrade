// app/api/transactions/[id]/ensure-trade/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tx = await prisma.transaction.findUnique({
      where: { id: params.id },
      include: {
        listing: { select: { id: true, district: true, waterType: true, title: true } },
      },
    });
    if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Make sure the caller is a participant
    const me = await prisma.user.findUnique({ where: { clerkId: userId }, select: { id: true } });
    if (!me || (me.id !== tx.sellerId && me.id !== tx.buyerId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if a Trade already exists
    let trade = await prisma.trade.findFirst({
      where: { transactionId: tx.id },
      select: { id: true },
    });

    if (!trade) {
      // Create the minimal Trade row needed for your counter endpoints.
      // If your Trade model requires additional fields (e.g. status), fill them below.
      // Using `as any` lets us avoid compile-time enum mismatches across schemas.
      trade = await prisma.trade.create({
        data: {
          transactionId: tx.id,
          sellerUserId: tx.sellerId!,
          buyerUserId: tx.buyerId!,
          listingId: tx.listing?.id ?? undefined,
          // Helpful snapshots (optional — only if your schema has these fields)
          district: (tx as any).listingDistrictSnapshot ?? tx.listing?.district ?? undefined,
          waterType: (tx as any).listingWaterTypeSnapshot ?? tx.listing?.waterType ?? undefined,
          pricePerAf: tx.pricePerAF ?? undefined,
          volumeAf: tx.acreFeet ?? undefined,
          round: 1,
        } as any,
        select: { id: true },
      });
    }

    return NextResponse.json({ ok: true, tradeId: trade.id });
  } catch (e: any) {
    console.error("[ensure-trade]", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
