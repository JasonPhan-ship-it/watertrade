"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/** ---- Types shared with the API shape ---- */
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

type ApiResponse = {
  listings: Listing[];
  total: number;
  limited?: boolean;
};

export default function HomePage() {
  // Preview data
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch a tiny, public preview (no auth; premium=false; first 3 rows)
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/listings?premium=false&page=1&pageSize=3&sortBy=createdAt&sortDir=desc")
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<ApiResponse>;
      })
      .then((json) => active && setData(json))
      .catch((e) => active && setError(e.message || "Failed to load"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // Simple preview stats
  const stats = useMemo(() => {
    const rows = data?.listings ?? [];
    const totalAf = rows.reduce((s, l) => s + l.acreFeet, 0);
    const avg =
      rows.length > 0
        ? Math.round((rows.reduce((s, l) => s + l.pricePerAf, 0) / rows.length) * 100) /
          100
        : 0;
    return {
      count: data?.total ?? 0,
      af: formatNumber(totalAf),
      avg: avg ? `$${formatNumber(avg)}` : "$0",
    };
  }, [data]);

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Trade water with confidence.
            </h1>
            <p className="mt-3 text-slate-600">
              A marketplace built for growers and districts. Discover live listings,
              compare prices by district, and complete transfers with a clear, auditable
              workflow.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {/* Primary CTA updated */}
              <Link
                href="/sign-up"
                className="inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-medium text-white bg-[#004434] hover:bg-[#00392f] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#004434]"
              >
                Create Account
              </Link>

              <Link
                href="/create-listing"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 px-5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                List Water
              </Link>
            </div>
          </div>

          {/* Live preview card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between px-2 pt-1">
              <div className="text-sm font-medium text-slate-900">Dashboard Preview</div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                Read-only
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Kpi label="Listings (sample)" value={String(stats.count)} />
              <Kpi label="Acre-Feet (sample)" value={stats.af} />
              <Kpi label="Avg $/AF (sample)" value={stats.avg} />
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
              {error ? (
                <div className="px-4 py-6 text-sm text-red-600">{error}</div>
              ) : loading ? (
                <div className="px-4 py-6 text-sm text-slate-500">Loading…</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 font-medium">District</th>
                        <th className="px-4 py-3 text-right font-medium">Acre-Feet</th>
                        <th className="px-4 py-3 text-right font-medium">$ / AF</th>
                        <th className="px-4 py-3 font-medium">Availability</th>
                        <th className="px-4 py-3 font-medium">Water Type</th>
                        <th className="px-4 py-3 text-center font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.listings ?? []).map((l) => (
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="px-4 py-3">{l.district}</td>
                          <td className="px-4 py-3 text-right">
                            {formatNumber(l.acreFeet)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            ${formatNumber(l.pricePerAf)}
                          </td>
                          <td className="px-4 py-3">
                            {formatWindow(l.availabilityStart, l.availabilityEnd)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                              {l.waterType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Link
                              href={`/listings/${l.id}`}
                              className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                              title="View details"
                            >
                              View Details
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="mt-3 text-center text-xs text-slate-500">
              Preview shows a small subset. Sign in to see full listings & analytics.
            </p>
          </div>
        </div>
      </section>

      {/* Feature blurbs */}
      <section className="border-t bg-slate-50 py-12">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 sm:grid-cols-3 sm:px-6">
          {["Transparent Pricing", "District-Aware Transfers", "Premium Analytics"].map(
            (h, i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="text-sm font-semibold">{h}</div>
                <p className="mt-2 text-sm text-slate-600">
                  {i === 0 && "See current $/AF by district and water type."}
                  {i === 1 && "Workflows tailored to each district’s window and forms."}
                  {i === 2 && "Early-access listings plus pricing trends and alerts."}
                </p>
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}

/** ---------- Little presentational helpers ---------- */
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-slate-500 text-xs">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight">{value}</div>
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

import Footer from "@/components/Footer"; // add this at the top

// ...existing page code...

export default function HomePage() {
  // existing logic...

  return (
    <div className="min-h-screen bg-white">
      {/* existing sections ... */}

      {/* Footer */}
      <Footer />
    </div>
  );
}
