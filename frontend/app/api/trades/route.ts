// app/api/trades/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, renderSellerOfferEmail } from "@/lib/email";
import { appUrl } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    // expected: listingId, sellerUserId, district, waterType?, volumeAf, pricePerAf, windowLabel?
    const { listingId, sellerUserId, district, waterType, volumeAf, pricePerAf, windowLabel } = body;

    if (!listingId || !sellerUserId || !district || !volumeAf || !pricePerAf) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // create trade
    const trade = await prisma.trade.create({
      data: {
        listingId,
        sellerUserId,
        buyerUserId: userId,
        district,
        waterType: waterType ?? null,
        volumeAf: Number(volumeAf),
        pricePerAf: Number(pricePerAf),
        windowLabel: windowLabel ?? null,
        status: "OFFERED",
        lastActor: "buyer",
        events: {
          create: {
            actor: "buyer",
            kind: "OFFER",
            payload: body,
          },
        },
      },
    });

    // resolve names & emails
    const buyer = await clerkClient.users.getUser(userId).catch(() => null);
    const seller = await clerkClient.users.getUser(sellerUserId).catch(() => null);
    const buyerName = [buyer?.firstName, buyer?.lastName].filter(Boolean).join(" ") || buyer?.username || "Buyer";
    const sellerEmail =
      seller?.emailAddresses?.find(e => e.id === seller?.primaryEmailAddressId)?.emailAddress ||
      seller?.emailAddresses?.[0]?.emailAddress;

    // links for the seller
    const viewLink   = appUrl(`/t/${trade.id}?token=${trade.sellerToken}`);
    const acceptLink = appUrl(`/api/trades/${trade.id}/seller/accept?token=${trade.sellerToken}`);
    const counterLink= appUrl(`/t/${trade.id}?token=${trade.sellerToken}#counter`);

    if (sellerEmail) {
      const { html, preheader } = renderSellerOfferEmail({
        sellerName: [seller?.firstName, seller?.lastName].filter(Boolean).join(" ") || undefined,
        buyerName,
        offer: {
          listingTitle: listingId, // or fetch real title
          district,
          waterType: waterType ?? undefined,
          volumeAf: Number(volumeAf),
          pricePerAf: Number(pricePerAf),
          priceLabel: `$${Number(pricePerAf).toLocaleString()}/AF`,
          windowLabel: windowLabel ?? undefined,
        },
        viewLink,
        acceptLink,
        counterLink,
      });

      await sendEmail({
        to: sellerEmail,
        subject: "New offer received",
        html,
        preheader,
        idempotencyKey: `offer:new:${trade.id}`,
      });
    }

    return NextResponse.json({ ok: true, tradeId: trade.id, view: viewLink }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
