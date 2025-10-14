// Shared listing helpers used by the server action and API route that manage
// transaction purchases. Keeping them here ensures `@/lib/transactions/*`
// imports resolve consistently in both environments.
import { prisma } from "@/lib/prisma";
import { ListingStatus, TransactionStatus } from "@prisma/client";

type TxStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];

type TxStatusMap = Record<string, TxStatus>;

const transactionStatusByKey = TransactionStatus as unknown as TxStatusMap;

function pickStatuses(keys: string[]): TxStatus[] {
  return keys
    .map((key) => transactionStatusByKey[key])
    .filter((value): value is TxStatus => typeof value === "string" && value.length > 0);
}

const closedStatusKeys = [
  "FUNDS_RELEASED",
  "APPROVED",
  "COMPLETED",
  "SETTLED",
  "CLOSED",
  "CANCELLED",
];

const successStatusKeys = [
  "FUNDS_RELEASED",
  "APPROVED",
  "COMPLETED",
  "SETTLED",
];

const closedStatuses = new Set<string>(pickStatuses(closedStatusKeys));
export const successTransactionStatuses = new Set<string>(pickStatuses(successStatusKeys));

export function isClosedTransactionStatus(status: unknown): status is TxStatus {
  if (!status) return false;
  const statusStr = typeof status === "string" ? status : String(status);
  return closedStatuses.has(statusStr);
}

export function preferredClosedTransactionStatus(): TxStatus | null {
  for (const candidate of successStatusKeys) {
    const status = transactionStatusByKey[candidate];
    if (status) return status;
  }
  return null;
}

type ListingStatusValue = (typeof ListingStatus)[keyof typeof ListingStatus];

type ListingStatusMap = Record<string, ListingStatusValue>;

const listingStatusByKey = ListingStatus as unknown as ListingStatusMap;
const archivePreference = ["ARCHIVED", "SOLD"];

function resolveArchiveStatus(): ListingStatusValue | null {
  for (const candidate of archivePreference) {
    const status = listingStatusByKey[candidate];
    if (status) return status;
  }
  return null;
}

/**
 * If a transaction has reached a terminal "successful" status, archive the listing.
 *
 * The exact Listing status depends on what exists in the enum. Preference order:
 * - ARCHIVED
 * - SOLD
 */
export async function archiveListingIfTransactionClosed(
  listingId: string | null | undefined,
  status: unknown,
  caller: string = "[lib/transactions/listing]"
) {
  if (!listingId) return;
  if (!status) return;

  const statusStr = typeof status === "string" ? status : String(status);
  if (!successTransactionStatuses.has(statusStr)) {
    return;
  }

  const targetStatus = resolveArchiveStatus();
  if (!targetStatus) return;

  try {
    await prisma.listing.update({
      where: { id: listingId },
      data: { status: targetStatus },
    });
  } catch (err) {
    console.error(`${caller} failed to archive listing ${listingId}:`, err);
  }
}
