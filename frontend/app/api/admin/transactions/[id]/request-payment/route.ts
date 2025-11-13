import { NextRequest, NextResponse } from "next/server";
import { TransactionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { renderBuyerPaymentRequestEmail, sendEmail, appUrl } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function paymentLinkForBuyer() {
  return (
    process.env.STRIPE_CONNECT_PAYMENT_URL ||
    process.env.NEXT_PUBLIC_STRIPE_CONNECT_PAYMENT_URL ||
    appUrl("/billing")
  );
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const id = (params.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing transaction id" }, { status: 400 });
    }

    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: {
        buyer: { select: { email: true, name: true } },
        seller: { select: { name: true } },
        listing: { select: { title: true, district: true, waterType: true } },
        trade: { select: { id: true, district: true, waterType: true, volumeAf: true, pricePerAf: true, windowLabel: true } },
      },
    });

    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    if (tx.status !== TransactionStatus.APPROVED) {
      if (tx.status === TransactionStatus.AWAITING_BUYER_PAYMENT) {
        return NextResponse.json({ ok: true, status: tx.status }, { status: 200 });
      }
      return NextResponse.json(
        { error: "District approval is required before requesting payment." },
        { status: 409 }
      );
    }

    const updated = await prisma.transaction.update({
      where: { id: tx.id },
      data: { status: TransactionStatus.AWAITING_BUYER_PAYMENT },
    });

    if (tx.buyer?.email) {
      const offer = {
        listingTitle: tx.listing?.title || tx.trade?.windowLabel || `Trade ${tx.trade?.id || tx.id}`,
        district: tx.trade?.district || tx.listing?.district || "—",
        waterType: tx.trade?.waterType || tx.listing?.waterType || null,
        volumeAf: tx.trade?.volumeAf || tx.acreFeet,
        pricePerAf: tx.trade?.pricePerAf || tx.pricePerAF,
        windowLabel: tx.trade?.windowLabel || undefined,
      };

      const paymentHref = paymentLinkForBuyer();
      const tradeLink = appUrl(`/t/${tx.trade?.id || tx.id}`);
      const { html, preheader } = renderBuyerPaymentRequestEmail({
        buyerName: tx.buyer.name,
        sellerName: tx.seller?.name,
        offer,
        paymentLink: paymentHref,
        viewLink: tradeLink,
      });

      try {
        await sendEmail({
          to: tx.buyer.email,
          subject: "Action needed: transfer funds via Stripe Connect",
          html,
          preheader,
        });
      } catch (err) {
        console.warn("[admin transactions request-payment] buyer email failed", (err as any)?.message);
      }
    }

    return NextResponse.json({ ok: true, status: updated.status }, { status: 200 });
  } catch (err: any) {
    if (err?.status === 403) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[admin transactions request-payment] unexpected", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
