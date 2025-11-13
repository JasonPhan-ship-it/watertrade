import { NextRequest, NextResponse } from "next/server";
import { SignatureProgress, TransactionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { fetchEnvelopeCombinedPdfBase64 } from "@/lib/docusign";
import { renderDistrictApprovalEmail, sendEmail, appUrl } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseEmails(value?: string | null) {
  if (!value) return [] as string[];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const id = (params.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing transaction id" }, { status: 400 });
    }

    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: {
        listing: { select: { title: true, district: true, waterType: true } },
        trade: {
          select: {
            id: true,
            district: true,
            waterType: true,
            volumeAf: true,
            pricePerAf: true,
            windowLabel: true,
            sellerToken: true,
            buyerSignStatus: true,
            sellerSignStatus: true,
          },
        },
      },
    });

    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const buyerSigned = tx.trade?.buyerSignStatus === SignatureProgress.SIGNED;
    const sellerSigned = tx.trade?.sellerSignStatus === SignatureProgress.SIGNED;

    if (!buyerSigned || !sellerSigned) {
      return NextResponse.json(
        { error: "Buyer and seller signatures are required before admin approval." },
        { status: 409 }
      );
    }

    const nextStatus = TransactionStatus.APPROVED;

    const updated = await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        status: nextStatus,
        complianceApprovedBy: admin.id,
        complianceApprovedAt: new Date(),
      },
    });

    const districtEmails = parseEmails(process.env.DISTRICT_NOTIFICATIONS_EMAIL);
    if (districtEmails.length) {
      const offer = {
        listingTitle: tx.listing?.title || tx.trade?.windowLabel || `Trade ${tx.trade?.id || tx.id}`,
        district: tx.trade?.district || tx.listing?.district || "—",
        waterType: tx.trade?.waterType || tx.listing?.waterType || null,
        volumeAf: tx.trade?.volumeAf || tx.acreFeet,
        pricePerAf: tx.trade?.pricePerAf || tx.pricePerAF,
        windowLabel: tx.trade?.windowLabel || undefined,
      };

      const { html, preheader } = renderDistrictApprovalEmail({
        districtName: offer.district,
        offer,
        viewLink: appUrl(`/t/${tx.trade?.id || tx.id}`),
      });

      let attachments: { filename: string; content: string; contentType?: string }[] | undefined;
      if (tx.docusignEnvelopeId) {
        try {
          const pdf = await fetchEnvelopeCombinedPdfBase64(tx.docusignEnvelopeId);
          if (pdf) {
            attachments = [
              {
                filename: `WaterTraders_Agreement_${tx.trade?.id || tx.id}.pdf`,
                content: pdf,
                contentType: "application/pdf",
              },
            ];
          }
        } catch (err) {
          console.warn("[admin transactions approve] Failed to fetch DocuSign PDF", (err as any)?.message);
        }
      }

      try {
        await sendEmail({
          to: districtEmails,
          subject: `District review requested for trade ${tx.trade?.id || tx.id}`,
          html,
          preheader,
          attachments,
        });
      } catch (err) {
        console.warn("[admin transactions approve] district email failed", (err as any)?.message);
      }
    }

    return NextResponse.json({ ok: true, status: updated.status }, { status: 200 });
  } catch (err: any) {
    if (err?.status === 403) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[admin transactions approve] unexpected", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
