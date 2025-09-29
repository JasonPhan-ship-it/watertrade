// app/api/signing/seller/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/email";
import { createSellerSigningUrl } from "@/lib/docusign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const txId = req.nextUrl.searchParams.get("tx");
    if (!txId) {
      return NextResponse.json({ error: "Missing tx" }, { status: 400 });
    }

    // Load minimal fields needed to build the seller signing view
    const tx = await prisma.transaction.findUnique({
      where: { id: txId },
      include: {
        seller: { select: { email: true, name: true } },
        listing: { select: { title: true } }, // optional but handy for logging
      },
    });

    if (!tx || !tx.seller?.email) {
      return NextResponse.json({ error: "Transaction or seller not found" }, { status: 404 });
    }
    if (!tx.docusignEnvelopeId || !tx.sellerClientUserId) {
      return NextResponse.json({ error: "Envelope or clientUserId missing" }, { status: 409 });
    }

    const returnUrl = appUrl(`/transactions/${tx.id}?signed=1`);
    const signUrl = await createSellerSigningUrl({
      envelopeId: tx.docusignEnvelopeId,
      sellerEmail: tx.seller.email,
      sellerName: tx.seller.name ?? tx.seller.email,
      sellerClientUserId: tx.sellerClientUserId,
      returnUrl,
      // Optional: pingUrl: appUrl("/api/docusign/ping"),
      // Optional: brandId: process.env.DOCUSIGN_BRAND_ID,
    });

    // Send user straight to DocuSign
    return NextResponse.redirect(signUrl, 302);
  } catch (err: any) {
    console.error("[signing/seller] error:", err);
    return NextResponse.json({ error: "Failed to create seller signing URL" }, { status: 500 });
  }
}
