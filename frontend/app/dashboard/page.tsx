// app/dashboard/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState, useId } from "react";
import Link from "next/link";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DEFAULT_WATER_TRADER_FEE_RATE } from "@/lib/site-settings/defaults";

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

type WestlandsBalance = {
  amount: number;
  updatedAt: string | null;
  breakdown: Record<string, number> | null;
};

type WestlandsCardDisplay = {
  amount: string;
  updated: string | null;
  breakdown: { key: string; label: string; amount: string }[] | null;
};

type WestlandsIntegrationResponse = {
  status?: string | null;
  balanceAf?: number | null;
  balanceUpdatedAt?: string | null;
  lastSyncedAt?: string | null;
  balanceBreakdown?: Record<string, number> | null;
} | null;

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

const WESTLANDS_BREAKDOWN_LABELS: Record<string, string> = {
  cvpAllocation: "CVP Allocation",
  supplementalWater: "Supplemental Water",
  pumpingCredits: "Pumping Credits",
};

const WESTLANDS_BREAKDOWN_ORDER = [
  "cvpAllocation",
  "supplementalWater",
  "pumpingCredits",
];

function formatWestlandsBreakdownKey(key: string): string {
  if (WESTLANDS_BREAKDOWN_LABELS[key]) {
    return WESTLANDS_BREAKDOWN_LABELS[key];
  }

  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

/* ---------------- Page ---------------- */
export default function DashboardPage() {
  const checking = useOnboardedGate();
  const { user } = useUser();
  const { isSignedIn } = useAuth();
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
  const [premium, setPremium] = useState<boolean>(Boolean(user?.publicMetadata?.premium));
  const [data, setData] = useState<ApiResponse | TradesApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [westlandsBalance, setWestlandsBalance] = useState<WestlandsBalance | null>(null);
  const [westlandsLoading, setWestlandsLoading] = useState<boolean>(false);
  const [feeRate, setFeeRate] = useState<number>(DEFAULT_WATER_TRADER_FEE_RATE);

    useEffect(() => {
    if (!isSignedIn) {
      setPremium(false);
      return;
    }

    let cancelled = false;

    const refreshPremium = async () => {
      try {
        const response = await fetch("/api/subscription/status", {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Failed to load subscription status (${response.status})`);
        }

        const payload = await response.json();
        if (!cancelled) {
          setPremium(Boolean(payload?.isPremium ?? payload?.plan === "premium"));
        }
      } catch (error) {
        console.warn("Unable to refresh premium status", error);
        if (!cancelled) {
          setPremium(Boolean(user?.publicMetadata?.premium));
        }
      }
    };

    refreshPremium();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshPremium();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isSignedIn, user?.publicMetadata?.premium]);

  const refreshWestlandsBalance = useCallback(async () => {
    if (!isSignedIn) {
      setWestlandsBalance(null);
      setWestlandsLoading(false);
      return;
    }

    setWestlandsLoading(true);
    try {
      const res = await fetch("/api/integrations/westlands", {
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error("Failed to load Westlands balance");
      }

      const data = await res.json();
      const integration = (data?.integration ?? null) as WestlandsIntegrationResponse;

      if (integration?.status === "CONNECTED" && typeof integration?.balanceAf === "number") {
        setWestlandsBalance({
          amount: integration.balanceAf,
          updatedAt: integration.balanceUpdatedAt ?? integration.lastSyncedAt ?? null,
          breakdown: integration.balanceBreakdown ?? null,
        });
      } else {
        setWestlandsBalance(null);
      }
    } catch (error) {
      console.warn("Failed to load Westlands balance", error);
      setWestlandsBalance(null);
    } finally {
      setWestlandsLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    refreshWestlandsBalance();
  }, [refreshWestlandsBalance]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = () => {
      refreshWestlandsBalance();
    };

    window.addEventListener("westlands-integration-updated", handler);
    return () => {
      window.removeEventListener("westlands-integration-updated", handler);
    };
  }, [refreshWestlandsBalance]);

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

  const westlandsDisplay = useMemo<WestlandsCardDisplay | null>(() => {
    if (!westlandsBalance) {
      return null;
    }

    const amount = westlandsBalance.amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    let updated: string | null = null;
    if (westlandsBalance.updatedAt) {
      try {
        updated = new Date(westlandsBalance.updatedAt).toLocaleString(undefined, {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
      } catch {
        updated = westlandsBalance.updatedAt;
      }
    }

    let breakdown: WestlandsCardDisplay["breakdown"] = null;
    if (westlandsBalance.breakdown) {
      const entries: NonNullable<WestlandsCardDisplay["breakdown"]> = [];
      const seen = new Set<string>();

      const formatAmount = (value: number) =>
        value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

      WESTLANDS_BREAKDOWN_ORDER.forEach((key) => {
        const raw = westlandsBalance.breakdown?.[key];
        if (typeof raw === "number") {
          entries.push({
            key,
            label: formatWestlandsBreakdownKey(key),
            amount: formatAmount(raw),
          });
          seen.add(key);
        }
      });

      Object.keys(westlandsBalance.breakdown)
        .filter((key) => !seen.has(key))
        .sort((a, b) => a.localeCompare(b))
        .forEach((key) => {
          const raw = westlandsBalance.breakdown?.[key];
          if (typeof raw === "number") {
            entries.push({
              key,
              label: formatWestlandsBreakdownKey(key),
              amount: formatAmount(raw),
            });
          }
        });

      breakdown = entries.length > 0 ? entries : null;
    }

    return { amount, updated, breakdown };
  }, [westlandsBalance]);

  useEffect(() => {
    let cancelled = false;

    async function loadFee() {
      try {
        const res = await fetch("/api/site-settings/water-trader-fee", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const json = (await res.json().catch(() => null)) as { value?: { rate?: number } } | null;
        const rate = json?.value?.rate;
        if (
          !cancelled &&
          typeof rate === "number" &&
          Number.isFinite(rate) &&
          rate >= 0
        ) {
          setFeeRate(rate);
        }
      } catch {
        // Ignore fetch errors and keep default fee rate
      }
    }

    loadFee();
    return () => {
      cancelled = true;
    };
  }, []);
  
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
  const normalizedFeeRate =
    typeof feeRate === "number" && Number.isFinite(feeRate) && feeRate >= 0
      ? feeRate
      : DEFAULT_WATER_TRADER_FEE_RATE;
  const showHeaderCreateButton = scope !== "trades" && !nocreate && listingRows.length > 0;
  const totalCount = data?.total ?? 0;
  const totalAf =
    scope === "trades"
      ? tradeRows.reduce((s, t) => s + (t.volumeAf ?? 0), 0)
      : listingRows.reduce(
          (s, l) => s + (scope === "market" ? l.availableAf ?? l.acreFeet : l.acreFeet),
          0
        );
  const avgPriceWithFee =
    scope === "trades"
      ? tradeRows.length > 0
        ? tradeRows.reduce((s, t) => s + (t.pricePerAf ?? 0), 0) / tradeRows.length
        : 0
      : listingRows.length > 0
        ? listingRows.reduce(
            (s, l) => s + l.pricePerAf * (1 + normalizedFeeRate),
            0,
          ) / listingRows.length
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
      ? "Browse active offers, bids, and market insights."
      : scope === "mine"
        ? "View your listings"
        : "Track offers and purchases you’re part of.";

  const viewerRole = data?.viewerRole ?? null;
  const isAdmin = viewerRole === "ADMIN";

  const avgPriceLabel =
    scope === "trades"
      ? "Avg $/AF"
      : normalizedFeeRate > 0
        ? "Average $ / AF"
        : "Avg $/AF";

  const isInitialLoad = loading && !data;
  const isRefreshing = loading && Boolean(data);
  
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
          { label: avgPriceLabel, value: avgPriceWithFee ? formatCurrency(avgPriceWithFee) : "$0.00" },
        ];
  const tableTitle =
    scope === "market" ? "Listings" : scope === "mine" ? "Your Listings" : "Your Trades";
  const totalLabel =
    scope === "market" ? "listings" : scope === "mine" ? "your listings" : "trades";
  const priceColumnLabel = "$ / AF";


  let tableContent: React.ReactNode;
  if (error) {
    tableContent = <div className="px-6 py-8 text-sm text-red-600">{error}</div>;
  } else if (isInitialLoad) {
    tableContent = <div className="px-6 py-8 text-sm text-slate-500">Loading…</div>;
  } else {
    tableContent = (
      <>
        <div className="relative">
          {isRefreshing ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Refreshing…</span>
              </div>
            </div>
          ) : null}
          <div className={`overflow-x-auto ${isRefreshing ? "opacity-50" : ""}`}>
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
                      label={priceColumnLabel}
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
                  {listingRows.map((l) => {
                    const availableAf =
                      l.availableAf ?? Math.max(l.acreFeet - (l.inEscrowAf ?? 0), 0);
                    const basePrice = l.pricePerAf ?? 0;
                    const feePerAfValue = basePrice * normalizedFeeRate;
                    const priceWithFee = basePrice + feePerAfValue;

                    return (
                      <tr key={l.id} className="border-t border-slate-100">
                        <Td>{l.district}</Td>
                        <Td align="right">
                          <div className="font-semibold text-slate-900">{formatInt(l.acreFeet)}</div>
                          {l.inEscrowAf && l.inEscrowAf > 0 ? (
                            <div className="mt-1 text-[11px] text-amber-700">
                              {formatInt(availableAf)} AF available · {formatInt(l.inEscrowAf)} AF in escrow
                            </div>
                          ) : null}
                        </Td>
                        <Td align="right">
                          <div className="font-semibold text-slate-900">{formatCurrency(priceWithFee)}</div>
                        </Td>
                        <Td>
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
                            <Link
                              href={`/listings/${l.id}/edit`}
                              className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Edit
                            </Link>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
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
        </div>
      </>
    );
  }
  
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <main className="mx-auto max-w-7xl flex-1 px-4 py-4 sm:px-6">
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
        <section className="rounded-3xl bg-[#004434] px-4 py-3 text-white shadow-md">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-2xl font-semibold tracking-tight">{pageTitle}</div>
              {subtitle ? <div className="mt-1 text-sm text-white/80">{subtitle}</div> : null}
            </div>
          </div>

          {scope === "trades" ? null : (
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
        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <Stat key={stat.label} label={stat.label} value={stat.value} />
          ))}
          <WestlandsCard loading={westlandsLoading} display={westlandsDisplay} />
        </section>

        {/* Listings */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
            <div className="font-medium">{tableTitle}</div>
            <div className="flex items-center gap-3">
              {showHeaderCreateButton && (
                <Link
                  href="/create-listing"
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-[#004434] px-4 text-sm font-semibold text-white hover:bg-[#00392f]"
                >
                  Create Listing
                </Link>
              )}
            </div>
          </div>
          {tableContent}
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
    <div className="flex h-full flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-xl font-semibold tracking-tight text-slate-900">{value}</div>
    </div>
  );
}

function WestlandsCard({
  loading,
  display,
}: {
  loading: boolean;
  display: WestlandsCardDisplay | null;
}) {
  const breakdownId = useId();
  const showBreakdown = Boolean(display?.breakdown?.length);
  return (
    <div className="group relative flex h-full min-h-[152px] flex-col rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-right shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Westlands balance</div>
      <div className="mt-2 flex flex-col items-end gap-1 text-right">
        {loading ? (
          <div className="flex items-center justify-end gap-2 text-xs font-medium text-emerald-700">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Syncing Westlands…
          </div>
        ) : display ? (
          <div className="relative w-full space-y-1 text-emerald-900">
            <div
              className={`text-2xl font-semibold ${
                showBreakdown
                  ? "cursor-help rounded-md outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-50"
                  : ""
              }`}
              tabIndex={showBreakdown ? 0 : -1}
              aria-describedby={showBreakdown ? breakdownId : undefined}
            >
              {display.amount} AF
            </div>
            {display.updated ? (
              <div className="text-[11px] text-emerald-700">Updated {display.updated}</div>
            ) : null}
            {showBreakdown ? (
              <div
                id={breakdownId}
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full z-10 mt-2 w-64 rounded-lg border border-emerald-200 bg-white/95 p-3 text-left text-sm text-emerald-900 opacity-0 shadow-lg backdrop-blur transition-all duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
              >
                <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  Balance breakdown
                </div>
                <dl className="mt-2 space-y-1">
                  {display.breakdown?.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-2">
                      <dt className="text-sm text-emerald-700">{item.label}</dt>
                      <dd className="font-medium text-emerald-900">{item.amount} AF</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-xs font-medium text-emerald-700">
            Connect your Westlands account to see live balances.
          </div>
        )}
      </div>
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
