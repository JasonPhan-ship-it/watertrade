// app/api/transactions/[id]/buy/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendPurchaseEmails } from "@/lib/email";
import {
  archiveListingIfTransactionClosed,
  isClosedTransactionStatus,
  preferredClosedTransactionStatus,
} from "@/lib/transactions/listing";

const TARGET_TRANSACTION_STATUS = preferredClosedTransactionStatus();

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
        listing: true,
        buyer: { select: { id: true, email: true, name: true } },
        seller: { select: { id: true, email: true, name: true } },
      },
    });

    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    await archiveListingIfTransactionClosed(
      tx.listingId,
      tx.status,
      "[transactions/:id/buy]"
    );

    if (isClosedTransactionStatus(tx.status)) {
      return NextResponse.json(
        { error: "Transaction is closed" },
        { status: 409 }
      );
    }

    const data: Record<string, unknown> = {
      buyerId: tx.buyerId ?? viewer.id,
    };

    let pendingStatus: string | undefined;

    if (TARGET_TRANSACTION_STATUS && TARGET_TRANSACTION_STATUS !== tx.status) {
      data.status = { set: TARGET_TRANSACTION_STATUS };
      pendingStatus = TARGET_TRANSACTION_STATUS;
    }

    data.purchasedAt = new Date();

    const runUpdate = (updateData: Record<string, unknown>) =>
      prisma.transaction.update({
        where: { id: txId },
        data: updateData as any,
        include: {
          listing: true,
          buyer: { select: { id: true, email: true, name: true } },
          seller: { select: { id: true, email: true, name: true } },
        },
      });

    let updatedTx: typeof tx | null = null;

    try {
      updatedTx = await runUpdate(data);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      const looksLikeNoPurchasedAt =
        /Unknown (arg|field)\s+`purchasedAt`/i.test(msg) ||
        /Unknown argument `purchasedAt`/i.test(msg);

      if (looksLikeNoPurchasedAt) {
        delete data.purchasedAt;
        updatedTx = await runUpdate(data);
      } else {
        throw e;
      }
    }

    const updatedStatus = updatedTx?.status ?? pendingStatus ?? tx.status;

    await archiveListingIfTransactionClosed(
      updatedTx?.listingId ?? tx.listingId,
      updatedStatus,
      "[transactions/:id/buy]"
    );

    const L = (updatedTx?.listing ?? tx.listing) as any;

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

    await sendPurchaseEmails({
      buyerEmail: updatedTx?.buyer?.email ?? viewer.email!,
      buyerName: updatedTx?.buyer?.name ?? viewer.name ?? undefined,
      sellerEmail: updatedTx?.seller?.email ?? undefined,
      sellerName: updatedTx?.seller?.name ?? undefined,
      transactionId: updatedTx?.id ?? tx.id,
      offer: {
        listingTitle: L?.title ?? "Listing",
        district,
        waterType,
        volumeAf,
        pricePerAf: pricePerAfCents,
        priceLabel,
        windowLabel,
      },
      buyerViewLink: `/transactions/${updatedTx?.id ?? tx.id}`,
      sellerViewLink: `/transactions/${updatedTx?.id ?? tx.id}`,
    });

    const confirmationUrl = `/transactions/${updatedTx?.id ?? tx.id}/confirmation`;
    return NextResponse.json({ ok: true, confirmationUrl });
  } catch (err) {
    console.error("Buy route error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
