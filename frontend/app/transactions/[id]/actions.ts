// app/transactions/[id]/actions.ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

/** Runtime enum map (works across Prisma versions) */
function txEnumMap(): Record<string, string> {
  return (
    (Prisma as any).$Enums?.TransactionStatus || // Prisma v6
    (Prisma as any).TransactionStatus || // older Prisma
    {}
  );
}

/** Map desired "PURCHASED" to whatever actually exists in your enum */
function mapPurchasedToExisting(): string {
  const S = txEnumMap();
  const candidates = ["PURCHASED", "CLOSED", "COMPLETED", "EXECUTED", "FINALIZED"];
  for (const c of candidates) if (S[c]) return S[c];
  return Object.values(S)[0] ?? "CLOSED";
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
 * Mark a transaction as purchased (or closest terminal state),
 * set purchasedAt when the column exists, and attach buyerId when available.
 */
export async function purchaseAction(
  transactionId: string
): Promise<{ confirmationUrl?: string }> {
  "use server";
  if (!transactionId) throw new Error("Missing transaction id");

  const status = mapPurchasedToExisting();
  const buyerId = await resolveBuyerId();

  // Build data dynamically to bypass TS complaining about unknown fields across schemas
  const data: any = {
    ...(buyerId ? { buyerId } : {}),
    status, // value is one of the runtime enum strings
  };

  // Try to set purchasedAt, but gracefully fall back if the field doesn't exist in this schema
  data.purchasedAt = new Date();

  try {
    await prisma.transaction.update({
      where: { id: transactionId },
      data,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    const looksLikeNoPurchasedAt =
      /Unknown (arg|field)\s+`purchasedAt`/i.test(msg) ||
      /Unknown argument `purchasedAt`/i.test(msg);

    if (looksLikeNoPurchasedAt) {
      // Remove and retry without purchasedAt
      delete data.purchasedAt;
      await prisma.transaction.update({
        where: { id: transactionId },
        data,
      });
    } else {
      // Bubble anything else
      throw e;
    }
  }

  // Keep user on the page; the page can decide to redirect or show success
  return { confirmationUrl: undefined };
}
