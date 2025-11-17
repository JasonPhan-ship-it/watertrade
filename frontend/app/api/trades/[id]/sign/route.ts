import { NextResponse } from "next/server";

import { createWaterTransferEnvelope } from "@/lib/docusign-water-transfer";
import { prisma } from "@/lib/prisma";

function pickAccountNumber(
  existing: string | null | undefined,
  ...candidates: Array<string | null | undefined>
) {
  if (existing && existing.trim()) return existing.trim();
  for (const candidate of candidates) {
    if (candidate && candidate.trim()) return candidate.trim();
  }
  return "TBD_ACCOUNT";
}

function pickWaterYear(
  tradeYear: number | null | undefined,
  ...candidates: Array<string | number | null | undefined>
): number {
  if (tradeYear) return tradeYear;
  for (const cand of candidates) {
    if (!cand) continue;
    const parsed = Number(cand);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return new Date().getFullYear();
}

function pickWaterCode(
  tradeCode: string | null | undefined,
  ...candidates: Array<string | null | undefined>
) {
  if (tradeCode && tradeCode.trim()) return tradeCode.trim();
  for (const cand of candidates) {
    if (cand && cand.trim()) return cand.trim();
  }
  return "UNKNOWN";
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { id } = params;

  try {
    const trade = await prisma.trade.findUnique({
      where: { id },
      include: {
        listing: {
          include: {
            waterCode: true,
            sellerFarm: true,
          },
        },
        transaction: {
          include: {
            sellerFarm: true,
          },
        },
        buyer: true,
        seller: true,
      },
    });

    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    const buyerName = trade.buyer?.name || "Buyer";
    const buyerEmail = trade.buyer?.email || "buyer@example.com";
    const sellerName = trade.seller?.name || "Seller";
    const sellerEmail = trade.seller?.email || "seller@example.com";

    const buyerAccountNumber = pickAccountNumber(
      (trade as any).buyerAccountNumber,
      trade.transaction?.buyerWaterAccount,
      trade.listing?.buyerWaterAccount,
      (trade as any).buyer?.profile?.waterAccountNumber
    );

    const sellerAccountNumber = pickAccountNumber(
      (trade as any).sellerAccountNumber,
      trade.listing?.sellerFarm?.accountNumber,
      trade.transaction?.sellerFarm?.accountNumber
    );

    const waterYear = pickWaterYear(
      (trade as any).waterYear,
      trade.listing?.waterCodeYear,
      trade.listing?.waterCode?.year
    );

    const waterCode = pickWaterCode(
      (trade as any).waterCode,
      trade.listing?.waterCodeValue,
      trade.listing?.waterCode?.code
    );

    const envelope = await createWaterTransferEnvelope({
      buyerName,
      buyerEmail,
      buyerAccountNumber,
      sellerName,
      sellerEmail,
      sellerAccountNumber,
      afAmount: trade.volumeAf,
      waterYear,
      waterCode,
    });

    const envelopeId = (envelope as any)?.envelopeId || (envelope as any)?.envelopeID || null;
    if (!envelopeId) {
      return NextResponse.json({ error: "DocuSign did not return an envelopeId" }, { status: 500 });
    }

    await prisma.trade.update({
      where: { id: trade.id },
      data: {
        docusignEnvelopeId: envelopeId,
        buyerAccountNumber,
        sellerAccountNumber,
        waterYear,
        waterCode,
      },
    });

    return NextResponse.json({ envelopeId, status: (envelope as any)?.status || "sent" });
  } catch (err: any) {
    console.error("[trades.sign] Failed to create DocuSign envelope", err);
    return NextResponse.json({ error: err?.message || "Failed to start signing" }, { status: 500 });
  }
}
