// app/api/transactions/[id]/buy/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { sendPurchaseEmails } from "@/lib/email";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const txId = params.id;

    // Identify viewer (buyer)
    const viewer = await prisma.user.findFirst({
      where: { clerkId: userId },
      select: { id: true, email: true, name: true },
    });
    if (!viewer) {
      return NextResponse.json({ error: "Viewer not found" }, { status: 404 });
    }

    // Pull the transaction + related parties
    const tx = await prisma.transaction.findUnique({
      where: { id: txId },
      include: {
        listing: true, // include full listing to avoid field name drift issues
        buyer: { select: { id: true, email: true, name: true } },
        seller: { select: { id: true, email: true, name: true } },
      },
    });

    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Compute "PURCHASED" value in a schema-tolerant way
    // Prefer the generated enum if it exists, else fall back to string.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const STATUS_PURCHASED: any =
      // @ts-expect-error tolerate projects where enum doesn't exist yet
      (Prisma as any)?.TransactionStatus?.PURCHASED ?? "PURCHASED";

    // If already purchased, don't double-process—just return confirmation URL
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((tx as any).status === STATUS_PURCHASED || (tx as any).status === "PURCHASED") {
      const confirmationUrl = `/transactions/${tx.id}/confirmation`;
      return NextResponse.json({ ok: true, confirmationUrl });
    }

    // Attach buyer if not already, mark as purchased
    const updated = await prisma.transaction.update({
      where: { id: txId },
      data: {
        buyerId: tx.buyerId ?? viewer.id,
        // Use update-operator form to satisfy EnumTransactionStatusFieldUpdateOperationsInput
        status: { set: STATUS_PURCHASED },
        // If your schema doesn't have purchasedAt, Prisma will error; remove this line in that case.
        purchasedAt: new Date(),
      },
      include: {
        listing: true,
        buyer: { select: { id: true, email: true, name: true } },
        seller: { select: { id: true, email: true, name: true } },
      },
    });

    // ---- Build robust email payload from listing (handles schema variations) ----
    const L = updated.listing as any;

    // Prefer explicit cents fields; otherwise derive from dollars
    const pricePerAfCents: number =
      (typeof L?.pricePerUnitCents === "number" && L.pricePerUnitCents) ??
      (typeof L?.pricePerAfCents === "number" && L.pricePerAfCents) ??
      (typeof L?.priceCents === "number" && L.priceCents) ??
      (typeof L?.pricePerUnit === "number" && Math.round(L.pricePerUnit * 100)) ??
      (typeof L?.price === "number" && Math.round(L.price * 100)) ??
      0;

    const priceLabel: string | undefined =
      typeof L?.pricePerUnit === "number"
        ? `$${Number(L.pricePerUnit).toLocaleString(undefined, { maximumFractionDigits: 2 })}/AF`
        : undefined;

    const district: string = L?.district ?? L?.districtName ?? "—";
    const waterType: string | null = L?.waterType ?? L?.type ?? null;
    const volumeAf: number = Number(L?.volumeAf ?? L?.quantityAf ?? 0);
    const windowLabel: string | undefined = L?.windowLabel ?? L?.transferWindow ?? undefined;

    // ---- Send emails (buyer receipt + seller docs ready) ----
    await sendPurchaseEmails({
      buyerEmail: updated.buyer?.email ?? viewer.email!,
      buyerName: updated.buyer?.name ?? viewer.name ?? undefined,
      sellerEmail: updated.seller?.email ?? undefined,
      sellerName: updated.seller?.name ?? undefined,
      transactionId: updated.id,
      offer: {
        listingTitle: L?.title ?? "Listing",
        district,
        waterType,
        volumeAf,
        pricePerAf: pricePerAfCents, // cents
        priceLabel,                  // pretty $/AF if available
        windowLabel,
      },
      buyerViewLink: `/transactions/${updated.id}`,
      sellerViewLink: `/transactions/${updated.id}`,
      // sellerSignLink optional; helper will coerce if omitted
    });

    const confirmationUrl = `/transactions/${updated.id}/confirmation`;
    return NextResponse.json({ ok: true, confirmationUrl });
  } catch (err) {
    console.error("Buy route error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
