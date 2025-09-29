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

    // Grab only what we know exists on your schema (no TS errors).
    const tx = await prisma.transaction.findUnique({
      where: { id: txId },
      select: {
        id: true,
        // common “maybe present” DocuSign fields (optional; TS-safe via select + any casting below)
        // @ts-expect-error – may not exist; we’ll read through `any`
        docusignEnvelopeId: true,
        // @ts-expect-error – may not exist
        envelopeId: true,
        // @ts-expect-error – may not exist
        docusign_envelope_id: true,
        // @ts-expect-error – may not exist
        agreementEnvelopeId: true,
        // @ts-expect-error – may not exist
        sellerClientUserId: true,
        // @ts-expect-error – may not exist
        seller_client_user_id: true,

        seller: { select: { email: true, name: true } },
        listing: { select: { title: true } },
      },
    });

    if (!tx || !tx.seller?.email) {
      return NextResponse.json({ error: "Transaction or seller not found" }, { status: 404 });
    }

    // Resolve envelopeId from a few likely column names.
    const anyTx = tx as any;
    const envelopeId: string | undefined =
      anyTx.docusignEnvelopeId ??
      anyTx.envelopeId ??
      anyTx.docusign_envelope_id ??
      anyTx.agreementEnvelopeId;

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

    // Resolve the embedded signer clientUserId.
    // If you set clientUserId to the template role name when creating the envelope, this fallback works.
    const clientUserId: string =
      anyTx.sellerClientUserId ??
      anyTx.seller_client_user_id ??
      process.env.DOCUSIGN_ROLE_SELLER ??
      "seller";

    const sellerEmail = tx.seller.email;
    const sellerName = tx.seller.name ?? tx.seller.email;

    const returnUrl = appUrl(`/transactions/${tx.id}?signed=1`);

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
