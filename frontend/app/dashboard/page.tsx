"use client";

import React, { useEffect, useMemo, useState } from "react";

// -----------------------------
// Types
// -----------------------------
type Listing = {
  id: string;
  district: string;
  acreFeet: number;
  pricePerAf: number;
  availabilityStart: string; // ISO date
  availabilityEnd: string;   // ISO date
  waterType: string;
  createdAt: string;         // ISO date
};

type ApiResponse = {
  listings: Listing[];
  total: number;
  limited?: boolean;   // true when user is not premium and results are truncated/redacted
};

// -----------------------------
// Helpers
// -----------------------------
const DISTRICTS = [
  "All Districts",
  "Westlands Water District",
  "San Luis Water District",
  "Panoche Water District",
  "Arvin Edison Water District",
] as const;

const WATER_TYPES = [
  "Any Water Type",
  "Pumping Credits",
  "CVP Allocation",
  "Supplemental Water",
] as const;

const WINDOWS = [
  "Any Window",
  "Feb–Apr 2025",
  "Mar–May 2025",
  "Apr–Jun 2025",
  "May–Jul 2025",
] as const;

const PAGE_SIZES = [5, 10, 20] as const;

type SortBy = "district" | "acreFeet" | "pricePerAf" | "availabilityStart" | "createdAt";
type SortDir = "asc" | "desc";

