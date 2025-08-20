import { prisma } from "@/lib/prisma";
import BuyNowButton from "./BuyNowButton";
import { revalidatePath } from "next/cache";

export default async function BuyNow({ listingId }: { listingId: string }) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    // You can add more fields (e.g., availableAF, status) to validate availability
    select: { id: true, title: true, acreFeet: true, pricePerAF: true },
  });

  if (!listing) {
    return (
      <div className="rounded-2xl border p-4">
        <div className="text-sm font-medium">Buy Now</div>
        <div className="mt-2 text-sm text-red-600">Listing not found.</div>
      </div>
    );
  }

  const { id, title, acreFeet, pricePerAF } = listing;
  const priceDollars = (pricePerAF / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const totalDollars = ((acreFeet * pricePerAF) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // ---- Server Action: never trust client for price/qty; re-read from DB here
  const buyNowAction = async (formData: FormData) => {
    "use server";

    const idFromForm = String(formData.get("listingId") || "");
    if (!idFromForm) {
      throw new Error("Missing listing id.");
    }

    // Re-read the freshest data
    const fresh = await prisma.listing.findUnique({
      where: { id: idFromForm },
      // Add any fields you need to validate state/availability
      select: { id: true, acreFeet: true, pricePerAF: true, title: true /*, status: true, availableAF: true*/ },
    });

    if (!fresh) {
      throw new Error("Listing not found or was removed.");
    }

    // (Optional) Validate status/availability here
    // if (fresh.status !== "ACTIVE") throw new Error("Listing is not available.");
    // if (fresh.availableAF < fresh.acreFeet) throw new Error("Insufficient available AF.");

    const totalCents = fresh.acreFeet * fresh.pricePerAF;

    // Example: create an order row (adapt fields to your schema)
    await prisma.order.create({
      data: {
        listingId: fresh.id,
        // Persist snapshot pricing so later changes don’t affect the order
        acreFeet: fresh.acreFeet,
        pricePerAF: fresh.pricePerAF, // cents
        totalAmount: totalCents,      // cents
        status: "PENDING_PAYMENT",
        titleSnapshot: fresh.title ?? null,
      },
    });

    // Revalidate any pages that should reflect the change
    revalidatePath("/dashboard"); // adjust as needed
  };

  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm font-medium">Buy Now</div>

      <div className="mt-2 text-sm text-slate-600">
        {title ? <div className="font-medium text-slate-900">{title}</div> : null}

        {/* Read-only values from DB */}
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div className="rounded-lg border px-3 py-2">
            <div className="text-slate-500 text-xs">Acre-Feet</div>
            <div className="text-slate-900 font-semibold">
              {acreFeet.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border px-3 py-2">
            <div className="text-slate-500 text-xs">Price / AF</div>
            <div className="text-slate-900 font-semibold">${priceDollars}</div>
          </div>
        </div>

        <div className="mt-3 text-sm">
          Total: <span className="font-semibold">${totalDollars}</span>
        </div>
      </div>

      <div className="mt-4">
        <BuyNowButton
          listingId={id}
          action={buyNowAction} // ✅ pass server action, NOT numbers
          label={`Buy ${acreFeet.toLocaleString()} AF @ $${priceDollars}/AF (Total $${totalDollars})`}
        />
      </div>
    </div>
  );
}
