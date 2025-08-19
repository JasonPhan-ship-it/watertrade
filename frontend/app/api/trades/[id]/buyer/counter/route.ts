// app/api/trades/[id]/buyer/counter/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/trade";
import { clerkClient } from "@clerk/nextjs/server";
import { sendEmail, renderSellerOfferEmail, appUrl } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const trade = await prisma.trade.findUnique({ where: { id: params.id } });
  if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const viewer = await getViewer(req, trade);
  if (viewer.role !== "buyer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!["COUNTERED_BY_SELLER"].includes(trade.status)) {
    return NextResponse.json({ error: "Trade is not awaiting buyer decision." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const pricePerAf = Number(body.pricePerAf ?? trade.pricePerAf);
  const volumeAf   = Number(body.volumeAf ?? trade.volumeAf);
  const windowLabel= body.windowLabel ?? trade.windowLabel;

  const updated = await prisma.trade.update({
    where: { id: trade.id },
    data: {
      status: "COUNTERED_BY_BUYER",
      pricePerAf, volumeAf, windowLabel,
      round: trade.round + 1,
      lastActor: "buyer",
      version: { increment: 1 },
      events: {
        create: {
          actor: "buyer",
          kind: "COUNTER",
          payload: { pricePerAf, volumeAf, windowLabel },
        },
      },
    },
  });

  // email seller (same template as initial, CTA = accept or counter)
  const seller = await clerkClient.users.getUser(updated.sellerUserId).catch(() => null);
  const sellerEmail =
    seller?.emailAddresses?.find(e => e.id === seller?.primaryEmailAddressId)?.emailAddress ||
    seller?.emailAddresses?.[0]?.emailAddress;
  const buyer = await clerkClient.users.getUser(updated.buyerUserId).catch(() => null);
  const buyerName = [buyer?.firstName, buyer?.lastName].filter(Boolean).join(" ") || buyer?.username || "Buyer";

  if (sellerEmail) {
    const { html, preheader } = renderSellerOfferEmail({
      sellerName: [seller?.firstName, seller?.lastName].filter(Boolean).join(" ") || undefined,
      buyerName,
      offer: {
        listingTitle: updated.listingId,
        district: updated.district,
        waterType: updated.waterType ?? undefined,
        volumeAf: updated.volumeAf,
        pricePerAf: updated.pricePerAf,
        priceLabel: `$${updated.pricePerAf.toLocaleString()}/AF`,
        windowLabel: updated.windowLabel ?? undefined,
      },
      viewLink: appUrl(`/t/${updated.id}?token=${updated.sellerToken}`),
      acceptLink: appUrl(`/api/trades/${updated.id}/seller/accept?token=${updated.sellerToken}`),
      counterLink: appUrl(`/t/${updated.id}?token=${updated.sellerToken}#counter`),
    });

    await sendEmail({
      to: sellerEmail,
      subject: "Buyer sent a counteroffer",
      html,
      preheader,
      idempotencyKey: `trade:${updated.id}:buyer-counter:${updated.round}`,
    });
  }

  return NextResponse.json({ ok: true, status: updated.status });
}
