// app/page.tsx (Home)
"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { useUser } from "@clerk/nextjs";
import { CheckCircle2, X } from "lucide-react";

import Footer from "@/components/Footer";

/** ---- Types shared with the API shape ---- */
type Listing = {
  id: string;
  district: string;
  acreFeet: number;
  pricePerAf: number;
  availabilityStart: string; // ISO
  availabilityEnd: string; // ISO
  waterType: string;
  createdAt: string; // ISO
};

type ListingsResponse = {
  listings: Listing[];
  total: number;
};

const LISTINGS_ENDPOINT =
  "/api/listings?premium=false&page=1&pageSize=3&sortBy=createdAt&sortDir=desc";

const FEATURED_DISTRICTS = [
  { name: "Westlands Water District", file: "westlands.png", width: 360, height: 96 },
  { name: "San Luis Water District", file: "san-luis.png", width: 360, height: 96 },
  { name: "Panoche Water District", file: "panoche.png", width: 360, height: 96 },
  { name: "Arvin Edison Water District", file: "arvin-edison.png", width: 400, height: 96 },
] as const;

const PROCESS_STEPS = [
  {
    title: "Curate inventory",
    description: "List premium supply or demand with standardized data capture and district metadata.",
  },
  {
    title: "Qualify and match",
    description: "Screen counterparties with built-in guardrails and auto-flagged window restrictions.",
  },
  {
    title: "Execute with confidence",
    description: "Generate district-specific packets, collect e-signatures, and monitor fulfillment status in real time.",
  },
] as const;

const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const formatInteger = (value: number) => integerFormatter.format(Math.max(0, Math.round(value)));
const formatCurrency = (value: number) => currencyFormatter.format(Math.max(0, Math.round(value)));

const METRICS = [
  {
    label: "Live listings",
    compute: (data: ListingsResponse | null) => data?.total ?? 0,
    formatter: formatInteger,
  },
  {
    label: "Acre-feet posted",
    compute: (data: ListingsResponse | null) =>
      (data?.listings ?? []).reduce((sum, listing) => sum + listing.acreFeet, 0),
    formatter: formatInteger,
  },
  {
    label: "Avg $/AF",
    compute: (data: ListingsResponse | null) => {
      const listings = data?.listings ?? [];
      if (!listings.length) return 0;
      const total = listings.reduce((sum, listing) => sum + listing.pricePerAf, 0);
      return total / listings.length;
    },
    formatter: formatCurrency,
  },
] as const;

function useListingsPreview() {
  const [data, setData] = React.useState<ListingsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(LISTINGS_ENDPOINT, { signal: controller.signal });
        if (!res.ok) {
          const message = (await res.text()) || "Failed to load listings";
          throw new Error(message);
        }

        const json = (await res.json()) as ListingsResponse;
        setData(json);
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Failed to load listings";
        setError(message);
        setData(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => controller.abort();
  }, []);

  return { data, loading, error };
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(query.matches);

    const listener = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return prefersReducedMotion;
}

function useAnimatedNumber(target: number, duration: number) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [value, setValue] = React.useState(target);
  const previous = React.useRef(target);

  React.useEffect(() => {
    if (!Number.isFinite(target)) {
      previous.current = 0;
      setValue(0);
      return;
    }

    if (prefersReducedMotion || duration <= 0) {
      previous.current = target;
      setValue(target);
      return;
    }

    const startValue = previous.current;
    const diff = target - startValue;
    if (Math.abs(diff) < 0.001) {
      previous.current = target;
      setValue(target);
      return;
    }

    let rafId = 0;
    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = startValue + diff * eased;

      if (progress >= 1) {
        previous.current = target;
        setValue(target);
        return;
      }

      setValue(next);
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [duration, prefersReducedMotion, target]);

  return value;
}

