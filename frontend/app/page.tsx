// frontend/app/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { useUser } from "@clerk/nextjs";
import { CheckCircle2, X } from "lucide-react";

import Footer from "@/components/Footer";

type Listing = {
  id: string;
  district: string;
  acreFeet: number;
  pricePerAf: number;
  availabilityStart: string;
  availabilityEnd: string;
  waterType: string;
  createdAt: string;
};

type ListingsResponse = {
  listings: Listing[];
  total: number;
};

type MetricDefinition = {
  label: string;
  compute: (data: ListingsResponse | null) => number;
  formatter: (value: number) => string;
};

const LISTINGS_ENDPOINT =
  "/api/listings?premium=false&page=1&pageSize=3&sortBy=createdAt&sortDir=desc";

const HERO_PHRASES = [
  "Infrastructure for California water.",
  "From growers, for growers.",
  "List fast. Move water faster.",
] as const;

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
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const formatInteger = (value: number) => integerFormatter.format(Math.max(0, Math.round(value)));
const formatCurrency = (value: number) => currencyFormatter.format(Math.max(0, Math.round(value)));
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
};
const formatDateRange = (start: string, end: string) => {
  const formattedStart = formatDate(start);
  const formattedEnd = formatDate(end);
  if (formattedStart === "—" && formattedEnd === "—") return "—";
  if (formattedStart === "—") return formattedEnd;
  if (formattedEnd === "—") return formattedStart;
  return `${formattedStart} – ${formattedEnd}`;
};

const METRICS: readonly MetricDefinition[] = [
  {
    label: "Live listings",
    compute: (data) => data?.total ?? 0,
    formatter: formatInteger,
  },
  {
    label: "Acre-feet posted",
    compute: (data) => (data?.listings ?? []).reduce((sum, listing) => sum + listing.acreFeet, 0),
    formatter: formatInteger,
  },
  {
    label: "Avg $/AF",
    compute: (data) => {
      const listings = data?.listings ?? [];
      if (!listings.length) return 0;
      const total = listings.reduce((sum, listing) => sum + listing.pricePerAf, 0);
      return total / listings.length;
    },
    formatter: formatCurrency,
  },
];

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

