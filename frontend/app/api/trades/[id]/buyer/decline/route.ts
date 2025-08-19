// app/api/trades/[id]/buyer/decline/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/trade";
import { clerkClient } from "@clerk/nextjs/server";
import { sendEmail, renderBuyerDeclinedEmail, appUrl } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const trade = await prisma.trade.findUnique({ where: { id: params.id } });
  if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const viewer = await getViewer(req, trade);
  if (viewer.role !== "buyer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!["COUNTERED_BY_SELLER"].includes(trade.status)) {
    return NextResponse.json({ error: "Trade is not awaiting buyer decision." }, { status: 400 });
  }

  const updated = await prisma.trade.update({
    where: { id: trade.id },
    data: {
      status: "DECLINED",
      lastActor: "buyer",
      version: { increment: 1 },
      events: { create: { actor: "buyer", kind: "DECLINE", payload: {} } },
    },
  });

  // Inform seller the offer was declined
  const seller = await clerkClient.users.getUser(updated.sellerUserId).catch(() => null);
  const sellerEmail =
    seller?.emailAddresses?.find(e => e.id === seller?.primaryEmailAddressId)?.emailAddress ||
    seller?.emailAddresses?.[0]?.emailAddress;

  if (sellerEmail) {
    const { html, preheader } = renderBuyerDeclinedEmail({
      buyerName: undefined,
      sellerName: [seller?.firstName, seller?.lastName].filter(Boolean).join(" ") || undefined,
      offer: {
        listingTitle: updated.listingId,
        district: updated.district,
        waterType: updated.waterType ?? undefined,
        volumeAf: updated.volumeAf,
        pricePerAf: updated.pricePerAf,
        priceLabel: `$${updated.pricePerAf.toLocaleString()}/AF`,
        windowLabel: updated.windowLabel ?? undefined,
      },
      viewLink: appUrl(`/listings/${updated.listingId}`),
    });

    await sendEmail({
      to: sellerEmail,
      subject: "Buyer declined the offer",
      html,
      preheader,
      idempotencyKey: `trade:${updated.id}:buyer-decline`,
    });
  }

  return NextResponse.json({ ok: true, status: updated.status });
}
