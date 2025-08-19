// app/api/trades/[id]/buyer/counter/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { getViewer } from "@/lib/trade";
import { sendEmail, renderSellerOfferEmail, appUrl } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const trade = await prisma.trade.findUnique({ where: { id: params.id } });
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const viewer = await getViewer(trade);
    if (viewer.role !== "buyer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { pricePerAf, volumeAf, windowLabel } = await req.json().catch(() => ({}));
    if (!pricePerAf || !volumeAf) {
      return NextResponse.json({ error: "pricePerAf and volumeAf are required" }, { status: 400 });
    }

    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TradeStatus.COUNTERED_BY_BUYER,
        pricePerAf,
        volumeAf,
        windowLabel,
        round: trade.round + 1,
        lastActor: Party.BUYER,
        version: { increment: 1 },
        events: {
          create: {
            actor: "buyer",
            kind: "COUNTER",
            payload: { pricePerAf, volumeAf, windowLabel, round: trade.round + 1 },
          },
        },
      },
    });

    // Email seller with the new counteroffer
    const seller = await clerkClient.users.getUser(trade.sellerUserId).catch(() => null);
    const buyer = await clerkClient.users.getUser(trade.buyerUserId).catch(() => null);
    const sellerEmail =
      seller?.emailAddresses?.find(e => e.id === seller.primaryEmailAddressId)?.emailAddress ??
      seller?.emailAddresses?.[0]?.emailAddress;

    if (sellerEmail) {
      const viewLink = appUrl(`/t/${trade.id}?role=seller&token=${trade.sellerToken}`);
      const acceptLink = appUrl(`/t/${trade.id}?role=seller&token=${trade.sellerToken}&action=accept`);
      const counterLink = appUrl(`/t/${trade.id}?role=seller&token=${trade.sellerToken}&action=counter`);
      const { html, preheader } = renderSellerOfferEmail({
        sellerName: seller?.firstName || seller?.username || "",
        buyerName: buyer?.firstName || buyer?.username || "",
        offer: {
          listingTitle: updated.windowLabel || "Offer Terms",
          district: updated.district,
          waterType: updated.waterType ?? undefined,
          volumeAf: updated.volumeAf,
          pricePerAf: updated.pricePerAf,
          priceLabel: `$${(updated.pricePerAf / 100).toLocaleString()}/AF`,
          windowLabel: updated.windowLabel ?? undefined,
        },
        viewLink,
        acceptLink,
        counterLink,
      });
      await sendEmail({
        to: sellerEmail,
        subject: "New counteroffer received",
        html,
        preheader,
      });
    }

    return NextResponse.json({ ok: true, trade: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
