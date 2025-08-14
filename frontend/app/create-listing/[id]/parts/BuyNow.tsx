// frontend/app/create-listing/[id]/parts/BuyNow.tsx
import { prisma } from "@/lib/prisma";
import BuyNowButton from "./BuyNowButton";

export default async function BuyNow({ listingId }: { listingId: string }) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, title: true, acreFeet: true, pricePerAF: true }, // pricePerAF is cents
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

  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm font-medium">Buy Now</div>

      <div className="mt-2 text-sm text-slate-600">
        {title ? <div className="font-medium text-slate-900">{title}</div> : null}
        <div className="mt-1 grid grid-cols-2 gap-2">
          <div>
            <div className="text-slate-500 text-xs">Acre-Feet</div>
            <div className="text-slate-900 font-medium">{acreFeet.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-slate-500 text-xs">Price / AF</div>
            <div className="text-slate-900 font-medium">${priceDollars}</div>
          </div>
        </div>
        <div className="mt-2 text-sm">
          Total: <span className="font-semibold">${totalDollars}</span>
        </div>
      </div>

      <div className="mt-3">
        <BuyNowButton
          listingId={id}
          acreFeet={acreFeet}
          pricePerAF={pricePerAF} // pass cents to the client button
          label={`Buy ${acreFeet.toLocaleString()} AF @ $${priceDollars}/AF (Total $${totalDollars})`}
        />
      </div>
    </div>
  );
}
