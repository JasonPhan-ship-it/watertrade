// app/transactions/[id]/actions.ts
"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/** Map our desired "PURCHASED" state onto whatever actually exists in TransactionStatus */
function mapPurchasedToExisting(): Prisma.TransactionStatus {
  const S = Prisma.TransactionStatus as any;

  // Put your preferred final states first; fall back to a sensible existing value.
  // Adjust the order below to match your schema semantics.
  return (
    S.PURCHASED ??
    S.CLOSED ??
    S.COMPLETED ??
    S.EXECUTED ??
    S.SOLD ??
    // last resort: pick the last enum value (often the most "final" in many schemas)
    (Object.values(S)[Object.values(S).length - 1] as Prisma.TransactionStatus)
  );
}

/** Resolve the current app user id from Clerk (best-effort). */
async function getCurrentDbUserId(): Promise<string | null> {
  try {
    const { userId } = auth();
    if (!userId) return null;
    const u = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    });
    return u?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * purchaseAction
 * - marks the transaction as purchased using an enum value that exists in prod
 * - stamps purchasedAt
 * - sets buyerId to the current user (if available)
 * - returns an optional confirmationUrl (leave undefined if you don't have one)
 */
export async function purchaseAction(transactionId: string): Promise<{ confirmationUrl?: string }> {
  if (!transactionId) throw new Error("Missing transaction id");

  const buyerId = await getCurrentDbUserId();
  const mapped = mapPurchasedToExisting();

  // IMPORTANT: assign the enum directly (avoid `{ set: ... }` to keep logs cleaner)
  const tx = await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      ...(buyerId ? { buyerId } : {}),
      status: mapped,
      purchasedAt: new Date(),
    },
    include: {
      listing: true,
      buyer: { select: { id: true, email: true, name: true } },
      seller: { select: { id: true, email: true, name: true } },
    },
  });

  // If you have an external confirmation flow (Stripe, Docusign, etc.), build its URL here.
  // Otherwise, return undefined and keep the user on the same page.
  const confirmationUrl: string | undefined = undefined;

  // Optional: log what we set for easier debugging in Vercel logs
  // eslint-disable-next-line no-console
  console.log("[purchaseAction] mapped status used:", mapped, "for tx", transactionId);

  return { confirmationUrl };
}
