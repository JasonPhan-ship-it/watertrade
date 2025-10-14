import { TransactionStatus } from "@prisma/client";

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
