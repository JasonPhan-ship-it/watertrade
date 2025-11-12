// app/api/transactions/[id]/kickoff/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, appUrl, renderDocsKickoffEmail } from "@/lib/email";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function POST(_req: Request, { params }: Params) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = params.id;

    // Pull enough fields to render branded key-value rows
    const trx = await prisma.transaction.findUnique({
      where: { id },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            district: true,
            waterType: true,
          },
        },
        seller: { select: { email: true, name: true } },
        buyer: { select: { email: true, name: true } },
      },
    });
    if (!trx) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Move to seller-sign stage (as you had)
    const updated = await prisma.transaction.update({
      where: { id },
      data: { status: "PENDING_SELLER_SIGNATURE" },
      select: {
        id: true,
        acreFeet: true,
        pricePerAF: true,
      },
    });

    // Build links used by CTAs
    const viewLink = appUrl(`/transactions/${updated.id}`);
    const signLink = appUrl(`/api/signing/seller?tx=${updated.id}`);

    // Shared "offer" payload for the email renderer
    const offer = {
      listingTitle: trx.listing?.title ?? trx.listing?.id ?? "Listing",
      district: trx.listing?.district ?? "—",
      waterType: trx.listing?.waterType ?? null,
      volumeAf: updated.acreFeet ?? 0,
      pricePerAf: updated.pricePerAF ?? 0,
    };

    // SELLER email (they need to sign first per status)
    if (trx.seller?.email) {
      const { html, preheader } = renderDocsKickoffEmail({
        title: "Documents are ready",
        subtitle: trx.seller.name ? `Hi ${trx.seller.name}, please review and sign.` : "Please review and sign.",
        intro: "We’ve prepared the documents for this transaction.",
        offer,
        ctas: [
          { label: "Review & Sign", href: signLink, primary: true },
          { label: "View Details", href: viewLink },
        ],
        footerNote: "Need help? Reply to this email and our team will assist.",
      });

      await sendEmail({
        to: trx.seller.email,
        subject: "Documents ready — review & sign",
        html,
        preheader,
      });
    }

    // BUYER email (FYI that docs kicked off; they’ll sign after seller)
    if (trx.buyer?.email) {
      const { html, preheader } = renderDocsKickoffEmail({
        title: "Documents sent",
        subtitle: trx.buyer.name
          ? `Hi ${trx.buyer.name}, the seller has documents to review.`
          : "The seller has documents to review.",
        intro: "We’ll notify you when it’s your turn to sign.",
        offer,
        ctas: [{ label: "View Details", href: viewLink, primary: true }],
        footerNote: "You’ll receive a follow-up when signing is available.",
      });

      await sendEmail({
        to: trx.buyer.email,
        subject: "Documents sent — we’ll notify you to sign",
        html,
        preheader,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Failed to kickoff docs" }, { status: 500 });
  }
}