function useTypewriter(phrases: string[], {
  typeSpeed = 45,
  deleteSpeed = 25,
  pauseMs = 4000,
}: {
  typeSpeed?: number;
  deleteSpeed?: number;
  pauseMs?: number;
} = {}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const stablePhrases = React.useMemo(() => phrases.filter(Boolean), [phrases]);
  const [index, setIndex] = React.useState(0);
  const [value, setValue] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (!stablePhrases.length) return undefined;
    if (prefersReducedMotion) {
      setValue(stablePhrases[0] ?? "");
      return undefined;
    }

    const current = stablePhrases[index % stablePhrases.length];
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (!deleting && value === current) {
      timer = setTimeout(() => setDeleting(true), pauseMs);
    } else if (deleting && value.length === 0) {
      timer = setTimeout(() => {
        setDeleting(false);
        setIndex((prev) => (prev + 1) % stablePhrases.length);
      }, 600);
    } else {
      const nextLength = deleting ? value.length - 1 : value.length + 1;
      const next = current.slice(0, nextLength);
      timer = setTimeout(() => setValue(next), deleting ? deleteSpeed : typeSpeed);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [stablePhrases, index, value, deleting, prefersReducedMotion, typeSpeed, deleteSpeed, pauseMs]);

  return value;
}

function AnimatedNumber({
  value,
  formatter,
  duration = 900,
}: {
  value: number;
  formatter: (value: number) => string;
  duration?: number;
}) {
  const animatedValue = useAnimatedNumber(value, duration);
  return <span className="tabular-nums">{formatter(animatedValue)}</span>;
}

function MetricCard({
  label,
  value,
  formatter,
  loading,
}: {
  label: string;
  value: number;
  formatter: (value: number) => string;
  loading: boolean;
}) {
  return (
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-sm backdrop-blur">
      <dt className="text-xs uppercase tracking-wide text-emerald-200">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-white">
        {loading ? <span className="animate-pulse">—</span> : <AnimatedNumber value={value} formatter={formatter} />}
      </dd>
    </div>
  );
}

function MetricsGrid({ data, loading }: { data: ListingsResponse | null; loading: boolean }) {
  const metrics = React.useMemo(
    () => METRICS.map((metric) => ({ ...metric, value: metric.compute(data) })),
    [data],
  );

  return (
    <dl className="mt-10 grid max-w-lg grid-cols-1 gap-6 text-white sm:grid-cols-3">
      {metrics.map((metric) => (
        <MetricCard key={metric.label} label={metric.label} value={metric.value} formatter={metric.formatter} loading={loading} />
      ))}
    </dl>
  );
}

