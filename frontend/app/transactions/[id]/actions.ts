// app/transactions/[id]/actions.ts
import { Prisma } from "@prisma/client";
import type { Prisma as PrismaNS } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

/** ---- Cross-version-safe enum typing (Prisma v5/v6) ---- */
type TxStatus = PrismaNS["$Enums"] extends { TransactionStatus: infer E } ? E : string;

/** Access the runtime enum map across Prisma versions */
function txEnumMap(): Record<string, string> {
  return (
    (Prisma as any).TransactionStatus || // older Prisma
    (Prisma as any).$Enums?.TransactionStatus || // Prisma v6
    {}
  );
}

/** Map desired "PURCHASED" to whatever enum value actually exists */
function mapPurchasedToExisting(): TxStatus {
  const S = txEnumMap();
  const candidates = ["PURCHASED", "CLOSED", "COMPLETED", "EXECUTED", "FINALIZED"];
  for (const c of candidates) if (S[c]) return S[c] as TxStatus;
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
 * Server action to mark a transaction as purchased (or closest terminal state available),
 * set purchasedAt, and optionally attach the buyerId.
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

  // Keep user on page; page.tsx can handle success UI
  return { confirmationUrl: undefined };
}
