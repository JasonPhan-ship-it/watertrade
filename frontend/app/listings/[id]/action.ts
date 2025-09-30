"use server";

import "server-only";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function acceptOffer(opts: { offerId: string; listingId: string }): Promise<ActionResult> {
  try {
    const { userId } = auth();
    if (!userId) return { ok: false, error: "Unauthorized" };

    // (Optional) ensure the user can act on this listing/offer
    const offer = await prisma.offer.findUnique({
      where: { id: opts.offerId },
      select: { id: true, listingId: true, status: true },
    });
    if (!offer || offer.listingId !== opts.listingId) return { ok: false, error: "Offer not found" };
    if (offer.status !== "pending") return { ok: false, error: "Offer is not pending" };

    await prisma.offer.update({
      where: { id: opts.offerId },
      data: { status: "accepted" },
    });

    // Revalidate only this listing page. No redirect.
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

    await prisma.offer.update({
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
