// app/transactions/[id]/actions.ts
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import {
  archiveListingIfTransactionClosed,
  preferredClosedTransactionStatus,
} from "@/lib/transactions/listing";

export const runtime = "nodejs";

const TARGET_TRANSACTION_STATUS = preferredClosedTransactionStatus();

async function resolveBuyerId(): Promise<string | undefined> {
  try {
    const { userId } = auth();
    if (!userId) return undefined;
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    });
    return user?.id;
  } catch {
    return undefined;
  }
}

/**
 * Mark a transaction as completed using the closest matching terminal status,
 * set purchasedAt when the column exists, and attach buyerId when available.
 */
export async function purchaseAction(
  transactionId: string
): Promise<{ confirmationUrl?: string }> {
  "use server";
  if (!transactionId) throw new Error("Missing transaction id");

  const buyerId = await resolveBuyerId();

  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { id: true, status: true, listingId: true },
  });

  if (!transaction) {
    throw new Error("Transaction not found");
  }

  await archiveListingIfTransactionClosed(
    transaction.listingId,
    transaction.status,
    "[transactions/[id]/actions]"
  );

  const data: Record<string, unknown> = {};

  if (buyerId) {
    data.buyer = { connect: { id: buyerId } };
  }

  let pendingStatus: string | undefined;

  if (
    TARGET_TRANSACTION_STATUS &&
    TARGET_TRANSACTION_STATUS !== transaction.status
  ) {
    data.status = { set: TARGET_TRANSACTION_STATUS };
    pendingStatus = TARGET_TRANSACTION_STATUS;
  }

  data.purchasedAt = new Date();

  const runUpdate = (updateData: Record<string, unknown>) =>
    prisma.transaction.update({
      where: { id: transactionId },
      data: updateData as any,
      select: { listingId: true, status: true },
    });

  let updateResult: { listingId: string | null; status: unknown } | null =
    null;

  try {
    updateResult = await runUpdate(data);
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    const looksLikeNoPurchasedAt =
      /Unknown (arg|field)\s+`purchasedAt`/i.test(msg) ||
      /Unknown argument `purchasedAt`/i.test(msg);

    if (looksLikeNoPurchasedAt) {
      delete data.purchasedAt;
      updateResult = await runUpdate(data);
    } else {
      throw e;
    }
  }

  const finalStatus = updateResult?.status ?? pendingStatus ?? transaction.status;
  await archiveListingIfTransactionClosed(
    updateResult?.listingId ?? transaction.listingId,
    finalStatus,
    "[transactions/[id]/actions]"
  );

  const confirmationUrl = `/transactions/${transactionId}/confirmation`;

  return { confirmationUrl };
}
