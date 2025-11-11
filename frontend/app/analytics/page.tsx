// app/analytics/page.tsx
"use client";

import React, { useEffect, useState } from "react";

/** ---------- Types ---------- */
type AListing = {
  id: string;
  district: string;
  acreFeet: number;
  pricePerAf: number;
  availabilityStart: string; // ISO
  availabilityEnd: string;   // ISO
  waterType: string;
  createdAt: string;         // ISO
};

type ApiResponseAnalytics = {
  listings: AListing[];
  total: number;
  limited?: boolean;
};

/** ---------- Page ---------- */
export default function AnalyticsPage() {
  // beacon
  if (typeof window !== "undefined") console.debug("[Render] /analytics AnalyticsPage");

  const [data, setData] = useState<ApiResponseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Pull the full (non-gated) set from your API for analysis
  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch("/api/listings?premium=true&page=1&pageSize=1000&sortBy=createdAt&sortDir=desc")
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<ApiResponseAnalytics>;
      })
      .then((json) => live && setData(json))
      .catch((e) => live && setErr(e.message || "Failed to load"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const rows = data?.listings ?? [];
  const safeRows = Array.isArray(rows) ? rows : [];

  /** ---------- Aggregations ---------- */
  const totalAF = safeRows.reduce((sum, row) => sum + row.acreFeet, 0);
  const avgPrice = safeRows.length
    ? safeRows.reduce((sum, row) => sum + row.pricePerAf, 0) / safeRows.length
    : 0;
  const medianPrice = (() => {
    if (!safeRows.length) return 0;
    const prices = safeRows.map((row) => row.pricePerAf).sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    return prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
  })();

  const byDistrict = (() => {
    const map = new Map<string, { af: number; count: number; prices: number[] }>();
    for (const row of safeRows) {
      const current = map.get(row.district) || { af: 0, count: 0, prices: [] };
      current.af += row.acreFeet;
      current.count += 1;
      current.prices.push(row.pricePerAf);
      map.set(row.district, current);
    }
    return Array.from(map, ([district, value]) => ({
      district,
      af: value.af,
      count: value.count,
      avg: value.prices.reduce((sum, price) => sum + price, 0) / value.prices.length,
    })).sort((a, b) => b.af - a.af);
  })();

  const byWaterType = (() => {
    const map = new Map<string, { af: number; count: number; prices: number[] }>();
    for (const row of safeRows) {
      const current = map.get(row.waterType) || { af: 0, count: 0, prices: [] };
      current.af += row.acreFeet;
      current.count += 1;
      current.prices.push(row.pricePerAf);
      map.set(row.waterType, current);
    }
    return Array.from(map, ([waterType, value]) => ({
      waterType,
      af: value.af,
      count: value.count,
      avg: value.prices.reduce((sum, price) => sum + price, 0) / value.prices.length,
    })).sort((a, b) => b.af - a.af);
  })();

  // Monthly availability counts (based on availabilityStart month)
  const monthly = (() => {
    if (!safeRows.length) return [] as { label: string; key: string; count: number }[];
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const years = Array.from(
      new Set(safeRows.map((row) => new Date(row.availabilityStart).getFullYear())),
    ).sort();
    const months: { label: string; key: string; count: number }[] = [];
    for (const year of years) {
      for (let month = 0; month < 12; month++) {
        months.push({ label: `${monthNames[month]} ${year}`, key: `${year}-${month}`, count: 0 });
      }
    }
    for (const row of safeRows) {
      const date = new Date(row.availabilityStart);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const bucket = months.find((entry) => entry.key === key);
      if (bucket) bucket.count += 1;
    }
    const first = months.findIndex((entry) => entry.count > 0);
    if (first === -1) return [];
    const last = months.length - 1 - [...months].reverse().findIndex((entry) => entry.count > 0);
    return months.slice(first, last + 1);
  })();

  // For inline bar widths
  const maxAF = Math.max(1, ...byDistrict.map((d) => d.af));
  const maxAFType = Math.max(1, ...byWaterType.map((d) => d.af));
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.count));

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Analytics</h1>
        <p className="mt-1 text-sm text-slate-600">
          Rollups across current listings. Upgrade business rules later to include historical trades.
        </p>

        {/* KPIs */}
        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Kpi label="Total Listings" value={formatNumber(safeRows.length)} />
          <Kpi label="Total Acre-Feet" value={formatNumber(totalAF)} />
          <Kpi label="Avg $/AF" value={`$${formatNumber(avgPrice)}`} />
          <Kpi label="Median $/AF" value={`$${formatNumber(medianPrice)}`} />
        </section>

        {/* By District */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Volume by District</h2>
            <span className="text-xs text-slate-500">Inline bars represent relative AF</span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">District</th>
                  <th className="px-4 py-3 text-right font-medium">Acre-Feet</th>
                  <th className="px-4 py-3 text-right font-medium">Avg $/AF</th>
                  <th className="px-4 py-3 font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {byDistrict.map((d) => (
                  <tr key={d.district} className="border-t border-slate-100">
                    <td className="px-4 py-3">{d.district}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(d.af)}</td>
                    <td className="px-4 py-3 text-right">${formatNumber(d.avg)}</td>
                    <td className="px-4 py-3">
                      <div className="h-2.5 w-full rounded-full bg-slate-100">
                        <div
                          className="h-2.5 rounded-full bg-indigo-500"
                          style={{ width: `${(d.af / maxAF) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {!byDistrict.length && (
                  <tr>
                    <td className="px-4 py-3 text-sm text-slate-500" colSpan={4}>
                      No data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* By Water Type */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold">Volume by Water Type</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Water Type</th>
                  <th className="px-4 py-3 text-right font-medium">Acre-Feet</th>
                  <th className="px-4 py-3 text-right font-medium">Avg $/AF</th>
                  <th className="px-4 py-3 font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {byWaterType.map((d) => (
                  <tr key={d.waterType} className="border-t border-slate-100">
                    <td className="px-4 py-3">{d.waterType}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(d.af)}</td>
                    <td className="px-4 py-3 text-right">${formatNumber(d.avg)}</td>
                    <td className="px-4 py-3">
                      <div className="h-2.5 w-full rounded-full bg-slate-100">
                        <div
                          className="h-2.5 rounded-full bg-blue-500"
                          style={{ width: `${(d.af / maxAFType) * 100}%` }}  // ✅ fixed
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {!byWaterType.length && (
                  <tr>
                    <td className="px-4 py-3 text-sm text-slate-500" colSpan={4}>
                      No data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Monthly Availability */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold">Monthly Availability (by start month)</h2>
          {monthly.length ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {monthly.map((m) => (
                <div key={m.key} className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">{m.label}</div>
                  <div className="mt-2 h-20 rounded bg-slate-100">
                    <div
                      className="h-full rounded bg-indigo-500"
                      style={{ height: `${(m.count / maxMonthly) * 100}%`, width: "100%" }}
                    />
                  </div>
                  <div className="mt-1 text-sm font-medium">{m.count}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No availability data.</p>
          )}
        </section>

        {err && <p className="mt-6 text-sm text-red-600">{err}</p>}
        {loading && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
      </main>
    </div>
  );
}

/** ---------- Helpers ---------- */
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-slate-500 text-sm">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
