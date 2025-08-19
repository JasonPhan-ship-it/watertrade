import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { getViewer } from "@/lib/trade";
import { sendEmail, renderBuyerDeclinedEmail, appUrl } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const trade = await prisma.trade.findUnique({ where: { id: params.id } });
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const viewer = await getViewer(req, trade);
    if (viewer.role !== "buyer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TradeStatus.DECLINED,
        lastActor: Party.BUYER,
        version: { increment: 1 },
        events: {
          create: { actor: "buyer", kind: "DECLINE", payload: { round: trade.round } },
        },
      },
    });

    const seller = await clerkClient.users.getUser(trade.sellerUserId).catch(() => null);
    const buyer = await clerkClient.users.getUser(trade.buyerUserId).catch(() => null);
    const sellerEmail =
      seller?.emailAddresses?.find(e => e.id === seller.primaryEmailAddressId)?.emailAddress ??
      seller?.emailAddresses?.[0]?.emailAddress;

    if (sellerEmail) {
      const viewLink = appUrl(`/t/${trade.id}?role=seller&token=${trade.sellerToken}`);
      const { html, preheader } = renderBuyerDeclinedEmail({
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
      });
      await sendEmail({ to: sellerEmail, subject: "Buyer declined the offer", html, preheader });
    }

    return NextResponse.json({ ok: true, trade: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
