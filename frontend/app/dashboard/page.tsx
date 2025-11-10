// app/dashboard/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

/* ---------------- Onboarding Gate (client-only, stable hooks) ---------------- */
function useOnboardedGate() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const dashboardTimeout = setTimeout(() => setChecking(false), 5000);

    const check = async () => {
      if (!authLoaded || !userLoaded) return;

      if (!isSignedIn) {
        router.push("/sign-in");
        return;
      }

      const clerkOnboarded = user?.publicMetadata?.onboarded === true;
      if (clerkOnboarded) {
        clearTimeout(dashboardTimeout);
        setChecking(false);
        return;
      }

      try {
        const controller = new AbortController();
        const apiTimeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch("/api/onboarding/init", {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(apiTimeout);

        if (res.ok) {
          const json = await res.json();
          if (json?.onboarded) {
            clearTimeout(dashboardTimeout);
            setChecking(false);
            return;
          }
        }

        router.push("/onboarding?next=/dashboard");
      } catch {
        if (!clerkOnboarded) {
          router.push("/onboarding?next=/dashboard");
        } else {
          clearTimeout(dashboardTimeout);
          setChecking(false);
        }
      }
    };

    check();
    return () => clearTimeout(dashboardTimeout);
  }, [authLoaded, userLoaded, isSignedIn, user?.publicMetadata?.onboarded, router]);

  return checking;
}

/* ---------------- Types ---------------- */
type Listing = {
  id: string;
  district: string;
  acreFeet: number;
  pricePerAf: number;
  availabilityEnd?: string | null;
  waterType: string;
  createdAt: string;

  ownerUserId?: string | null;
  ownerName?: string | null;
  status?: string;
  kind?: "SELL" | "BUY";
  availableAf?: number;
  inEscrowAf?: number;
};

type ApiResponse = {
  listings: Listing[];
  total: number;
  limited?: boolean;
  viewerRole?: "ADMIN" | "USER" | null;
};

type SortBy = "district" | "acreFeet" | "pricePerAf" | "createdAt";
type SortDir = "asc" | "desc";
type Scope = "market" | "mine" | "trades";

type TradeRow = {
  id: string;
  tradeId: string;
  transactionId?: string | null;
  listingId: string;
  listingTitle: string;
  district: string;
  waterType?: string | null;
  volumeAf: number;
  pricePerAf: number;
  status: string;
  updatedAt: string;
  viewerRole: "buyer" | "seller" | "unknown";
  counterpartName?: string | null;
  transactionStatus?: string | null;
  type?: string | null;
};

type TradesApiResponse = {
  trades: TradeRow[];
  total: number;
  viewerRole?: "ADMIN" | "USER" | null;
};

/* ---------------- Constants ---------------- */
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

