"use server";

import "server-only";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

type ActionResult = { ok: true } | { ok: false; error: string };

// Grab the correct Prisma delegate even if your model isn't named `Offer`
function getOfferClient() {
  const anyPrisma = prisma as any;
  const candidate =
    anyPrisma.offer ??
    anyPrisma.listingOffer ??
    anyPrisma.transactionOffer ??
    anyPrisma.offerRequest ??
    anyPrisma.offers; // add/adjust if yours differs
  if (!candidate) {
    throw new Error(
      "No Offer-like model found on Prisma client. Check prisma/schema.prisma for the model name."
    );
  }
  return candidate as {
    findUnique: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
}

export async function acceptOffer(opts: { offerId: string; listingId: string }): Promise<ActionResult> {
  try {
    const { userId } = auth();
    if (!userId) return { ok: false, error: "Unauthorized" };

    const Offer = getOfferClient();

    // Optional guard: ensure the offer belongs to this listing and is pending
    const offer = await Offer.findUnique({
      where: { id: opts.offerId },
      select: { id: true, listingId: true, status: true },
    });
    if (!offer) return { ok: false, error: "Offer not found" };
    if (offer.listingId !== opts.listingId) return { ok: false, error: "Offer/listing mismatch" };
    if (offer.status !== "pending") return { ok: false, error: "Offer is not pending" };

    await Offer.update({
      where: { id: opts.offerId },
      data: { status: "accepted" },
    });

    revalidatePath(`/listings/${opts.listingId}`);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Failed to accept offer" };
  }
}

export async function declineOffer(opts: { offerId: string; listingId: string }): Promise<ActionResult> {
  try {
    const { userId } = auth();
    if (!userId) return { ok: false, error: "Unauthorized" };

    const Offer = getOfferClient();

    await Offer.update({
      where: { id: opts.offerId },
      data: { status: "declined" },
    });

    revalidatePath(`/listings/${opts.listingId}`);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Failed to decline offer" };
  }
}
