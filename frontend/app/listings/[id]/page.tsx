// frontend/app/listings/[id]/page.tsx

type Listing = {
  id: string;
  district: string;
  acreFeet: number;
  pricePerAf: number;
  availabilityStart: string; // ISO
  availabilityEnd: string;   // ISO
  waterType: string;
  createdAt: string;         // ISO
};

export default async function ListingDetailPage({
  params,
}: { params: { id: string } }) {
  // Decode once from the URL, then encode once for the API path.
  const cleanId = decodeURIComponent(params.id);

  const res = await fetch(
    `/api/listings/${encodeURIComponent(cleanId)}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Listing not found</h1>
        <p className="mt-2 text-slate-600">We couldn’t find a listing with id: <code>{cleanId}</code>.</p>
        <a href="/dashboard" className="mt-6 inline-block text-blue-600 hover:underline">← Back to Listings</a>
      </div>
    );
  }

  const l = (await res.json()) as Listing;

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

  const fmtWindow = (sIso: string, eIso: string) => {
    const s = new Date(sIso), e = new Date(eIso);
    const mm = (d: Date) => d.toLocaleString("en-US", { month: "short" });
    return s.getFullYear() === e.getFullYear()
      ? `${mm(s)}–${mm(e)} ${s.getFullYear()}`
      : `${mm(s)} ${s.getFullYear()} – ${mm(e)} ${e.getFullYear()}`;
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{l.district}</h1>
      <p className="mt-1 text-slate-600">Water Type: {l.waterType}</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><div className="text-slate-500 text-sm">Acre-Feet</div><div className="mt-1 text-lg font-medium">{fmt(l.acreFeet)}</div></div>
          <div><div className="text-slate-500 text-sm">Price per AF</div><div className="mt-1 text-lg font-medium">${fmt(l.pricePerAf)}</div></div>
          <div className="sm:col-span-2">
            <div className="text-slate-500 text-sm">Availability</div>
            <div className="mt-1 text-lg font-medium">{fmtWindow(l.availabilityStart, l.availabilityEnd)}</div>
          </div>
        </div>
      </div>

      <a href="/dashboard" className="mt-6 inline-block text-blue-600 hover:underline">← Back to Listings</a>
    </div>
  );
}
