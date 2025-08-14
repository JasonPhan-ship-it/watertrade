// app/listings/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ListingActions from "@/components/ListingActions";

export const revalidate = 0; // no cache

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
      kind: true,       // SELL | BUY
      isAuction: true,
      reservePrice: true, // cents | null
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!row) return notFound();

  const pricePerAfDollars = row.pricePerAF / 100;
  const startIso = row.availabilityStart.toISOString();
  const endIso = row.availabilityEnd.toISOString();

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{row.title}</h1>
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

      <p className="mt-2 text-sm text-slate-600">
        {row.description || "No description provided."}
      </p>

      {/* Facts */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="District" value={row.district} />
        <Detail label="Water Type" value={row.waterType} />
        <Detail label="Acre-Feet" value={formatNumber(row.acreFeet)} />
        <Detail label="Price / AF" value={`$${formatNumber(pricePerAfDollars)}`} />
        <Detail label="Availability" value={formatWindow(startIso, endIso)} />
        <Detail label="Status" value={row.status} />
      </div>

      {/* Actions */}
      <div className="mt-8">
        <ListingActions
          listingId={row.id}
          kind={row.kind}                              // "SELL" | "BUY"
          pricePerAf={pricePerAfDollars}              // dollars for UI
          isAuction={!!row.isAuction}
          reservePrice={row.reservePrice != null ? row.reservePrice / 100 : null} // dollars
        />
      </div>

      {/* Back */}
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function formatNumber(n: number | string) {
  const num = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(num);
}

function formatWindow(startIso: string, endIso: string) {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sameYear = s.getFullYear() === e.getFullYear();
  const mm = (d: Date) => d.toLocaleString("en-US", { month: "short" });
  return sameYear
    ? `${mm(s)}–${mm(e)} ${s.getFullYear()}`
    : `${mm(s)} ${s.getFullYear()} – ${mm(e)} ${e.getFullYear()}`;
}