// -----------------------------
// Main Page
// -----------------------------
export default function Page() {
  // Filters
  const [district, setDistrict] = useState<string>(DISTRICTS[0]);
  const [waterType, setWaterType] = useState<string>(WATER_TYPES[0]);
  const [windowLabel, setWindowLabel] = useState<string>(WINDOWS[0]);

  // Sort + pagination
  const [sortBy, setSortBy] = useState<SortBy>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Premium (demo: local toggle)
  const [premium, setPremium] = useState<boolean>(false);

  // Data
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Build query string
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (district && district !== "All Districts") params.set("district", district);
    if (waterType && waterType !== "Any Water Type") params.set("waterType", waterType);
    if (windowLabel && windowLabel !== "Any Window") params.set("window", windowLabel);
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("premium", String(premium));
    return params.toString();
  }, [district, waterType, windowLabel, sortBy, sortDir, page, pageSize, premium]);

  // Fetch
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetch(`/api/listings?${query}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<ApiResponse>;
      })
      .then((json) => {
        if (active) setData(json);
      })
      .catch((e) => {
        if (active) setError(e.message || "Failed to load");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query]);

  // KPI stats
  const stats = useMemo(() => {
    const listings = data?.listings ?? [];
    const totalAf = listings.reduce((s, l) => s + l.acreFeet, 0);
    const avgPrice =
      listings.length > 0
        ? Math.round(
            (listings.reduce((s, l) => s + l.pricePerAf, 0) / listings.length) * 100
          ) / 100
        : 0;

    // next window: pick the earliest availabilityStart in the full set (not only current page)
    const nextWindow = (() => {
      const all = data?.listings ?? [];
      if (!all.length) return "—";
      const earliest = all
        .slice()
        .sort((a, b) => a.availabilityStart.localeCompare(b.availabilityStart))[0];
      return formatWindow(earliest.availabilityStart, earliest.availabilityEnd);
    })();

    return {
      active: data?.total ?? 0,
      totalAf: formatNumber(totalAf),
      avgPrice: avgPrice ? `$${formatNumber(avgPrice)}` : "$0",
      nextWindow,
    };
  }, [data]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil((data.total ?? 0) / pageSize));
  }, [data, pageSize]);

  function onHeaderClick(key: SortBy) {
    if (key === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Topbar */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-indigo-600" />
            <div className="text-sm font-semibold tracking-tight">Water Trades Dashboard</div>
          </div>
          <nav className="hidden gap-6 text-sm text-slate-600 sm:flex">
            <a className="hover:text-slate-900" href="#">Listings</a>
            <a className="hover:text-slate-900" href="#">Analytics</a>
            <a className="hover:text-slate-900" href="#">Premium</a>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Hero */}
        <section className="rounded-3xl bg-gradient-to-r from-indigo-600 to-blue-500 p-6 text-white shadow-md">
          <div className="text-2xl font-semibold tracking-tight">Active Water Sales</div>
          <div className="mt-1 text-sm text-indigo-100">
            Westlands · San Luis · Panoche · Arvin Edison
          </div>

          {/* Filters */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select
              value={district}
              onChange={(e) => {
                setDistrict(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-xl border border-white/30 bg-white/10 px-3 text-sm outline-none backdrop-blur placeholder:text-white/70 focus:bg-white/20 focus:ring-2 focus:ring-white/60"
            >
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>
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
              className="h-10 rounded-xl border border-white/30 bg-white/10 px-3 text-sm outline-none backdrop-blur placeholder:text-white/70 focus:bg-white/20 focus:ring-2 focus:ring-white/60"
            >
              {WATER_TYPES.map((w) => (
                <option key={w} value={w}>
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
                className="h-10 flex-1 rounded-xl border border-white/30 bg-white/10 px-3 text-sm outline-none backdrop-blur focus:bg-white/20 focus:ring-2 focus:ring-white/60"
              >
                {WINDOWS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>

              <button
                onClick={() => {
                  // noop: controlled selects already filter; this button is just for the mock
                }}
                className="h-10 shrink-0 rounded-xl bg-white/10 px-4 text-sm font-medium text-white ring-1 ring-inset ring-white/40 hover:bg-white/20"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Stat label="Active Listings" value={String(stats.active)} />
          <Stat label="Total Acre-Feet" value={stats.totalAf} />
          <Stat label="Avg $/AF" value={stats.avgPrice} />
          <Stat label="Next Window" value={stats.nextWindow} />
        </section>

        {/* Premium toggle (demo) */}
        <section className="mt-4">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-600">
              {premium ? (
                <>
                  <span className="font-medium text-slate-900">Premium:</span> Full
                  details & early access unlocked.
                </>
              ) : (
                <>
                  <span className="font-medium text-slate-900">Premium:</span> You’re
                  viewing a limited set. Upgrade to see full details & early access.
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">{premium ? "On" : "Off"}</span>
              <button
                onClick={() => setPremium((v) => !v)}
                className={`h-8 rounded-xl px-3 text-xs font-medium ${
                  premium
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {premium ? "Disable" : "Enable"} Premium (Demo)
              </button>
            </div>
          </div>
        </section>

        {/* Table */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
            <div className="font-medium">Listings</div>
            <div className="text-xs text-slate-500">
              {premium ? "You have early access." : "Premium users see full details & early access"}
            </div>
          </div>

          {error && (
            <div className="px-6 py-8 text-sm text-red-600">{error}</div>
          )}

          {loading ? (
            <div className="px-6 py-8 text-sm text-slate-500">Loading…</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <Th
                        label="District"
                        active={sortBy === "district"}
                        dir={sortDir}
                        onClick={() => onHeaderClick("district")}
                      />
                      <Th
                        label="Acre-Feet"
                        active={sortBy === "acreFeet"}
                        dir={sortDir}
                        onClick={() => onHeaderClick("acreFeet")}
                        align="right"
                      />
                      <Th
                        label="$ / AF"
                        active={sortBy === "pricePerAf"}
                        dir={sortDir}
                        onClick={() => onHeaderClick("pricePerAf")}
                        align="right"
                      />
                      <Th
                        label="Availability"
                        active={sortBy === "availabilityStart"}
                        dir={sortDir}
                        onClick={() => onHeaderClick("availabilityStart")}
                      />
                      <Th label="Water Type" active={false} dir="asc" onClick={() => {}} />
                      <Th
                        label="Action"
                        active={sortBy === "createdAt"}
                        dir={sortDir}
                        onClick={() => onHeaderClick("createdAt")}
                        align="center"
                      />
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
                          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                            {l.waterType}
                          </span>
                        </Td>
                        <Td align="center">
                          <button className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                            View Details
                          </button>
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
                  <span className="font-medium text-slate-700">{totalPages}</span> •{" "}
                  {data?.total ?? 0} total listings
                  {data?.limited ? " (limited for non-premium)" : ""}
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

// -----------------------------
// Presentational bits
// -----------------------------
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

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <td
      className={`px-6 py-4 ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : ""
      }`}
    >
      {children}
    </td>
  );
}

// -----------------------------
// Formatting helpers
// -----------------------------
function formatNumber(n: number | string) {
  const num = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(num);
}

function formatWindow(startIso: string, endIso: string) {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const f = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short" }) + " " + d.getFullYear();
  // “Apr–Jun 2025”
  const sameYear = s.getFullYear() === e.getFullYear();
  const label = sameYear
    ? `${s.toLocaleString("en-US", { month: "short" })}–${e.toLocaleString(
        "en-US",
        { month: "short" }
      )} ${s.getFullYear()}`
    : `${f(s)} – ${f(e)}`;
  return label;
}