function useTypewriter(
  phrases: readonly string[],
  {
    typeSpeed = 45,
    deleteSpeed = 25,
    pauseMs = 4000,
  }: {
    typeSpeed?: number;
    deleteSpeed?: number;
    pauseMs?: number;
  } = {},
) {
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

  return { text: value, prefersReducedMotion };
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
        <MetricCard
          key={metric.label}
          label={metric.label}
          value={metric.value}
          formatter={metric.formatter}
          loading={loading}
        />
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
                <div className="text-xs text-emerald-100/80">Updated {formatDate(listing.createdAt)}</div>
              </td>
              <td className="px-4 py-3 tabular-nums">{formatInteger(listing.acreFeet)}</td>
              <td className="px-4 py-3 tabular-nums">{formatCurrency(listing.pricePerAf)}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded-full bg-[#0E6A59] px-3 py-1 text-xs font-semibold text-white">
                  {listing.waterType}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-emerald-100/80">
                {formatDateRange(listing.availabilityStart, listing.availabilityEnd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TypewriterHeadline({ phrases }: { phrases: readonly string[] }) {
  const { text, prefersReducedMotion } = useTypewriter(phrases, {
    pauseMs: 4000,
    typeSpeed: 45,
    deleteSpeed: 25,
  });

  return (
    <span className="block text-emerald-50">
      {text}
      {!prefersReducedMotion && (
        <span aria-hidden className="ml-1 inline-block animate-pulse">
          |
        </span>
      )}
    </span>
  );
}

function LogoutToast({ onDismiss }: { onDismiss: () => void }) {
  return (
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
        <p className="mt-0.5 text-emerald-100/90">You're now signed out. Come back anytime to manage your listings.</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-emerald-100 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-1 focus:ring-offset-slate-900"
        aria-label="Dismiss logout confirmation"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function CookieConsentBanner() {
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

type HeroSectionProps = {
  isSignedIn: boolean;
  onNavigate: (path: string) => void;
  showLogoutMessage: boolean;
  onDismissLogout: () => void;
  listingsData: ListingsResponse | null;
  listings: Listing[];
  loading: boolean;
  error: string | null;
};

function HeroSection({
  isSignedIn,
  onNavigate,
  showLogoutMessage,
  onDismissLogout,
  listingsData,
  listings,
  loading,
  error,
}: HeroSectionProps) {
  return (
    <section className="relative isolate flex-1 overflow-hidden bg-[#004434]">
      <div className="pointer-events-none absolute -left-32 top-16 h-64 w-64 rounded-full bg-[#1A6F5A]/40 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-24 top-32 h-72 w-72 rounded-full bg-[#009276]/30 blur-3xl" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.15),_transparent_55%)]"
        aria-hidden
      />

      <div className="mx-auto flex h-full w-full max-w-7xl flex-col px-4 py-16 sm:px-6 lg:py-24">
        {showLogoutMessage && <LogoutToast onDismiss={onDismissLogout} />}

        <div className="grid flex-1 items-center gap-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">California water desk</p>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              <TypewriterHeadline phrases={HERO_PHRASES} />
            </h1>
            <p className="mt-4 max-w-xl text-base text-emerald-100/90">
              Water Traders connects California growers, advisors, and districts with a trusted operating system for trading surface water,
              transfers, and recharge. List inventory, qualify demand, and execute with institutional rigor.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {isSignedIn ? (
                <button
                  onClick={() => onNavigate("/dashboard")}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-6 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-white/70"
                >
                  Go to dashboard
                </button>
              ) : (
                <>
                  <button
                    onClick={() => onNavigate("/sign-up")}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-6 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-white/70"
                  >
                    Create free account
                  </button>
                  <button
                    onClick={() => onNavigate("/sign-in")}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-white/60 px-6 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/70"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>

            <MetricsGrid data={listingsData} loading={loading} />
            <FeaturedDistricts />
          </div>

          <div className="rounded-3xl border border-white/20 bg-white/10 p-6 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-100">Live market</h2>
              <Link href="/dashboard" className="text-xs font-semibold text-emerald-100/80 hover:text-white">
                View dashboard
              </Link>
            </div>
            <p className="mt-2 text-sm text-emerald-50/80">
              Real-time public listings. Premium members access district-level comps and analytics.
            </p>
            <div className="mt-6">
              <ListingsPreview listings={listings} loading={loading} error={error} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section className="border-t bg-white py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_minmax(0,1.2fr)] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">How it works</p>
            <h2 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Full lifecycle coverage</h2>
            <p className="mt-3 text-base text-slate-600">
              Water Traders streamlines every step—from sourcing inventory to filing closing paperwork—so that your compliance, finance, and
              operations teams move in lockstep.
            </p>
            <div className="mt-6 rounded-3xl border border-slate-100 bg-slate-50/70 p-6">
              <blockquote className="text-sm text-slate-700">
                “Water Traders gives our growers the confidence of an institutional desk with the speed of a startup. The audit trail alone
                has transformed how we report to stakeholders.”
              </blockquote>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Agribusiness COO</p>
            </div>
          </div>

          <ol className="grid gap-6">
            {PROCESS_STEPS.map((step, index) => (
              <li
                key={step.title}
                className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg"
              >
                <div
                  className="absolute -left-16 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-emerald-100/40 blur-3xl transition group-hover:bg-emerald-200/60"
                  aria-hidden
                />
                <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-[#0E6A59]">
                  {(index + 1).toString().padStart(2, "0")}
                </div>
                <h3 className="relative mt-4 text-lg font-semibold text-slate-900">{step.title}</h3>
                <p className="relative mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function GradientCtaSection() {
  return (
    <section className="relative border-t bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 py-16">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.2),_transparent_55%)]" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-emerald-100">Ready to modernize</p>
        <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
          Bring institutional-grade execution to your water trades
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-base text-emerald-50">
          Schedule a walkthrough with our team to see how Water Traders powers advisory firms, growers, and districts with a connected
          operating system.
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
  );
}

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn } = useUser();
  const { data, loading, error } = useListingsPreview();

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

  const handleNavigation = React.useCallback(
    (path: string) => {
      router.push(path);
    },
    [router],
  );

  const listings = React.useMemo(() => data?.listings ?? [], [data]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <HeroSection
        isSignedIn={Boolean(isSignedIn)}
        onNavigate={handleNavigation}
        showLogoutMessage={showLogoutMessage}
        onDismissLogout={() => setShowLogoutMessage(false)}
        listingsData={data}
        listings={listings}
        loading={loading}
        error={error}
      />

      <HowItWorksSection />
      <GradientCtaSection />

      <Footer />
      <CookieConsentBanner />
    </div>
  );
}
