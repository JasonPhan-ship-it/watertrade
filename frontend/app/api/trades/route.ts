// app/api/trades/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { sendEmail, renderSellerOfferEmail, appUrl } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { listingId, buyerUserId, sellerUserId, district, waterType, volumeAf, pricePerAf, windowLabel } =
      await req.json().catch(() => ({}));

    if (!listingId || !buyerUserId || !sellerUserId || !district || !volumeAf || !pricePerAf) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const trade = await prisma.trade.create({
      data: {
        listingId,
        buyerUserId,
        sellerUserId,
        district,
        waterType: waterType ?? null,
        volumeAf,
        pricePerAf,
        windowLabel: windowLabel ?? null,
        status: TradeStatus.OFFERED,
        round: 1,
        lastActor: Party.BUYER,
        events: {
          create: {
            actor: "buyer",
            kind: "OFFER",
            payload: { pricePerAf, volumeAf, windowLabel, round: 1 },
          },
        },
      },
    });

    // Email seller about the new offer
    const seller = await clerkClient.users.getUser(sellerUserId).catch(() => null);
    const buyer = await clerkClient.users.getUser(buyerUserId).catch(() => null);
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
          listingTitle: windowLabel || "Offer Terms",
          district,
          waterType: waterType ?? undefined,
          volumeAf,
          pricePerAf,
          priceLabel: `$${(pricePerAf / 100).toLocaleString()}/AF`,
          windowLabel: windowLabel ?? undefined,
        },
        viewLink,
        acceptLink,
        counterLink,
      });
      await sendEmail({
        to: sellerEmail,
        subject: "You’ve received a new offer",
        html,
        preheader,
      });
    }

    return NextResponse.json({ ok: true, trade });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
