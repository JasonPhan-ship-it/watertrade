// app/listings/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ListingActions from "@/components/ListingActions";
import { Info } from "lucide-react";

export const revalidate = 0; // always fresh

type PageProps = { params: { id: string } };

export default async function ListingDetailPage({ params }: PageProps) {
  const row = await prisma.listing.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      description: true,
      district: true,
      waterType: true,
      availability: true,
      availabilityStart: true,
      availabilityEnd: true,
      acreFeet: true,
      pricePerAF: true, // cents
      kind: true, // SELL | BUY
      isAuction: true,
      reservePrice: true, // cents | null
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!row) return notFound();

  const pricePerAfDollars = row.pricePerAF / 100;
  const reservePriceDollars = row.reservePrice != null ? row.reservePrice / 100 : null;

  const title = (row.title || "").trim() || "Untitled Listing";
  const description = (row.description || "").trim() || "No description provided.";

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {row.isAuction && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-300">
              Auction
            </span>
          )}
          <span className="rounded-full bg-[#0A6B58] px-3 py-1 text-xs font-medium text-white">
            {row.kind === "BUY" ? "Buyer Looking" : "For Sale"}
          </span>
        </div>
      </div>

      {/* Details + Action panel */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr,380px]">
        {/* Left: Facts */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Detail label="District" value={row.district} />
          <Detail label="Water Type" value={row.waterType} />
          <Detail label="Acre-Feet" value={formatInt(row.acreFeet)} />
          <Detail label="Status" value={row.status} />
          <Detail label="Created" value={new Date(row.createdAt).toLocaleString()} />
          <Detail label="Updated" value={new Date(row.updatedAt).toLocaleString()} />
          {row.isAuction && (
            <Detail
              label="Reserve Price"
              value={
                reservePriceDollars != null
                  ? `$${format2(reservePriceDollars)} / AF`
                  : "No reserve"
              }
            />
          )}
        </section>

        {/* Right: Actions (SELL listings only) */}
        {row.kind === "SELL" && (
          <aside className="sticky top-4 h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3">
              <div className="text-sm font-semibold text-slate-900">Buy Now / Offer</div>
              <div className="mt-1 text-xs text-slate-500">
                {row.isAuction
                  ? "Auction available — place a bid or submit an offer."
                  : "Buy it now or send an offer to the seller."}
              </div>
            </div>

            <ListingActions
              listingId={row.id}
              kind="SELL"
              pricePerAf={pricePerAfDollars}
              isAuction={!!row.isAuction}
              reservePrice={reservePriceDollars}
            />
          </aside>
        )}
      </div>

      {/* Back link */}
      <div className="mt-8">
        <Link
          href="/dashboard"
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
        >
          Back to Listings
        </Link>
      </div>
    </div>
  );
}

/* ---------- UI bits ---------- */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

/** Specialized price card with right-side explanatory note on desktop */
function PriceDetailWithNote({ priceLabel }: { priceLabel: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">Price $/AF</div>

      {/* Use arbitrary property to ensure template columns compile in Tailwind */}
      <div className="mt-2 grid grid-cols-1 items-start gap-3 sm:[grid-template-columns:1fr_18rem]">
        {/* Left: value box */}
        <div>
          <div className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
            {priceLabel}
          </div>
        </div>

        {/* Right: explanatory note */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 text-slate-500" />
            <p>
              Shown as dollars per acre-foot. Final settlement may vary with delivery window,
              conveyance, and district fees.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- format helpers ---------- */
function formatInt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
function format2(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
