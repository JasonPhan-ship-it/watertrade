"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { sendPurchaseEmails } from "@/lib/email";

export async function purchaseAction(txId: string): Promise<{ confirmationUrl: string }> {
  const { userId } = auth();
  if (!userId) throw new Error("Unauthorized");

  // Viewer (buyer)
  const viewer = await prisma.user.findFirst({
    where: { clerkId: userId },
    select: { id: true, email: true, name: true },
  });
  if (!viewer) throw new Error("Viewer not found");

  // Transaction + parties
  const tx = await prisma.transaction.findUnique({
    where: { id: txId },
    include: {
      listing: true,
      buyer: { select: { id: true, email: true, name: true } },
      seller: { select: { id: true, email: true, name: true } },
    },
  });
  if (!tx) throw new Error("Transaction not found");

  const STATUS_PURCHASED: any = (Prisma as any)?.TransactionStatus?.PURCHASED ?? "PURCHASED";

  // Idempotent: if already purchased, just return the confirmation URL
  // @ts-ignore schema drift tolerant
  if (tx.status === STATUS_PURCHASED || String((tx as any).status) === "PURCHASED") {
    return { confirmationUrl: `/transactions/${tx.id}/confirmation` };
  }

  // Update → mark purchased
  const data: any = {
    buyerId: tx.buyerId ?? viewer.id,
    status: { set: STATUS_PURCHASED },
  };
  // Optional: won’t compile on branches lacking this field, so keep under any
  data.purchasedAt = new Date();

  const updated = await prisma.transaction.update({
    where: { id: txId },
    data,
    include: {
      listing: true,
      buyer: { select: { id: true, email: true, name: true } },
      seller: { select: { id: true, email: true, name: true } },
    },
  });

  // Build email payload defensively from listing
  const L = updated.listing as any;
  const cents: number =
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

  await sendPurchaseEmails({
    buyerEmail: updated.buyer?.email ?? viewer.email!,
    buyerName: updated.buyer?.name ?? viewer.name ?? undefined,
    sellerEmail: updated.seller?.email ?? undefined,
    sellerName: updated.seller?.name ?? undefined,
    transactionId: updated.id,
    offer: {
      listingTitle: L?.title ?? "Listing",
      district: L?.district ?? L?.districtName ?? "—",
      waterType: L?.waterType ?? L?.type ?? null,
      volumeAf: Number(L?.volumeAf ?? L?.quantityAf ?? 0),
      pricePerAf: cents,           // cents
      priceLabel,                  // pretty label if available
      windowLabel: L?.windowLabel ?? L?.transferWindow ?? undefined,
    },
    buyerViewLink: `/transactions/${updated.id}`,
    sellerViewLink: `/transactions/${updated.id}`,
  });

  return { confirmationUrl: `/transactions/${updated.id}/confirmation` };
}
