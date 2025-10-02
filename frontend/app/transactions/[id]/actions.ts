// app/transactions/[id]/actions.ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

/** Prisma v6 enum type */
type TxStatus = Prisma.$Enums.TransactionStatus;

/** Get the runtime enum map (works with v6 and older) */
function txEnumMap(): Record<string, string> {
  return (
    (Prisma as any).$Enums?.TransactionStatus || // Prisma v6
    (Prisma as any).TransactionStatus || // older Prisma
    {}
  );
}

/** Map desired "PURCHASED" to whatever exists in the enum */
function mapPurchasedToExisting(): TxStatus {
  const S = txEnumMap();
  const candidates = ["PURCHASED", "CLOSED", "COMPLETED", "EXECUTED", "FINALIZED"];
  for (const c of candidates) {
    if (S[c]) return S[c] as TxStatus;
  }
  const first = Object.values(S)[0] as string | undefined;
  return (first ?? "CLOSED") as TxStatus;
}

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
 * Mark a transaction as purchased (or the nearest terminal state),
 * set purchasedAt, and attach buyerId when available.
 */
export async function purchaseAction(
  transactionId: string
): Promise<{ confirmationUrl?: string }> {
  "use server";
  if (!transactionId) throw new Error("Missing transaction id");

  const status = mapPurchasedToExisting();
  const buyerId = await resolveBuyerId();

  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      ...(buyerId ? { buyerId } : {}),
      status: status as any, // TS cross-version safety
      purchasedAt: new Date(),
    },
  });

  // Keep user on current page; page.tsx handles success UI / redirect if needed
  return { confirmationUrl: undefined };
}
