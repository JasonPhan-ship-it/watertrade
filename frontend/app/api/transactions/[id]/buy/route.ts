import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendPurchaseEmail } from "@/lib/email";

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

    // Fetch transaction and viewer (buyer) info
    const viewer = await prisma.user.findFirst({
      where: { clerkId: userId },
      select: { id: true, email: true, name: true },
    });
    if (!viewer) {
      return NextResponse.json({ error: "Viewer not found" }, { status: 404 });
    }

    const tx = await prisma.transaction.findUnique({
      where: { id: txId },
      include: {
        listing: {
          select: { id: true, title: true, sellerId: true, pricePerUnit: true, unitLabel: true },
        },
        buyer: { select: { id: true, email: true, name: true } },
        seller: { select: { id: true, email: true, name: true } },
      },
    });

    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Attach buyer if not already, set status to PURCHASED (adjust to your enum)
    const updated = await prisma.transaction.update({
      where: { id: txId },
      data: {
        buyerId: tx.buyerId ?? viewer.id,
        status: "PURCHASED", // <- change if your schema uses a different value
        purchasedAt: new Date(),
      },
      include: {
        listing: true,
        buyer: true,
        seller: true,
      },
    });

    // Send email(s)
    await sendPurchaseEmail({
      toBuyer: updated.buyer?.email ?? viewer.email!,
      toSeller: updated.seller?.email || undefined,
      buyerName: updated.buyer?.name ?? viewer.name ?? "Buyer",
      sellerName: updated.seller?.name ?? "Seller",
      listingTitle: updated.listing?.title ?? "Listing",
      transactionId: updated.id,
      pricePerUnit: updated.listing?.pricePerUnit ?? null,
      unitLabel: updated.listing?.unitLabel ?? undefined,
    });

    const confirmationUrl = `/transactions/${updated.id}/confirmation`;
    return NextResponse.json({ ok: true, confirmationUrl });
  } catch (err) {
    console.error("Buy route error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
