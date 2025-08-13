// app/listings/[id]/page.tsx
import Link from "next/link";

type ListingDetail = {
  id: string;
  title: string;
  description?: string | null;
  district: string;
  waterType: string;
  availability?: string | null;
  availabilityStart: string;
  availabilityEnd: string;
  acreFeet: number;
  pricePerAf: number;  // dollars
  kind: "SELL" | "BUY";
  status: string;
  createdAt: string;
  updatedAt: string;
};

async function fetchListing(id: string): Promise<ListingDetail | null> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/listings/${id}`, {
    // ensure fresh on Vercel (you can tweak)
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function ListingDetailPage({ params }: { params: { id: string } }) {
  const listing = await fetchListing(params.id);
  if (!listing) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Listing not found</h1>
        <p className="mt-2 text-slate-600">
          The listing may have been removed or the link is incorrect.
        </p>
        <Link href="/dashboard" className="mt-4 inline-block text-[#004434] underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{listing.title}</h1>
        <span className="rounded-full bg-[#0A6B58] px-3 py-1 text-xs font-medium text-white">
          {listing.kind === "BUY" ? "Buy" : "Sell"}
        </span>
      </div>

      <p className="mt-2 text-sm text-slate-600">{listing.description || "No description provided."}</p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Detail label="District" value={listing.district} />
        <Detail label="Water Type" value={listing.waterType} />
        <Detail label="Acre-Feet" value={formatNumber(listing.acreFeet)} />
        <Detail label="Price / AF" value={`$${formatNumber(listing.pricePerAf)}`} />
        <Detail label="Availability" value={formatWindow(listing.availabilityStart, listing.availabilityEnd)} />
        <Detail label="Status" value={listing.status} />
      </div>

      <div className="mt-8">
        <Link href="/dashboard" className="rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
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
  return sameYear ? `${mm(s)}–${mm(e)} ${s.getFullYear()}` : `${mm(s)} ${s.getFullYear()} – ${mm(e)} ${e.getFullYear()}`;
}
