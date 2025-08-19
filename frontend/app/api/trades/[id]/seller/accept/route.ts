// app/api/trades/[id]/seller/accept/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { getViewer } from "@/lib/trade";
import { sendEmail, renderBuyerAcceptedEmail, appUrl } from "@/lib/email";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const trade = await prisma.trade.findUnique({ where: { id: params.id } });
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const viewer = await getViewer(trade);
    if (viewer.role !== "seller") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
            payload: { round: trade.round },
          },
        },
      },
    });

    // Email buyer to sign
    const seller = await clerkClient.users.getUser(trade.sellerUserId).catch(() => null);
    const buyer = await clerkClient.users.getUser(trade.buyerUserId).catch(() => null);
    const buyerEmail =
      buyer?.emailAddresses?.find(e => e.id === buyer.primaryEmailAddressId)?.emailAddress ??
      buyer?.emailAddresses?.[0]?.emailAddress;

    if (buyerEmail) {
      const signLink = appUrl(`/t/${trade.id}?role=buyer&token=${trade.buyerToken}&action=sign`);
      const viewLink = appUrl(`/t/${trade.id}?role=buyer&token=${trade.buyerToken}`);
      const { html, preheader } = renderBuyerAcceptedEmail({
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
        signLink,
        viewLink,
      });
      await sendEmail({
        to: buyerEmail,
        subject: "Offer accepted — please review and sign",
        html,
        preheader,
      });
    }

    return NextResponse.json({ ok: true, trade: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
