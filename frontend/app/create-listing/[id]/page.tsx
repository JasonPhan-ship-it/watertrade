// frontend/app/create-listing/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import BuyNow from "./parts/BuyNow";
import MakeOffer from "./parts/MakeOffer";
import AuctionBid from "./parts/AuctionBid";

export default async function ListingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const listing = await prisma.listing.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      district: true,
      acreFeet: true,
      pricePerAF: true,            // cents
      availabilityStart: true,     // Date
      availabilityEnd: true,       // Date
      waterType: true,
      createdAt: true,
      isAuction: true,
    },
  });

  if (!listing) {
    notFound();
  }

  const priceDollars = (listing.pricePerAF / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <main className="container mx-auto px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">
          {listing.title || "Listing Details"}
        </h1>
        <Link
          href="/dashboard"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Back to Dashboard
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left column: details */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <dl className="grid grid-cols-1 gap-4">
            <div>
              <dt className="text-xs text-slate-500">District</dt>
              <dd className="text-sm font-medium text-slate-900">{listing.district}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Acre-Feet</dt>
              <dd className="text-sm font-medium text-slate-900">
                {new Intl.NumberFormat("en-US").format(listing.acreFeet)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">$ / AF</dt>
              <dd className="text-sm font-medium text-slate-900">${priceDollars}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Availability</dt>
              <dd className="text-sm font-medium text-slate-900">
                {formatWindow(listing.availabilityStart, listing.availabilityEnd)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Water Type</dt>
              <dd>
                <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                  {listing.waterType}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Created</dt>
              <dd className="text-sm font-medium text-slate-900">
                {new Date(listing.createdAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>

        {/* Right column: actions */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Next Steps</h2>

          {/* Buy Now: fetches AF and Price/AF from DB, no inputs */}
          <BuyNow listingId={listing.id} />

          {/* Make Offer: user-entered qty + $/AF (UI in dollars) */}
          <MakeOffer
            listing={{
              id: listing.id,
              title: listing.title || undefined,
              acreFeet: listing.acreFeet,
              pricePerAF: listing.pricePerAF, // cents; component shows dollars
            }}
          />

          {/* Optional: Auction bid, only if listing is auction */}
          {listing.isAuction ? (
            <AuctionBid
              listing={{
                id: listing.id,
                pricePerAF: listing.pricePerAF, // cents
              }}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}

/* ---------- Helpers ---------- */
function formatWindow(start: Date | string, end: Date | string) {
  const s = new Date(start);
  const e = new Date(end);
  const sameYear = s.getFullYear() === e.getFullYear();
  const mm = (d: Date) => d.toLocaleString("en-US", { month: "short" });
  return sameYear
    ? `${mm(s)}–${mm(e)} ${s.getFullYear()}`
    : `${mm(s)} ${s.getFullYear()} – ${mm(e)} ${e.getFullYear()}`;
}
