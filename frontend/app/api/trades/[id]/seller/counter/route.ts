import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { getViewer } from "@/lib/trade";
import { sendEmail, renderBuyerCounterEmail, appUrl } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const trade = await prisma.trade.findUnique({ where: { id: params.id } });
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // getViewer now expects (trade, req)
    const viewer = await getViewer(trade, req);
    if (viewer.role !== "seller") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { pricePerAf, volumeAf, windowLabel } = await req.json().catch(() => ({}));
    if (!pricePerAf || !volumeAf) {
      return NextResponse.json({ error: "pricePerAf and volumeAf are required" }, { status: 400 });
    }

    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TradeStatus.COUNTERED_BY_SELLER,
        pricePerAf,
        volumeAf,
        windowLabel,
        round: trade.round + 1,
        lastActor: Party.SELLER,
        version: { increment: 1 },
        events: {
          create: {
            actor: "seller",
            kind: "COUNTER",
            payload: { pricePerAf, volumeAf, windowLabel, round: trade.round + 1 },
          },
        },
      },
    });

    // Email buyer with seller counter
    const seller = await clerkClient.users.getUser(trade.sellerUserId).catch(() => null);
    const buyer = await clerkClient.users.getUser(trade.buyerUserId).catch(() => null);
    const buyerEmail =
      buyer?.emailAddresses?.find(e => e.id === buyer.primaryEmailAddressId)?.emailAddress ??
      buyer?.emailAddresses?.[0]?.emailAddress;

    if (buyerEmail) {
      const viewLink = appUrl(`/t/${trade.id}?role=buyer&token=${trade.buyerToken}`);
      const counterLink = appUrl(`/t/${trade.id}?role=buyer&token=${trade.buyerToken}&action=counter`);
      const declineLink = appUrl(`/t/${trade.id}?role=buyer&token=${trade.buyerToken}&action=decline`);
      const { html, preheader } = renderBuyerCounterEmail({
        buyerName: buyer?.firstName || buyer?.username || "",
        sellerName: seller?.firstName || seller?.username || "",
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
        counterLink,
        declineLink,
      });
      await sendEmail({
        to: buyerEmail,
        subject: "Seller sent a counteroffer",
        html,
        preheader,
      });
    }

    return NextResponse.json({ ok: true, trade: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
