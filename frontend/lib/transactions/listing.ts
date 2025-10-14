// Shared listing helpers used by the server action and API route that manage
// transaction purchases. Keeping them here ensures `@/lib/transactions/*`
// imports resolve consistently in both environments.
import { prisma } from "@/lib/prisma";
import { ListingStatus } from "@prisma/client";

import { successTransactionStatuses } from "./status";

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
