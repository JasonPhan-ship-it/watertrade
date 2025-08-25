// app/api/trades/[id]/seller/accept/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus, TransactionStatus } from "@prisma/client";
import { getViewer } from "@/lib/trade";
// If you have these helpers wired, you can re-enable the email section below.
// import { clerkClient } from "@clerk/nextjs/server";
// import { sendEmail, renderBuyerAcceptedEmail, appUrl } from "@/lib/email";

// Simple helper: accept either a Trade.id or a Transaction.id
async function findTradeByAnyId(id: string) {
  // Try Trade.id
  const byTradeId = await prisma.trade.findUnique({ where: { id } });
  if (byTradeId) return byTradeId;

  // Try by Transaction.id -> first Trade that points at it
  const byTxn = await prisma.trade.findFirst({ where: { transactionId: id } });
  return byTxn ?? null;
}

// Quick ping to verify route wiring (handy in local/dev)
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json({ ok: true, route: "trades/:id/seller/accept", id: params.id });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rawId = params.id?.trim();
    if (!rawId) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const trade = await findTradeByAnyId(rawId);
    if (!trade) {
      return NextResponse.json(
        { error: "Not found", hint: "No Trade with this id or transactionId" },
        { status: 404 }
      );
    }

    // AuthZ: must be the seller on this trade
    const viewer = await getViewer(req, trade);
    if (viewer.role !== "seller") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update the Trade status to reflect seller acceptance
    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: TradeStatus.ACCEPTED_PENDING_BUYER_SIGNATURE,
        lastActor: Party.SELLER,
        version: { increment: 1 },
      },
    });

    // Record an event for audit/history (if you use a separate TradeEvent model)
    try {
      await prisma.tradeEvent.create({
        data: {
          id: crypto.randomUUID(),
          tradeId: updated.id,
          actor: "seller",
          kind: "ACCEPT",
          payload: { previousStatus: trade.status, round: trade.round },
        },
      });
    } catch {
      // Non-fatal if your schema doesn't include TradeEvent
    }

    // Keep Transaction in sync if present: set to a *valid* enum value
    if (updated.transactionId) {
      try {
        await prisma.transaction.update({
          where: { id: updated.transactionId },
          data: { status: TransactionStatus.PENDING_BUYER_SIGNATURE },
        });
      } catch {
        // If your Transaction model doesn't have this status, remove or change it to a valid one
      }
    }

    // --- (Optional) Email the buyer about seller acceptance ---
    // If your project has these helpers, you can re-enable this.
    //
    // try {
    //   const buyerUser = await prisma.user.findUnique({ where: { id: trade.buyerUserId } });
    //   let buyerEmail = buyerUser?.email || "";
    //   let buyerName = buyerUser?.name || "";
    //
    //   if (buyerUser?.clerkId) {
    //     const buyerClerk = await clerkClient.users.getUser(buyerUser.clerkId);
    //     buyerName =
    //       buyerName || buyerClerk.firstName || buyerClerk.username || buyerName || "";
    //     const primary =
    //       buyerClerk.emailAddresses?.find(e => e.id === buyerClerk.primaryEmailAddressId)
    //         ?.emailAddress;
    //     buyerEmail = buyerEmail || primary || buyerClerk.emailAddresses?.[0]?.emailAddress || "";
    //   }
    //
    //   if (buyerEmail) {
    //     const viewLink = appUrl(`/t/${updated.id}?role=buyer&token=${trade.buyerToken}`);
    //     const { html, preheader } = renderBuyerAcceptedEmail({
    //       buyerName,
    //       viewLink,
    //     });
    //     await sendEmail({
    //       to: buyerEmail,
    //       subject: "Seller accepted your offer",
    //       html,
    //       preheader,
    //     });
    //   }
    // } catch {
    //   // Email failures are non-fatal to the accept flow
    // }

    // Redirect back to the trade view
    const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    return NextResponse.redirect(new URL(`/t/${updated.id}?role=seller&action=review`, base));
  } catch (e: any) {
    console.error("[trades/:id/seller/accept] error", e);
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
