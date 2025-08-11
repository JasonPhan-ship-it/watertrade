// frontend/app/listings/[id]/page.tsx
import prisma from "@/lib/prisma";
import BuyNow from "./parts/BuyNow";
import MakeOffer from "./parts/MakeOffer";
import AuctionBid from "./parts/AuctionBid";

type Props = { params: { id: string } };

export const dynamic = "force-dynamic";

export default async function ListingDetails({ params }: Props) {
  const listing = await prisma.listing.findUnique({ where: { id: params.id } });

  if (!listing) {
    // For now, show a friendly message instead of a hard 404 so you can debug IDs.
    return <div className="p-6">Listing not found for id: {params.id}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{listing.district}</h1>
        <p className="text-sm text-slate-500">
          {listing.waterType} • {listing.availability}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="col-span-2 rounded-2xl border p-4">
          <dl className="grid grid-cols-2 gap-3">
            <dt className="text-slate-500">Acre-Feet</dt>
            <dd>{listing.acreFeet.toLocaleString()}</dd>
            <dt className="text-slate-500">$/AF</dt>
            <dd>${(listing.pricePerAF / 100).toLocaleString()}</dd>
          </dl>
        </div>

        <div className="space-y-4">
          {!listing.isAuction && <BuyNow listing={listing} />}
          <MakeOffer listing={listing} />
          {listing.isAuction && <AuctionBid listing={listing} />}
        </div>
      </div>
    </div>
  );
}
