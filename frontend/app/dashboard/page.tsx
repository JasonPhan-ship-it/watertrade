// frontend/app/dashboard/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

/**
 * Lightweight gate that keeps the dashboard in a "Loading…" state
 * until the user's onboarding state is confirmed (Clerk metadata
 * or /api/onboarding/init). This mirrors middleware so there’s no
 * client-side redirect ping-pong; it just avoids flicker.
 */
import { useAuth, useUser } from "@clerk/nextjs";

function useOnboardedGate() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authLoaded || !userLoaded) return;

      if (!isSignedIn) {
        // Middleware will handle redirect to /sign-in. Just stay in "checking".
        return;
      }

      // If Clerk already says onboarded, done.
      if (user?.publicMetadata?.onboarded === true) {
        if (active) setChecking(false);
        return;
      }

      // Ask server (also sets a short-lived cookie)
      try {
        const r = await fetch("/api/onboarding/init", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (r.ok) {
          const j = await r.json();
          if (active && j?.onboarded === true) {
            setChecking(false);
            return;
          }
        }
      } catch {
        // ignore network error; middleware is ultimate gate anyway
      }

      // If not onboarded, middleware will redirect away from this page.
      // Keep showing "checking" so we don't flash the dashboard.
    })();

    return () => {
      active = false;
    };
  }, [authLoaded, userLoaded, isSignedIn, user?.publicMetadata?.onboarded]);

  return checking;
}

/* ---------- Types ---------- */
type Listing = {
  id: string;
  district: string;
  acreFeet: number;
  pricePerAf: number;
  availabilityStart: string; // ISO (kept in type but unused)
  availabilityEnd: string;   // ISO (kept in type but unused)
  waterType: string;
  createdAt: string;         // ISO
};

type ApiResponse = {
  listings: Listing[];
  total: number;
  limited?: boolean;
};

type SortBy = "district" | "acreFeet" | "pricePerAf" | "createdAt";
type SortDir = "asc" | "desc";

/* ---------- Constants ---------- */
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

const PAGE_SIZES = [5, 10, 20] as const;

/* ---------- Page ---------- */
export default function DashboardPage() {
  // Keep the page hidden until onboarding state is confirmed
  const checking = useOnboardedGate();

  // filters
  const [district, setDistrict] = useState<string>(DISTRICTS[0]);
  const [waterType, setWaterType] = useState<string>(WATER_TYPES[0]);

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

  // build query (no window param)
  const qs = useMemo(() => {
    const u = new URLSearchParams();
    if (district !== "All Districts") u.set("district", district);
    if (waterType !== "Any Water Type") u.set("waterType", waterType);
    u.set("sortBy", sortBy);
    u.set("sortDir", sortDir);
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    u.set("premium", String(premium));
    return u.toString();
  }, [district, waterType, sortBy, sortDir, page, pageSize, premium]);

  // fetch
  useEffect(() => {
    if (checking) return; // don't fetch until we're cleared to render
    let live = true;
    setLoading(true);
    setError(null);

    fetch(`/api/listings?${qs}`, { method: "GET", cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status} ${r.statusText}${text ? " - " + text.slice(0, 180) : ""}`);
        }
        return r.json() as Promise<ApiResponse>;
      })
      .then((json) => live && setData(json))
      .catch((e) => live && setError(e.message || "Failed to load"))
      .finally(() => live && setLoading(false));

    return () => {
      live = false;
    };
  }, [qs, checking]);

  // KPIs
  const stats = useMemo(() => {
    const rows = data?.listings ?? [];
    const totalAf = rows.reduce((s, l) => s + l.acreFeet, 0);
    const avg =
      rows.length > 0
        ? Math.round((rows.reduce((s, l) => s + l.pricePerAf, 0) / rows.length) * 100) / 100
        : 0;

    return {
      active: data?.total ?? 0,
      totalAf: formatNumber(totalAf),
      avgPrice: avg ? `$${formatNumber(avg)}` : "$0",
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

  if (checking) {
    // This prevents any UI flash while middleware determines routing.
    return <div className="min-h-screen bg-slate-50"><main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">Loading…</main></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero / Filters */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <section className="rounded-3xl bg-[#004434] p-6 text-white shadow-md">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-2xl font-semibold tracking-tight">Active Water Sales</div>
              <div className="mt-1 text-sm text-white/80">
                Westlands · San Luis · Panoche · Arvin Edison
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          </div>
        </section>

        {/* KPIs */}
        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Active Listings" value={String(stats.active)} />
          <Stat label="Total Acre-Feet" value={stats.totalAf} />
          <Stat label="Avg $/AF" value={stats.avgPrice} />
        </section>

        {/* Premium card (demo toggle) */}
        <section className="mt-4">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-600">
              {premium ? (
                <>
                  <span className="font-medium text-slate-900">Premium:</span> Full details & early
                  access unlocked.
                </>
              ) : (
                <>
                  <span className="font-medium text-slate-900">Premium:</span> You’re viewing a
                  limited set. Upgrade to see full details & early access.
                </>
              )}
            </div>
            <button
              onClick={() => {
                setPremium((v) => !v);
                setPage(1);
              }}
              className={`h-8 rounded-xl px-3 text-xs font-medium ${
                premium
                  ? "bg-[#004434] text-white hover:bg-[#00392f]"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {premium ? "Disable" : "Enable"} Premium (Demo)
            </button>
          </div>
        </section>

        {/* Listings table */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200