/* ---------------- Page ---------------- */
export default function DashboardPage() {
  const checking = useOnboardedGate();
  const { user } = useUser();
  const router = useRouter();

  // URL-controlled UI state
  const [scope, setScope] = useState<Scope>("market");
  const [nocreate, setNoCreate] = useState<boolean>(false);
  const [initializedFromUrl, setInitializedFromUrl] = useState<boolean>(false);

  // Other UI state
  const [district, setDistrict] = useState<string>(DISTRICTS[0]);
  const [waterType, setWaterType] = useState<string>(WATER_TYPES[0]);
  const [sortBy, setSortBy] = useState<SortBy>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [premium] = useState<boolean>(false);
  const [data, setData] = useState<ApiResponse | TradesApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize from current URL on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const scopeParam = params.get("scope");
    const tabParam = params.get("tab");
    const nocreateParam = params.get("nocreate") === "1";
    const path = window.location.pathname;
    const isListingsPath = path.startsWith("/dashboard/listings");

    // scope: prefer explicit "scope", fallback to legacy "tab=listings" or listings path
    let initialScope: Scope = "market";
    if (scopeParam === "mine" || tabParam === "listings" || isListingsPath) {
      initialScope = "mine";
    } else if (scopeParam === "trades" || tabParam === "trades") {
      initialScope = "trades";
    } else if (scopeParam === "market") {
      initialScope = "market";
    }

    setScope(initialScope);
    setNoCreate(nocreateParam);
    setInitializedFromUrl(true);
  }, []);

  // Keep scope + nocreate reflected in the URL for deep-linking (Cancel button, etc.)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!initializedFromUrl) return;
    const params = new URLSearchParams(window.location.search);
    params.set("scope", scope);
    if (nocreate) params.set("nocreate", "1");
    else params.delete("nocreate");

    const path = scope === "mine" ? "/dashboard/listings" : "/dashboard";
    const queryString = params.toString();
    const target = queryString ? `${path}?${queryString}` : path;
    const current = `${window.location.pathname}${window.location.search}`;

    if (current !== target) {
      router.replace(target, { scroll: false });
    }
  }, [scope, nocreate, router, initializedFromUrl]);

  const listingQuery = useMemo(() => {
    const u = new URLSearchParams();
    if (district !== "All Districts") u.set("district", district);
    if (waterType !== "Any Water Type") u.set("waterType", waterType);

    u.set("sortBy", sortBy);
    u.set("sortDir", sortDir);
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    u.set("premium", String(premium));

    const listingScope = scope === "mine" ? "mine" : "market";
    u.set("scope", listingScope);
    if (listingScope === "mine") u.set("mine", "1");
    else u.set("excludeMine", "1");

    return u.toString();
  }, [district, waterType, sortBy, sortDir, page, pageSize, premium, scope]);

    const tradesQuery = useMemo(() => {
    const u = new URLSearchParams();
    u.set("scope", "trades");
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    return u.toString();
  }, [page, pageSize]);

  useEffect(() => {
    if (checking) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const endpoint = scope === "trades" ? "/api/dashboard/trades" : "/api/listings";
    const query = scope === "trades" ? tradesQuery : listingQuery;
    const url = query ? `${endpoint}?${query}` : endpoint;

    fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status} ${r.statusText}${text ? " - " + text.slice(0, 180) : ""}`);
        }
        return r.json() as Promise<ApiResponse | TradesApiResponse>;
      })
      .then((json) => setData(json))
      .catch((e: any) => {
        if (e?.name !== "AbortError") setError(e?.message || "Failed to load");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [listingQuery, tradesQuery, checking, scope]);

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-50">
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#004434] mx-auto mb-4" />
              <p className="text-slate-600">Loading dashboard...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const listingRows = isListingsResponse(data) ? data.listings : [];
  const tradeRows = isTradesResponse(data) ? data.trades : [];
  const totalCount = data?.total ?? 0;
  const totalAf =
    scope === "trades"
      ? tradeRows.reduce((s, t) => s + (t.volumeAf ?? 0), 0)
      : listingRows.reduce(
          (s, l) => s + (scope === "market" ? l.availableAf ?? l.acreFeet : l.acreFeet),
          0
        );
  const avgPriceRaw =
    scope === "trades"
      ? tradeRows.length > 0
        ? tradeRows.reduce((s, t) => s + (t.pricePerAf ?? 0), 0) / tradeRows.length
        : 0
      : listingRows.length > 0
        ? listingRows.reduce((s, l) => s + l.pricePerAf, 0) / listingRows.length
        : 0;
  const tradeAwaiting =
    scope === "trades" ? tradeRows.filter((t) => tradeNeedsAction(t)).length : 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  function onSort(col: SortBy) {
    if (col === sortBy) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  }

  const handleScopeChange = (next: Scope) => {
    setScope(next);
  };

  const pageTitle =
    scope === "market"
      ? "Active Water Sales"
      : scope === "mine"
        ? "Your Listings"
        : "Your Trades";
  const subtitle =
    scope === "market"
      ? "Westlands · San Luis · Panoche · Arvin Edison"
      : scope === "mine"
        ? `Signed in as ${user?.primaryEmailAddress?.emailAddress ?? user?.username ?? "you"}`
        : "Track offers and purchases you’re part of.";

  const viewerRole = data?.viewerRole ?? null;
  const isAdmin = viewerRole === "ADMIN";
  
  const stats =
    scope === "trades"
      ? [
          { label: "Your Trades", value: String(totalCount) },
          { label: "Awaiting Your Action", value: String(tradeAwaiting) },
          { label: "Total Acre-Feet", value: formatInt(totalAf) },
        ]
      : [
          { label: scope === "market" ? "Active Listings" : "Your Listings", value: String(totalCount) },
          { label: "Total Acre-Feet", value: formatInt(totalAf) },
          { label: "Avg $/AF", value: avgPriceRaw ? formatCurrency(avgPriceRaw) : "$0.00" },
        ];
  const tableTitle =
    scope === "market" ? "Listings" : scope === "mine" ? "Your Listings" : "Your Trades";
  const totalLabel =
    scope === "market" ? "listings" : scope === "mine" ? "your listings" : "trades";
  
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Tabs */}
        <div className="mb-4 flex items-center gap-2">
          <TabButton
            active={scope === "market"}
            onClick={() => {
              handleScopeChange("market");
              setPage(1);
            }}
          >
            Marketplace
          </TabButton>
          <TabButton
            active={scope === "mine"}
            onClick={() => {
              handleScopeChange("mine");
              setPage(1);
            }}
          >
            Your Listings
          </TabButton>
          <TabButton
            active={scope === "trades"}
            onClick={() => {
              handleScopeChange("trades");
              setPage(1);
            }}
          >
            Trades
          </TabButton>
          {isAdmin && (
            <TabButton
              active={false}
              onClick={() => {
                router.push("/admin");
              }}
            >
              Admin Panel
            </TabButton>
          )}
        </div>

        {/* Filters (header) */}
        <section className="rounded-3xl bg-[#004434] p-6 text-white shadow-md">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-2xl font-semibold tracking-tight">{pageTitle}</div>
              <div className="mt-1 text-sm text-white/80">{subtitle}</div>
            </div>
          </div>

          {scope === "trades" ? (
            <div className="mt-5 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white/80 sm:px-6">
              Your offers, counters, and purchases show here. Select a trade below to open the full transaction workspace.
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <select
                value={district}
                onChange={(e) => {
                  setDistrict(e.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-xl border border-white/30 bg-white/10 px-3 text-sm text-white outline-none backdrop-blur focus:bg-white/20 focus:ring-2 focus:ring-white/60"
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
                className="h-10 rounded-xl border border-white/30 bg-white/10 px-3 text-sm text-white outline-none backdrop-blur focus:bg-white/20 focus:ring-2 focus:ring-white/60"
              >
                {WATER_TYPES.map((w) => (
                  <option key={w} value={w} className="text-slate-900">
                    {w}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        {/* KPIs */}
        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <Stat key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </section>

        {/* Listings */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
            <div className="font-medium">{tableTitle}</div>
            <div className="flex items-center gap-3">
              {scope !== "trades" && !nocreate && (
                <Link
                  href="/create-listing"
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-[#004434] px-4 text-sm font-semibold text-white hover:bg-[#00392f]"
                >
                  Create Listing
                </Link>
              )}
            </div>
          </div>

          {error ? (
            <div className="px-6 py-8 text-sm text-red-600">{error}</div>
          ) : loading ? (
            <div className="px-6 py-8 text-sm text-slate-500">Loading…</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                {scope === "trades" ? (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-6 py-3 font-medium">Listing</th>
                        <th className="px-6 py-3 text-right font-medium">Acre-Feet</th>
                        <th className="px-6 py-3 text-right font-medium">$ / AF</th>
                        <th className="px-6 py-3 font-medium">Status</th>
                        <th className="px-6 py-3 font-medium">Updated</th>
                        <th className="px-6 py-3 text-center font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tradeRows.map((t) => (
                        <tr key={`${t.tradeId}-${t.transactionId ?? "trade"}`} className="border-t border-slate-100">
                          <Td>
                            <div className="font-medium text-slate-900">{t.listingTitle}</div>
                            {t.type && (
                              <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                                {formatTradeType(t.type)}
                              </div>
                            )}
                          </Td>
                          <Td align="right">{formatInt(t.volumeAf)}</Td>
                          <Td align="right">{formatCurrency(t.pricePerAf)}</Td>
                          <Td>
                            <TradeStatusBadge status={t.status} highlight={tradeNeedsAction(t)} viewerRole={t.viewerRole} />
                          </Td>
                          <Td>
                            <div className="text-sm text-slate-700">{t.updatedAt ? formatDateTime(t.updatedAt) : "—"}</div>
                          </Td>
                          <Td align="center">
                            <Link
                              href={`/transactions/${t.transactionId ?? t.tradeId}`}
                              className="inline-flex items-center gap-1.5 rounded-full bg-[#004434] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00392f]"
                            >
                              View trade
                              <span aria-hidden="true">→</span>
                            </Link>
                          </Td>
                        </tr>
                      ))}
                      {tradeRows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-10 text-center text-slate-600">
                            <div className="mx-auto max-w-md">
                              <div className="text-sm">You don’t have any trades yet.</div>
                              <div className="mt-4">
                                <Link
                                  href="/dashboard"
                                  className="inline-flex h-9 items-center justify-center rounded-xl bg-[#004434] px-4 text-sm font-semibold text-white hover:bg-[#00392f]"
                                >
                                  Browse Marketplace
                                </Link>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <Th
                          label="District"
                          active={sortBy === "district"}
                          dir={sortDir}
                          onClick={() => onSort("district")}
                        />
                        <Th
                          label="Acre-Feet"
                          align="right"
                          active={sortBy === "acreFeet"}
                          dir={sortDir}
                          onClick={() => onSort("acreFeet")}
                        />
                        <Th
                          label="$ / AF"
                          align="right"
                          active={sortBy === "pricePerAf"}
                          dir={sortDir}
                          onClick={() => onSort("pricePerAf")}
                        />
                        <Th label="Water Type" active={false} dir={"asc"} onClick={() => {}} />
                        <Th
                          label={scope === "market" ? "Action" : "Manage"}
                          align="center"
                          active={sortBy === "createdAt"}
                          dir={sortDir}
                          onClick={() => onSort("createdAt")}
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {listingRows.map((l) => (
                        <tr key={l.id} className="border-t border-slate-100">
                          <Td>{l.district}</Td>
                          <Td align="right">{formatInt(l.acreFeet)}</Td>
                          <Td align="right">
                            {formatInt(l.acreFeet)}
                            {l.inEscrowAf && l.inEscrowAf > 0 ? (
                              <div className="mt-1 text-[11px] text-amber-700">
                                {formatInt(l.availableAf ?? Math.max(l.acreFeet - l.inEscrowAf, 0))} AF available · {formatInt(l.inEscrowAf)} AF in escrow
                              </div>
                            ) : null}
                          </Td>                          <Td>
                            <span className="rounded-full bg-[#0A6B58] px-3 py-1 text-xs font-medium text-white">
                              {l.waterType}
                            </span>
                          </Td>
                          <Td align="center">
                            {scope === "market" ? (
                              <Link
                                href={`/listings/${l.id}`}
                                className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                View Details
                              </Link>
                            ) : (
                              <div className="inline-flex gap-2">
                                <Link
                                  href={`/listings/${l.id}`}
                                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  View
                                </Link>
                                <Link
                                  href={`/listings/${l.id}/edit`}
                                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  Edit
                                </Link>
                              </div>
                            )}
                          </Td>
                        </tr>
                      ))}
                      {listingRows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-slate-600">
                            <div className="mx-auto max-w-md">
                              <div className="text-sm">
                                {scope === "market"
                                  ? "No listings match your filters."
                                  : "You don’t have any listings yet."}
                              </div>
                              <div className="mt-4">
                                <Link
                                  href="/create-listing"
                                  className="inline-flex h-9 items-center justify-center rounded-xl bg-[#004434] px-4 text-sm font-semibold text-white hover:bg-[#00392f]"
                                >
                                  Create Listing
                                </Link>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination */}
              <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row">
                <div className="text-xs text-slate-500">
                  Page <span className="font-medium text-slate-700">{page}</span> of{" "}
                  <span className="font-medium text-slate-700">{totalPages}</span> •{" "}
                  {data?.total ?? 0} total {totalLabel}
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
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-center text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Water Traders. All rights reserved.</p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/privacy-policy" className="text-slate-600 transition hover:text-slate-900">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-slate-600 transition hover:text-slate-900">
              Terms of Use
            </Link>
            <Link href="/contact" className="text-slate-600 transition hover:text-slate-900">
              Contact Us
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function isListingsResponse(data: ApiResponse | TradesApiResponse | null): data is ApiResponse {
  return !!data && Array.isArray((data as ApiResponse).listings);
}

function isTradesResponse(data: ApiResponse | TradesApiResponse | null): data is TradesApiResponse {
  return !!data && Array.isArray((data as TradesApiResponse).trades);
}

function formatCurrency(value: number | string): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function formatTradeStatus(status: string): string {
  if (!status) return "Unknown";
  return status
    .toLowerCase()
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function formatTradeType(type?: string | null): string {
  if (!type) return "";
  if (type.toUpperCase() === "BUY_NOW") return "Buy Now";
  if (type.toUpperCase() === "OFFER") return "Offer";
  return type
    .toLowerCase()
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function formatDateTime(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function tradeNeedsAction(trade: TradeRow): boolean {
  const status = (trade.status || "").toUpperCase();
  if (trade.viewerRole === "buyer") {
    return status === "COUNTERED_BY_SELLER" || status === "ACCEPTED_PENDING_BUYER_SIGNATURE";
  }
  if (trade.viewerRole === "seller") {
    return (
      status === "OFFERED" ||
      status === "COUNTERED_BY_BUYER" ||
      status === "ACCEPTED_PENDING_SELLER_SIGNATURE"
    );
  }
  return false;
}

/* ---------------- UI bits ---------------- */
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
        active
          ? "bg-[#004434] text-white"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-slate-500 text-sm">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function getTradeStatusLabel(status: string, viewerRole: "buyer" | "seller" | "unknown") {
  const normalized = (status || "").toUpperCase();
  if (normalized === "ACCEPTED_PENDING_BUYER_SIGNATURE") {
    if (viewerRole === "buyer") return "Your signature needed";
    if (viewerRole === "seller") return "Buyer signature pending";
    return "Awaiting buyer signature";
  }
  if (normalized === "ACCEPTED_PENDING_SELLER_SIGNATURE") {
    if (viewerRole === "seller") return "Your signature needed";
    if (viewerRole === "buyer") return "Seller signature pending";
    return "Awaiting seller signature";
  }
  return formatTradeStatus(normalized);
}

function TradeStatusBadge({
  status,
  highlight,
  viewerRole,
}: {
  status: string;
  highlight?: boolean;
  viewerRole: "buyer" | "seller" | "unknown";
}) {
  const normalized = (status || "").toUpperCase();
  const label = getTradeStatusLabel(normalized, viewerRole);
  let tone = "bg-slate-100 text-slate-700 border border-slate-200";
  if (normalized === "FULLY_EXECUTED") tone = "bg-emerald-100 text-emerald-800 border border-emerald-200";
  else if (normalized === "DECLINED" || normalized === "CANCELLED") tone = "bg-rose-100 text-rose-800 border border-rose-200";
  else if (highlight) tone = "bg-amber-100 text-amber-800 border border-amber-200";

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${tone}`}>
      {label}
      {highlight && viewerRole !== "unknown" && (
        <span className="ml-1 text-[10px] uppercase tracking-wide">Action needed</span>
      )}
    </span>
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
  dir: "asc" | "desc";
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

function formatInt(n: number | string) {
  const num = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(num);
}
