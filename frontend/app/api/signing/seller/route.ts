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

    // Load only known-typed fields; then read optional DocuSign fields via `as any`.
    const txBase = await prisma.transaction.findUnique({
      where: { id: txId },
      include: {
        seller: { select: { email: true, name: true } },
        listing: { select: { title: true } },
      },
    });

    if (!txBase || !txBase.seller?.email) {
      return NextResponse.json({ error: "Transaction or seller not found" }, { status: 404 });
    }

    // Read optional fields safely from the same object via `any`. This avoids typing unknown columns.
    const txAny = txBase as any;

    const envelopeId: string | undefined =
      txAny.sellerEnvelopeId ??
      txAny.docusignEnvelopeId ??
      txAny.envelopeId ??
      txAny.docusign_envelope_id ??
      txAny.agreementEnvelopeId;

    if (!envelopeId) {
      return NextResponse.json(
        {
          error: "Envelope ID missing",
          hint:
            "Store the DocuSign envelope ID on the transaction (e.g., docusignEnvelopeId) when you create it.",
        },
        { status: 409 }
      );
    }

    // Resolve embedded signer clientUserId (fall back to template role name if you used that).
    const clientUserId: string =
      txAny.sellerClientUserId ??
      txAny.seller_client_user_id ??
      process.env.DOCUSIGN_ROLE_SELLER ??
      "seller";

    const sellerEmail = txBase.seller.email;
    const sellerName = txBase.seller.name ?? txBase.seller.email;

    const returnUrl = appUrl(`/transactions/${txBase.id}?signed=1`);

    const signUrl = await createSellerSigningUrl({
      envelopeId,
      sellerEmail,
      sellerName,
      sellerClientUserId: clientUserId,
      returnUrl,
      // Optional:
      // pingUrl: appUrl("/api/docusign/ping"),
      // brandId: process.env.DOCUSIGN_BRAND_ID,
    });

    return NextResponse.redirect(signUrl, 302);
  } catch (err: any) {
    console.error("[api/signing/seller] error:", err);
    return NextResponse.json(
      { error: "Failed to create seller signing URL", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
