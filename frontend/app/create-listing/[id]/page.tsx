// app/listings/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";

type Listing = {
  id: string;
  district: string;
  acreFeet: number;
  pricePerAf: number;
  availabilityStart: string;
  availabilityEnd: string;
  waterType: string;
  createdAt: string;
};

// ---- Fetch a single listing (adjust the URL to match your API) ----
async function getListing(id: string): Promise<Listing | null> {
  // If your API is /api/listings/[id]
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/listings/${id}`, {
    // Avoid caching so new data shows immediately
    cache: "no-store",
  }).catch(() => null);

  // If you don't have /api/listings/[id], uncomment this instead:
  // const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/listings?id=${id}`, { cache: "no-store" }).catch(() => null);

  if (!res || !res.ok) return null;

  const json = await res.json();
  // Support either { listing: {...} } or a raw object
  return (json?.listing ?? json) as Listing;
}

export default async function ListingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const listing = await getListing(params.id);

  if (!listing) {
    // If API isn’t wired yet, you can return a placeholder instead of 404:
    // return <div className="container mx-auto px-4 py-10">Coming soon… ({params.id})</div>
    notFound();
  }

  return (
    <main className="container mx-auto px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Listing Details</h1>
        <Link
          href="/dashboard"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Back to Dashboard
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
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
              <dd className="text-sm font-medium text-slate-900">
                ${new Intl.NumberFormat("en-US").format(listing.pricePerAf)}
              </dd>
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

        {/* Placeholder for actions / contact / offer flow */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Next Steps</h2>
          <p className="mt-2 text-sm text-slate-600">
            Add “Request Info” / “Make Offer” actions here and show district-specific
            forms or docs as needed.
          </p>
        </div>
      </div>
    </main>
  );
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
