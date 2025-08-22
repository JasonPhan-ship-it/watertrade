// app/api/trades/[id]/seller/accept/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { getViewer } from "@/lib/trade";
import { sendEmail, renderBuyerAcceptedEmail, appUrl } from "@/lib/email";

async function findTradeByAnyId(id: string) {
  // 1) exact Trade.id
  const byTradeId = await prisma.trade.findUnique({ where: { id } });
  if (byTradeId) return byTradeId;

  // 2) treat id as Transaction.id and look up Trade by transactionId
  const byTxn = await prisma.trade.findFirst({ where: { transactionId: id } });
  return byTxn ?? null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rawId = params.id;

    const trade = await findTradeByAnyId(rawId);
    if (!trade) {
      // Helpful hint for debugging
      return NextResponse.json(
        { error: "Not found", hint: "No Trade with this id or transactionId" },
        { status: 404 }
      );
    }

    // AuthZ: only seller can accept
    const viewer = await getViewer(req, trade);
    if (viewer.role !== "seller") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update trade -> accepted (pending buyer signature)
    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TradeStatus.ACCEPTED_PENDING_BUYER_SIGNATURE,
        lastActor: Party.SELLER,
        version: { increment: 1 },
      },
    });

    // Append TradeEvent (explicit create)
    await prisma.tradeEvent.create({
      data: {
        id: crypto.randomUUID(),
        tradeId: updated.id,
        actor: "seller",
        kind: "ACCEPT",
        payload: { previousStatus: trade.status, round: trade.round },
      },
    });

    // Notify buyer (best-effort)
    const [sellerUser, buyerUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: trade.sellerUserId } }),
      prisma.user.findUnique({ where: { id: trade.buyerUserId } }),
    ]);

    let sellerName = sellerUser?.name || "";
    let buyerName = buyerUser?.name || "";
    let buyerEmail = buyerUser?.email || "";

    if (buyerUser?.clerkId || sellerUser?.clerkId) {
      try {
        const [sellerClerk, buyerClerk] = await Promise.all([
          sellerUser?.clerkId ? clerkClient.users.getUser(sellerUser.clerkId) : null,
          buyerUser?.clerkId ? clerkClient.users.getUser(buyerUser.clerkId) : null,
        ]);
        if (sellerClerk) sellerName ||= sellerClerk.firstName || sellerClerk.username || "";
        if (buyerClerk) {
          buyerName ||= buyerClerk.firstName || buyerClerk.username || "";
          const primary = buyerClerk.emailAddresses?.find(e => e.id === buyerClerk.primaryEmailAddressId)
            ?.emailAddress;
          const firstAny = buyerClerk.emailAddresses?.[0]?.emailAddress;
          buyerEmail ||= primary || firstAny || "";
        }
      } catch {
        // non-fatal
      }
    }

    if (buyerEmail) {
      const signLink = appUrl(`/t/${updated.id}?role=buyer&token=${updated.buyerToken}&action=sign`);
      const viewLink = appUrl(`/t/${updated.id}?role=buyer&token=${updated.buyerToken}`);
      const { html, preheader } = renderBuyerAcceptedEmail({
        buyerName,
        sellerName,
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
      await sendEmail({ to: buyerEmail, subject: "Offer accepted — please review and sign", html, preheader });
    }

    // Redirect back to the Trade page
    const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    return NextResponse.redirect(new URL(`/t/${updated.id}?role=seller&action=review`, base));
  } catch (e: any) {
    console.error("[trades/:id/seller/accept] error", e);
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
