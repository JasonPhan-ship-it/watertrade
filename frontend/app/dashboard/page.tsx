"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

/* ---------- Types ---------- */
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

type SortBy = "district" | "acreFeet" | "pricePerAf" | "availabilityStart" | "createdAt";
type SortDir = "asc" | "desc";

/* ---------- Constants ---------- */
const DISTRICTS = [
  "All Districts",
  "Westlands Water District",
  "San Luis Water District",
  "Panoche Water District",
  "Arvin Edison Water District",
] as const;

const WATER_TYPES = ["Any Water Type", "Pumping Credits", "CVP Allocation", "Supplemental Water"] as const;

const WINDOWS = ["Any Window", "Feb–Apr 2025", "Mar–May 2025", "Apr–Jun 2025", "May–Jul 2025"] as const;

const PAGE_SIZES = [5, 10, 20] as const;

/* ---------- Page ---------- */
export default function DashboardPage() {
  // filters
  const [district, setDistrict] = useState<string>(DISTRICTS[0]);
  const [waterType, setWaterType] = useState<string>(WATER_TYPES[0]);
  const [windowLabel, setWindowLabel] = useState<string>(WINDOWS[0]);

  // sort + pagination
  const [sortBy, setSortBy] = useState<SortBy>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // premium demo toggle
  const [premium, setPremium] = useState<boolean>(false);

  // data state
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // build query
  const qs = useMemo(() => {
    const u = new URLSearchParams();
    if (district !== "All Districts") u.set("district", district);
    if (waterType !== "Any Water Type") u.set("waterType", waterType);
    if (windowLabel !== "Any Window") u.set("window", windowLabel);
    u.set("sortBy", sortBy);
    u.set("sortDir", sortDir);
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    u.set("premium", String(premium));
    return u.toString();
  }, [district, waterType, windowLabel, sortBy, sortDir, page, pageSize, premium]);

  // fetch
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fetch(`/api/listings?${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<ApiResponse>;
      })
      .then((json) => live && setData(json))
      .catch((e) => live && setError(e.message || "Failed to load"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [qs]);

  // KPIs
  const stats = useMemo(() => {
    const rows = data?.listings ?? [];
    const totalAf = rows.reduce((s, l) => s + l.acreFeet, 0);
    const avg =
      rows.length > 0
        ? Math.round((rows.reduce((s, l) => s + l.pricePerAf, 0) / rows.length) * 100) / 100
        : 0;

    const nextWindow = (() => {
      if (!rows.length) return "—";
      const earliest = rows
        .slice()
        .sort((a, b) => a.availabilityStart.localeCompare(b.availabilityStart))[0];
      return formatWindow(earliest.availabilityStart, earliest.availabilityEnd);
    })();

    return {
      active: data?.total ?? 0,
      totalAf: formatNumber(totalAf),
      avgPrice: avg ? `$${formatNumber(avg)}` : "$0",
      nextWindow,
    };
  }, [data]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil((data.total ?? 0) / pageSize));
  }, [data, pageSize]);

  function onSort(col: SortBy) {
    if (col === sortBy) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero / Filters */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Brand banner color */}
        <section className="rounded-3xl bg-[#004434] p-6 text-white shadow-md">
          <div className="text-2xl font-semibold tracking-tight">Active Water Sales</div>
          <div className="mt-1 text-sm text-white/80">Westlands · San Luis · Panoche · Arvin Edison</div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select
              value={district}
              onChange={(e) => {
                setDistrict(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-xl border border-white/30 bg-white/10 px-3 text-sm text-white outline-none backdrop-blur placeholder-white/70 focus:bg-white/20 focus:ring-2 focus:ring-white/60"
            >
              {DISTRICTS.map((d) => (
                <option key={d} value={d} className="text-slate-900">
                  {d}
                </option>
              ))}
            </select>

            <select
              value={waterType}
              onChange={(e) => {
                setWaterType(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-xl border border-white/30 bg-white/10 px-3 text-sm text-white outline-none backdrop-blur placeholder-white/70 focus:bg-white/20 focus:ring-2 focus:ring-white/60"
            >
              {WATER_TYPES.map((w) => (
                <option key={w} value={w} className="text-slate-900">
                  {w}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <select
                value={windowLabel}
                onChange={(e) => {
                  setWindowLabel(e.target.value);
                  setPage(1);
                }}
                className="h-10 flex-1 rounded-xl border border-white/30 bg-white/10 px-3 text-sm text-white outline-none backdrop-blur placeholder-white/70 focus:bg-white/20 focus:ring-2 focus:ring-white/60"
              >
                {WINDOWS.map((w) => (
                  <option key={w} value={w} className="text-slate-900">
                    {w}
                  </option>
                ))}
              </select>
              <button className="h-10 shrink-0 rounded-xl bg-white/10 px-4 text-sm font-medium text-white ring-1 ring-inset ring-white/40 hover:bg-white/20">
                Apply Filters
              </button>
            </div>
          </div>
        </section>

        {/* KPIs */}
        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Stat label="Active Listings" value={String(stats.active)} />
          <Stat label="Total Acre-Feet" value={stats.totalAf} />
          <Stat label="Avg $/AF" value={stats.avgPrice} />
          <Stat label="Next Window" value={stats.nextWindow} />
        </section>

        {/* Premium card (demo toggle) */}
        <section className="mt-4">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-600">
              {premium ? (
                <>
                  <span className="font-medium text-slate-900">Premium:</span> Full details & early access unlocked.
                </>
              ) : (
                <>
                  <span className="font-medium text-slate-900">Premium:</span> You’re viewing a limited set. Upgrade to
                  see full details & early access.
                </>
              )}
            </div>
            <button
              onClick={() => setPremium((v) => !v)}
              className={`h-8 rounded-xl px-3 text-xs font-medium ${
                premium ? "bg-[#004434] text-white hover:bg-[#00392f]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {premium ? "Disable" : "Enable"} Premium (Demo)
            </button>
          </div>
        </section>

        {/* Listings table */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
            <div className="font-medium">Listings</div>
            <div className="text-xs text-slate-500">
              {premium ? "You have early access." : "Premium users see full details & early access"}
            </div>
          </div>

          {error ? (
            <div className="px-6 py-8 text-sm text-red-600">{error}</div>
          ) : loading ? (
            <div className="px-6 py-8 text-sm text-slate-500">Loading…</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <Th label="District" active={sortBy === "district"} dir={sortDir} onClick={() => onSort("district")} />
                      <Th label="Acre-Feet" align="right" active={sortBy === "acreFeet"} dir={sortDir} onClick={() => onSort("acreFeet")} />
                      <Th label="$ / AF" align="right" active={sortBy === "pricePerAf"} dir={sortDir} onClick={() => onSort("pricePerAf")} />
                      <Th label="Availability" active={sortBy === "availabilityStart"} dir={sortDir} onClick={() => onSort("availabilityStart")} />
                      <Th label="Water Type" active={false} dir={"asc"} onClick={() => {}} />
                      <Th label="Action" align="center" active={sortBy === "createdAt"} dir={sortDir} onClick={() => onSort("createdAt")} />
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.listings ?? []).map((l) => (
                      <tr key={l.id} className="border-t border-slate-100">
                        <Td>{l.district}</Td>
                        <Td align="right">{formatNumber(l.acreFeet)}</Td>
                        <Td align="right">${formatNumber(l.pricePerAf)}</Td>
                        <Td>{formatWindow(l.availabilityStart, l.availabilityEnd)}</Td>
                        <Td>
                          {/* Water type pill — lighter accent of #004434 with white text */}
                          <span className="rounded-full bg-[#0A6B58] px-3 py-1 text-xs font-medium text-white">
                            {l.waterType}
                          </span>
                        </Td>
                        <Td align="center">
                          <Link
                            href={`/listings/${l.id}`}
                            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            title="View details"
                          >
                            View Details
                          </Link>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row">
                <div className="text-xs text-slate-500">
                  Page <span className="font-medium text-slate-700">{page}</span> of{" "}
                  <span className="font-medium text-slate-700">{Math.max(1, totalPages)}</span> • {data?.total ?? 0} total
                  listings{data?.limited ? " (limited for non-premium)" : ""}
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs outline-none"
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n} / page
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="h-8 rounded-lg border border-slate-300 px-3 text-xs disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="h-8 rounded-lg border border-slate-300 px-3 text-xs disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

/* ---------- Presentational bits ---------- */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-slate-500 text-sm">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function Th({
  label,
  onClick,
  active,
  dir,
  align = "left",
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  dir: SortDir;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      onClick={onClick}
      className={`cursor-pointer select-none px-6 py-3 font-medium ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : ""
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span className="text-slate-400">{dir === "asc" ? "▲" : "▼"}</span>}
      </span>
    </th>
  );
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <td className={`px-6 py-4 ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""}`}>
      {children}
    </td>
  );
}

/* ---------- Format helpers ---------- */
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
