// app/api/trades/[id]/seller/counter/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/trade";
import { clerkClient } from "@clerk/nextjs/server";
import { sendEmail, renderBuyerCounterEmail, appUrl } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const trade = await prisma.trade.findUnique({ where: { id: params.id } });
  if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const viewer = await getViewer(req, trade);
  if (viewer.role !== "seller") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!["OFFERED", "COUNTERED_BY_BUYER"].includes(trade.status)) {
    return NextResponse.json({ error: "Trade is not awaiting seller decision." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const pricePerAf = Number(body.pricePerAf ?? trade.pricePerAf);
  const volumeAf   = Number(body.volumeAf ?? trade.volumeAf);
  const windowLabel= body.windowLabel ?? trade.windowLabel;

  const updated = await prisma.trade.update({
    where: { id: trade.id },
    data: {
      status: "COUNTERED_BY_SELLER",
      pricePerAf, volumeAf, windowLabel,
      round: trade.round + 1,
      lastActor: "seller",
      version: { increment: 1 },
      events: {
        create: {
          actor: "seller",
          kind: "COUNTER",
          payload: { pricePerAf, volumeAf, windowLabel },
        },
      },
    },
  });

  // email buyer
  const buyer = await clerkClient.users.getUser(updated.buyerUserId).catch(() => null);
  const buyerEmail =
    buyer?.emailAddresses?.find(e => e.id === buyer?.primaryEmailAddressId)?.emailAddress ||
    buyer?.emailAddresses?.[0]?.emailAddress;
  const buyerName = [buyer?.firstName, buyer?.lastName].filter(Boolean).join(" ") || buyer?.username || "Buyer";

  if (buyerEmail) {
    const { html, preheader } = renderBuyerCounterEmail({
      buyerName,
      sellerName: undefined,
      offer: {
        listingTitle: updated.listingId,
        district: updated.district,
        waterType: updated.waterType ?? undefined,
        volumeAf: updated.volumeAf,
        pricePerAf: updated.pricePerAf,
        priceLabel: `$${updated.pricePerAf.toLocaleString()}/AF`,
        windowLabel: updated.windowLabel ?? undefined,
      },
      viewLink: appUrl(`/t/${updated.id}?token=${updated.buyerToken}`),
      counterLink: appUrl(`/t/${updated.id}?token=${updated.buyerToken}#counter`),
      declineLink: appUrl(`/t/${updated.id}?token=${updated.buyerToken}#decline`),
    });

    await sendEmail({
      to: buyerEmail,
      subject: "Counteroffer from seller",
      html,
      preheader,
      idempotencyKey: `trade:${updated.id}:seller-counter:${updated.round}`,
    });
  }

  return NextResponse.json({ ok: true, status: updated.status });
}
