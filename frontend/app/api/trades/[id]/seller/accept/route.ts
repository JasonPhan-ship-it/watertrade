// app/api/trades/[id]/seller/accept/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { getViewer } from "@/lib/trade";
import { sendEmail, renderBuyerAcceptedEmail, appUrl } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const trade = await prisma.trade.findUnique({ where: { id: params.id } });
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // AuthZ: only seller can accept
    const viewer = await getViewer(req, trade);
    if (viewer.role !== "seller") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update trade -> accepted (pending buyer signature) + append event
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
            payload: { previousStatus: trade.status, round: trade.round },
          },
        },
      },
    });

    // Pull names/emails from your own User table first
    const [sellerUser, buyerUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: trade.sellerUserId } }),
      prisma.user.findUnique({ where: { id: trade.buyerUserId } }),
    ]);

    let sellerName = sellerUser?.name || "";
    let buyerName = buyerUser?.name || "";
    let buyerEmail = buyerUser?.email || "";

    // Optionally enrich via Clerk if clerkId present
    if (buyerUser?.clerkId || sellerUser?.clerkId) {
      try {
        const [sellerClerk, buyerClerk] = await Promise.all([
          sellerUser?.clerkId ? clerkClient.users.getUser(sellerUser.clerkId) : null,
          buyerUser?.clerkId ? clerkClient.users.getUser(buyerUser.clerkId) : null,
        ]);
        if (sellerClerk) sellerName = sellerName || sellerClerk.firstName || sellerClerk.username || "";
        if (buyerClerk) {
          buyerName = buyerName || buyerClerk.firstName || buyerClerk.username || "";
          const primary = buyerClerk.emailAddresses?.find(e => e.id === buyerClerk.primaryEmailAddressId)
            ?.emailAddress;
          const firstAny = buyerClerk.emailAddresses?.[0]?.emailAddress;
          buyerEmail = buyerEmail || primary || firstAny || "";
        }
      } catch {
        // non-fatal; stick with local values
      }
    }

    // Notify buyer (if we have an email)
    if (buyerEmail) {
      const signLink = appUrl(`/t/${trade.id}?role=buyer&token=${trade.buyerToken}&action=sign`);
      const viewLink = appUrl(`/t/${trade.id}?role=buyer&token=${trade.buyerToken}`);
      const { html, preheader } = renderBuyerAcceptedEmail({
        buyerName,
        sellerName,
        offer: {
          listingTitle: updated.windowLabel || "Offer Terms",
          district: updated.district,
          waterType: updated.waterType ?? undefined,
          volumeAf: updated.volumeAf,
          pricePerAf: updated.pricePerAf, // cents
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

    // Redirect to the trade page (works nicely with form posts)
    const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    return NextResponse.redirect(new URL(`/t/${updated.id}`, base));

    // If you prefer JSON instead:
    // return NextResponse.json({ ok: true, trade: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