function ListingsPreview({
  listings,
  loading,
  error,
}: {
  listings: Listing[];
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200/40 bg-rose-50/80 p-4 text-rose-600">
        We couldn't load the latest listings. Please refresh to try again.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-20 animate-pulse rounded-2xl border border-emerald-100/40 bg-white/30" />
        ))}
      </div>
    );
  }

  if (!listings.length) {
    return (
      <div className="rounded-2xl border border-emerald-200/40 bg-white/30 p-4 text-emerald-50">
        No public listings are live right now. Check back soon or join Water Traders to see premium inventory.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/15 bg-white/10 shadow-sm backdrop-blur">
      <table className="min-w-full divide-y divide-white/10 text-left text-sm text-white">
        <thead className="bg-white/5">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              District
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Acre-feet
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              $/AF
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Water type
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Available
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {listings.map((listing) => (
            <tr key={listing.id} className="hover:bg-white/10">
              <td className="px-4 py-3">
                <div className="font-semibold text-white">{listing.district}</div>
                <div className="text-xs text-emerald-100/80">Updated {new Date(listing.createdAt).toLocaleDateString()}</div>
              </td>
              <td className="px-4 py-3 tabular-nums">{formatInteger(listing.acreFeet)}</td>
              <td className="px-4 py-3 tabular-nums">{formatCurrency(listing.pricePerAf)}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded-full bg-[#0E6A59] px-3 py-1 text-xs font-semibold text-white">
                  {listing.waterType}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-emerald-100/80">
                {new Date(listing.availabilityStart).toLocaleDateString()} – {new Date(listing.availabilityEnd).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TypewriterHeadline({ phrases }: { phrases: string[] }) {
  const text = useTypewriter(phrases, { pauseMs: 4000, typeSpeed: 45, deleteSpeed: 25 });

  return (
    <span className="block text-emerald-50">
      {text}
      <span aria-hidden className="ml-1 inline-block animate-pulse">
        |
      </span>
    </span>
  );
}

function CookieBanner() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const hasChoice =
      typeof document !== "undefined" && document.cookie.split("; ").some((cookie) => cookie.startsWith("cookie_consent="));
    if (!hasChoice) setVisible(true);
  }, []);

  if (!visible) return null;

  const setConsent = (value: "accepted" | "rejected") => {
    const isHttps = typeof location !== "undefined" && location.protocol === "https:";
    const secure = isHttps ? "; secure" : "";
    document.cookie = `cookie_consent=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${secure}`;
    setVisible(false);
  };

  return (
    <div role="dialog" aria-live="polite" className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-7xl px-4 pb-4 sm:px-6">
      <div className="rounded-2xl border border-white/20 bg-[#004434] p-4 text-white shadow-lg">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-5">
            We use cookies to improve your experience, analyze traffic, and provide essential site functionality.{" "}
            <Link href="/privacy-policy" className="text-white/90 underline hover:text-white">
              Learn more
            </Link>
            .
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConsent("rejected")}
              className="h-9 rounded-xl border border-white/30 bg-transparent px-4 text-sm font-medium text-white hover:bg-white/10"
            >
              No thanks
            </button>
            <button
              onClick={() => setConsent("accepted")}
              className="h-9 rounded-xl bg-white px-4 text-sm font-semibold text-[#004434] hover:bg-slate-100"
            >
              Allow cookies
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturedDistricts() {
  return (
    <div className="mt-12">
      <h2 className="text-sm font-semibold uppercase tracking-[0.4em] text-emerald-200">Featured districts</h2>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {FEATURED_DISTRICTS.map((logo) => (
          <div key={logo.file} className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 py-4">
            <Image
              src={`/${logo.file}`}
              alt={logo.name}
              width={logo.width}
              height={logo.height}
              className="h-10 w-auto object-contain"
              onError={(event) => {
                const element = event.currentTarget;
                if (!element.src.includes("/logos/")) {
                  element.src = `/logos/${logo.file}`;
                }
              }}
              sizes="(max-width: 640px) 256px, 360px"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  
  const router = useRouter();
  const searchParams = useSearchParams();

  const logoutStatus = React.useMemo(() => searchParams?.get("logout"), [searchParams]);
  const [showLogoutMessage, setShowLogoutMessage] = React.useState(false);

  React.useEffect(() => {
    if (!searchParams || logoutStatus !== "success") return;

    setShowLogoutMessage(true);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("logout");
    const nextSearch = params.toString();
    const nextPath = nextSearch ? `/?${nextSearch}` : "/";
    router.replace(nextPath, { scroll: false });
  }, [logoutStatus, router, searchParams]);

  const metrics = useMemo(() => {
    const rows = data?.listings ?? [];
    const totalAf = rows.reduce((sum, listing) => sum + listing.acreFeet, 0);
    const avg = rows.length > 0 ? rows.reduce((sum, listing) => sum + listing.pricePerAf, 0) / rows.length : 0;

    return [
      {
        label: "Live listings",
        value: data?.total ?? 0,
        formatter: (value: number) => formatNumber(Math.round(value)),
      },
      {
        label: "Acre-feet posted",
        value: totalAf,
        formatter: (value: number) => formatNumber(Math.round(value)),
      },
      {
        label: "Average $/AF",
        value: avg,
        formatter: (value: number) => (value ? `$${formatNumber(Math.round(value))}` : "$0"),
      },
    ];
  }, [data]);

  const heroPhrases = React.useMemo(
    () => [
      "California water infrastrucutre.",
      "From growers, for growers.",
      "List fast. Move water faster.",
    ],
    [],
  );

  const handleGoToDashboard = React.useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  const handleCreateAccount = React.useCallback(() => {
    router.push("/sign-up");
  }, [router]);

  const handleSignIn = React.useCallback(() => {
    router.push("/sign-in");
  }, [router]);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Hero */}
      <section className="relative isolate flex-1 overflow-hidden bg-[#004434]">
        <div
          className="pointer-events-none absolute -left-32 top-16 h-64 w-64 rounded-full bg-[#1A6F5A]/40 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-24 top-32 h-72 w-72 rounded-full bg-[#009276]/30 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.15),_transparent_55%)]"
          aria-hidden
        />

        <div className="mx-auto flex h-full w-full max-w-7xl flex-col px-4 py-16 sm:px-6 lg:py-24">
          {showLogoutMessage && (
            <div
              role="status"
              aria-live="polite"
              className="mb-10 flex items-start gap-3 rounded-2xl border border-emerald-200/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-50 shadow-sm backdrop-blur"
            >
              <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-emerald-200">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              </span>
              <div className="flex-1">
                <p className="font-semibold text-white">Signed out successfully</p>
                <p className="mt-0.5 text-emerald-100/90">
                  You're now signed out. Come back anytime to manage your listings.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLogoutMessage(false)}
                className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-emerald-100 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-1 focus:ring-offset-slate-900"
                aria-label="Dismiss logout confirmation"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}

          <div className="grid flex-1 items-center gap-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">California water desk</p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
                <Typewriter phrases={PHRASES} className="font-semibold" />
              </h1>
              <p className="mt-5 max-w-xl text-base text-slate-200 sm:text-lg">
                Water Traders gives growers, advisors, and districts the infrastructure to transact securely. Compare
                real-time inventory, execute compliant transfers, and audit every step in a single workspace.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                {isSignedIn ? (
                  <button
                    type="button"
                    onClick={handleGoToDashboard}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-slate-900"
                  >
                    Go to Dashboard
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleCreateAccount}
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-400 px-5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:ring-offset-2 focus:ring-offset-slate-900"
                    >
                      Create Account
                    </button>
                    <button
                      type="button"
                      onClick={handleSignIn}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-white/30 px-5 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-2 focus:ring-offset-slate-900"
                    >
                      Sign In
                    </button>
                  </>
                )}
              </div>

              <dl className="mt-10 grid max-w-lg grid-cols-1 gap-6 text-white sm:grid-cols-3">
                {[
                  {
                    label: "Live listings",
                    value: stats.count,
                    formatter: (n: number) => formatNumber(Math.round(n)),
                  },
                  {
                    label: "Acre-feet posted",
                    value: stats.af,
                    formatter: (n: number) => formatNumber(Math.round(n)),
                  },
                  {
                    label: "Average $/AF",
                    value: stats.avg,
                    formatter: (n: number) => (n ? `$${formatNumber(Math.round(n))}` : "$0"),
                  },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-sm backdrop-blur">
                    <dt className="text-xs uppercase tracking-wide text-emerald-200">{metric.label}</dt>
                    <dd className="mt-1 text-lg font-semibold text-white">
                      <AnimatedStatValue value={metric.value} formatter={metric.formatter} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Live preview card */}
            <div className="rounded-3xl border border-white/10 bg-white/95 p-4 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between px-2 pt-1">
                <div className="text-sm font-medium text-slate-900">Dashboard Preview</div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">Read-only</span>
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
                          <th className="px-4 py-3 font-medium">Water Type</th>
                          <th className="px-4 py-3 text-center font-medium w-36">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(data?.listings ?? []).map((l) => (
                          <tr key={l.id} className="align-middle">
                            <td className="px-4 py-3 text-slate-900">{l.district}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-900">{formatNumber(l.acreFeet)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-900">${formatNumber(l.pricePerAf)}</td>
                            <td className="px-4 py-3">
                              <WaterTypeBadge type={l.waterType} />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Link
                                href={`/listings/${l.id}`}
                                className="inline-flex h-8 w-28 items-center justify-center rounded-full border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                title="View details"
                              >
                                View
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
                Preview shows a small subset. Sign in to see full listings &amp; analytics.
              </p>
            </div>
            </div>
          </div>
        </section>

        {/* District logo cloud */}
        <section aria-label="District partners" className="border-t bg-white">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
            <p className="text-center text-xs font-semibold tracking-[0.28em] text-slate-400">
              Trusted across california
            </p>
            <p className="mt-3 text-center text-2xl font-semibold text-slate-900 sm:text-3xl">
              Working with growers across leading districts
            </p>

            <div className="mt-12 grid grid-cols-2 items-center justify-items-center gap-x-10 gap-y-10 sm:grid-cols-4">
              {DISTRICT_LOGOS.map((logo) => (
                <div
                  key={logo.name}
                  className="group relative flex w-full items-center justify-center rounded-2xl border border-slate-100 bg-slate-50/60 px-6 py-5 opacity-90 transition hover:opacity-100 hover:shadow-lg"
                >
                  <div className="absolute inset-0 rounded-2xl border border-white/60 opacity-0 transition group-hover:opacity-100" aria-hidden />
                  <LogoWithFallback
                    file={logo.file}
                    alt={logo.name}
                    width={logo.width}
                    height={logo.height}
                    className="relative h-14 w-auto object-contain sm:h-16"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature blurbs with centered icons */}
        <section className="border-t bg-slate-50 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">Why watertrade</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Institutional controls, without the complex overhead
              </h2>
              <p className="mt-3 text-base text-slate-600">
                From compliant paperwork to premium market intelligence, WaterTrade keeps your team aligned and
                transaction-ready.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: "Transparent pricing intelligence",
                  blurb: "Live benchmarks by district, historical $/AF trends, and alerts when markets move.",
                  icon: <TagIcon />,
                },
                {
                  title: "District-aware compliance",
                  blurb: "Automatically surface the right forms, approvals, and windows for every deal.",
                  icon: <ClipboardIcon />,
                },
                {
                  title: "Premium analytics workspace",
                  blurb: "Executive dashboards, exportable audit trails, and premium inventory before it hits the market.",
                  icon: <ChartIcon />,
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="absolute -top-16 right-12 h-32 w-32 rounded-full bg-emerald-200/40 blur-3xl transition group-hover:bg-emerald-300/50" aria-hidden />
                  <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-[#0E6A59]">
                    <span className="h-6 w-6">{f.icon}</span>
                  </div>
                  <div className="relative mt-6 text-lg font-semibold text-slate-900">{f.title}</div>
                  <p className="relative mt-3 text-sm leading-6 text-slate-600">{f.blurb}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t bg-white py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid gap-12 lg:grid-cols-[1fr_minmax(0,1.2fr)] lg:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">How it works</p>
                <h2 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Full lifecycle coverage</h2>
                <p className="mt-3 text-base text-slate-600">
                  WaterTrade streamlines every step—from sourcing inventory to filing closing paperwork—so that your
                  compliance, finance, and operations teams move in lockstep.
                </p>
                <div className="mt-6 rounded-3xl border border-slate-100 bg-slate-50/70 p-6">
                  <blockquote className="text-sm text-slate-700">
                    “Water Traders gives our growers the confidence of an institutional desk with the speed of a startup. The
                    audit trail alone has transformed how we report to stakeholders.”
                  </blockquote>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Agribusiness COO</p>
                </div>
              </div>

              <ol className="grid gap-6">
                {[
                  {
                    title: "Curate inventory",
                    description: "List premium supply or demand with standardized data capture and district metadata.",
                  },
                  {
                    title: "Qualify and match",
                    description: "Screen counterparties with built-in guardrails and auto-flagged window restrictions.",
                  },
                  {
                    title: "Execute with confidence",
                    description: "Generate district-specific packets, collect e-signatures, and monitor fulfillment status in real time.",
                  },
                ].map((step, index) => (
                  <ProcessStep key={step.title} index={index + 1} title={step.title} description={step.description} />
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="relative border-t bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 py-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.2),_transparent_55%)]" aria-hidden />
          <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-emerald-100">Ready to modernize</p>
            <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
              Bring institutional-grade execution to your water trades
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-emerald-50">
              Schedule a walkthrough with our team to see how WaterTrade powers advisory firms, growers, and districts with
              a connected operating system.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="/contact"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-6 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-white/80"
              >
                Talk to our team
              </Link>
              <Link
                href="/pricing"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/60 px-6 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/70"
              >
                Explore pricing
              </Link>
            </div>
          </div>
        </section>

        <Footer />
        <CookieBanner />
    </div>
  );
}

/* ---------------------- Cookie Banner ---------------------- */
function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hasChoice =
      typeof document !== "undefined" && document.cookie.split("; ").some((c) => c.startsWith("cookie_consent="));
    if (!hasChoice) setVisible(true);
  }, []);

  if (!visible) return null;

  const setConsent = (value: "accepted" | "rejected") => {
    const isHttps = typeof location !== "undefined" && location.protocol === "https:";
    const secure = isHttps ? "; secure" : "";
    document.cookie = `cookie_consent=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${secure}`;
    setVisible(false);
  };

  return (
    <div role="dialog" aria-live="polite" className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-7xl px-4 pb-4 sm:px-6">
      <div className="rounded-2xl border border-white/20 bg-[#004434] p-4 text-white shadow-lg">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-5">
            We use cookies to improve your experience, analyze traffic, and provide essential site functionality.{" "}
            <Link href="/privacy-policy" className="underline text-white/90 hover:text-white">
              Learn more
            </Link>
            .
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConsent("rejected")}
              className="h-9 rounded-xl border border-white/30 bg-transparent px-4 text-sm font-medium text-white hover:bg-white/10"
            >
              No thanks
            </button>
            <button
              onClick={() => setConsent("accepted")}
              className="h-9 rounded-xl bg-white px-4 text-sm font-semibold text-[#004434] hover:bg-slate-100"
            >
              Allow cookies
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------- UI bits ---------------------- */
function ProcessStep({
  index,
  title,
  description,
}: {
  index: number;
  title: string;
  description: string;
}) {
  return (
    <li className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg">
      <div className="absolute -left-16 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-emerald-100/40 blur-3xl transition group-hover:bg-emerald-200/60" aria-hidden />
      <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-[#0E6A59]">
        {index.toString().padStart(2, "0")}
      </div>
      <h3 className="relative mt-4 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="relative mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </li>
  );
}

function WaterTypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#0E6A59] px-3 py-1 text-xs font-semibold text-white">
      {type}
    </span>
  );
}

/* ---------------------- Inline SVG Icons ---------------------- */
function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 13l-7 7-9-9V4h7l9 9z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 5h6a2 2 0 012 2v12H7V7a2 2 0 012-2z" />
      <path d="M9 3h6v4H9z" />
      <path d="M8 11h8M8 15h8" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19h16" />
      <path d="M7 16V9" />
      <path d="M12 16V5" />
      <path d="M17 16v-6" />
    </svg>
  );
}

type AnimatedStatValueProps = {
  value: number;
  formatter?: (value: number) => string;
  durationMs?: number;
};

function AnimatedStatValue({ value, formatter = defaultStatFormatter, durationMs = 1200 }: AnimatedStatValueProps) {
  const animated = useCountUp(value, durationMs);
  return <>{formatter(animated)}</>;
}

function defaultStatFormatter(value: number) {
  return formatNumber(Math.round(value));
}

function useCountUp(target: number, durationMs = 1200) {
  const previousValueRef = useRef(target);
  const [displayValue, setDisplayValue] = useState(target);

  useEffect(() => {
    previousValueRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setDisplayValue(target);
      previousValueRef.current = target;
      return;
    }

    const startValue = previousValueRef.current;
    const delta = target - startValue;

    if (!durationMs || delta === 0) {
      setDisplayValue(target);
      previousValueRef.current = target;
      return;
    }

    let frame: number;
    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / durationMs, 1);
      const eased = easeOutCubic(progress);
      setDisplayValue(startValue + delta * eased);

      if (progress < 1) {
        frame = window.requestAnimationFrame(step);
      } else {
        previousValueRef.current = target;
      }
    };

    frame = window.requestAnimationFrame(step);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [target, durationMs]);

  return displayValue;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/* ---------------------- Helpers ---------------------- */
function formatNumber(n: number | string) {
  const num = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(num);
}
