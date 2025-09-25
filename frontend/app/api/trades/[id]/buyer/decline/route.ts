export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Party, TradeStatus } from "@prisma/client";
import { clerkClient } from "@clerk/nextjs/server";
import { getViewer, findTradeByAnyId } from "@/lib/trade";
import { sendEmail, renderBuyerDeclinedEmail, appUrl } from "@/lib/email";

/** Choose a compatible "declined" status from your enum */
function pickDeclinedTradeStatus(): (typeof TradeStatus)[keyof typeof TradeStatus] {
  const TS: any = TradeStatus;
  return TS.DECLINED ?? TS.REJECTED ?? TS.CANCELLED ?? TS.EXPIRED;
}

export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed", errorCode: "METHOD_NOT_ALLOWED" }, { status: 405 });
}
export async function HEAD() {
  return NextResponse.json({ error: "Method Not Allowed", errorCode: "METHOD_NOT_ALLOWED" }, { status: 405 });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rawId = (params.id || "").trim();
    if (!rawId) return NextResponse.json({ error: "Missing id", errorCode: "MISSING_ID" }, { status: 400 });

    // Support Trade.id OR Transaction.id
    const trade = await findTradeByAnyId(rawId);
    if (!trade) return NextResponse.json({ error: "Not found", errorCode: "NOT_FOUND" }, { status: 404 });

    // Must be buyer
    const viewer = await getViewer(req, trade as any);
    if (viewer.role !== "buyer") {
      return NextResponse.json({ error: "Forbidden", errorCode: "FORBIDDEN" }, { status: 403 });
    }

    const DECLINED = pickDeclinedTradeStatus();

    // Update Trade
    const updated = await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: DECLINED,
        lastActor: Party.BUYER,
        version: { increment: 1 },
        events: {
          create: {
            actor: "buyer",
            kind: "DECLINE",
            payload: { previousStatus: trade.status, round: trade.round },
          },
        },
      },
      select: {
        id: true,
        status: true,
        windowLabel: true,
        district: true,
        waterType: true,
        volumeAf: true,
        pricePerAf: true,
        // for email links + lookups
        sellerUserId: true,
        buyerUserId: true,
        sellerToken: true,
        buyerToken: true,
      },
    });

    // ---- Notify seller ----
    const [sellerLocal, buyerLocal] = await Promise.all([
      prisma.user.findUnique({ where: { id: trade.sellerUserId || "" }, select: { email: true, name: true, clerkId: true } }),
      prisma.user.findUnique({ where: { id: trade.buyerUserId || "" }, select: { email: true, name: true, clerkId: true } }),
    ]);

    let sellerEmail = sellerLocal?.email || "";
    let sellerName = sellerLocal?.name || "";
    let buyerName = buyerLocal?.name || "";
    let buyerEmail = buyerLocal?.email || "";

    if (!sellerEmail && sellerLocal?.clerkId) {
      try {
        const sellerClerk = await clerkClient.users.getUser(sellerLocal.clerkId);
        sellerName = sellerName || sellerClerk.firstName || sellerClerk.username || "";
        sellerEmail =
          sellerClerk.emailAddresses?.find((e) => e.id === sellerClerk.primaryEmailAddressId)?.emailAddress ??
          sellerClerk.emailAddresses?.[0]?.emailAddress ??
          "";
      } catch { /* non-fatal */ }
    }
    if (!buyerName && buyerLocal?.clerkId) {
      try {
        const buyerClerk = await clerkClient.users.getUser(buyerLocal.clerkId);
        buyerName = buyerName || buyerClerk.firstName || buyerClerk.username || "";
        const primary =
          buyerClerk.emailAddresses?.find(e => e.id === buyerClerk.primaryEmailAddressId)?.emailAddress;
        buyerEmail = buyerEmail || primary || buyerClerk.emailAddresses?.[0]?.emailAddress || "";
      } catch { /* non-fatal */ }
    }

    if (sellerEmail) {
      const viewLink = appUrl(`/t/${updated.id}?role=seller${trade.sellerToken ? `&token=${trade.sellerToken}` : ""}`);
      const { html, preheader } = renderBuyerDeclinedEmail({
        buyerName: buyerName || "Buyer",
        sellerName: sellerName || "Seller",
        offer: {
          listingTitle: updated.windowLabel || "Offer Terms",
          district: updated.district,
          waterType: updated.waterType ?? undefined,
          volumeAf: updated.volumeAf,
          pricePerAf: updated.pricePerAf,
          priceLabel: `$${(updated.pricePerAf / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/AF`,
          windowLabel: updated.windowLabel ?? undefined,
        },
        viewLink,
      });
      await sendEmail({ to: sellerEmail, subject: "Buyer declined the offer", html, preheader });
    }

    // NEW: buyer confirmation
    if (buyerEmail) {
      const buyerViewLink = appUrl(`/t/${updated.id}?role=buyer${updated.buyerToken ? `&token=${updated.buyerToken}` : ""}`);
      const html = `
        <p>Hi ${buyerName || "Buyer"},</p>
        <p>You declined the offer. You can view the thread here:</p>
        <p><a href="${buyerViewLink}">${buyerViewLink}</a></p>
      `;
      await sendEmail({ to: buyerEmail, subject: "You declined the offer", html });
    }

    return NextResponse.json({ ok: true, tradeId: updated.id, status: updated.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error", errorCode: "UNEXPECTED" }, { status: 500 });
  }
}
