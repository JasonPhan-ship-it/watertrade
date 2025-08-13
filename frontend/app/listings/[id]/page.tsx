// app/listings/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const revalidate = 0; // always fresh

export default async function ListingDetailPage({ params }: { params: { id: string } }) {
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
      kind: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!row) return notFound();

  const pricePerAf = row.pricePerAF / 100;
  const startIso = row.availabilityStart.toISOString();
  const endIso = row.availabilityEnd.toISOString();

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{row.title}</h1>
        <span className="rounded-full bg-[#0A6B58] px-3 py-1 text-xs font-medium text-white">
          {row.kind === "BUY" ? "Buy" : "Sell"}
        </span>
      </div>

      <p className="mt-2 text-sm text-slate-600">{row.description || "No description provided."}</p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Detail label="District" value={row.district} />
        <Detail label="Water Type" value={row.waterType} />
        <Detail label="Acre-Feet" value={formatNumber(row.acreFeet)} />
        <Detail label="Price / AF" value={`$${formatNumber(pricePerAf)}`} />
        <Detail label="Availability" value={formatWindow(startIso, endIso)} />
        <Detail label="Status" value={row.status} />
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
