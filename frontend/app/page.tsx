// frontend/app/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { useUser } from "@clerk/nextjs";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  MousePointerClick,
  PenLine,
  X,
} from "lucide-react";

import Footer from "@/components/Footer";
import {
  DEFAULT_HOMEPAGE_COPY,
  DEFAULT_WATER_TRADER_FEE_RATE,
  type HomepageCopy,
} from "@/lib/site-settings/defaults";

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

const LISTINGS_ENDPOINT =
  "/api/listings?premium=false&page=1&pageSize=3&sortBy=createdAt&sortDir=desc";

const FEATURED_DISTRICTS = [
  { name: "Westlands Water District", file: "westlands.png", width: 360, height: 96 },
  { name: "San Luis Water District", file: "san-luis.png", width: 360, height: 96 },
  { name: "Panoche Water District", file: "panoche.png", width: 360, height: 96 },
  { name: "Arvin Edison Water District", file: "arvin-edison.png", width: 400, height: 96 },
] as const;

type WorkflowPreviewComponent = React.ComponentType<{
  feeRate: number;
  copy: HomepageCopy["coreWorkflows"];
}>;

const CORE_WORKFLOW_ORDER = [
  "create-listing",
  "buy-now",
  "track-progress",
] as const;

type CoreWorkflowId = (typeof CORE_WORKFLOW_ORDER)[number];

const CORE_WORKFLOW_PREVIEWS: Record<
  CoreWorkflowId,
  { icon: LucideIcon; preview: WorkflowPreviewComponent }
> = {
  "create-listing": { icon: FileText, preview: CreateListingPreview },
  "buy-now": { icon: MousePointerClick, preview: BuyNowPreview },
  "track-progress": { icon: CheckCircle2, preview: TrackProgressPreview },
};

const CORE_WORKFLOW_AUTOPLAY_INTERVAL = 8000;

const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const formatInteger = (value: number) => integerFormatter.format(Math.max(0, Math.round(value)));
const formatCurrency = (value: number) => currencyFormatter.format(Math.max(0, Math.round(value)));

const DEFAULT_METRIC_CARDS = DEFAULT_HOMEPAGE_COPY.metrics.cards;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer _U>
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

function mergeHomepageCopy(
  defaults: HomepageCopy,
  overrides: DeepPartial<HomepageCopy>,
): HomepageCopy {
  const heroOverride: DeepPartial<HomepageCopy["hero"]> = overrides.hero ?? {};
  const metricsOverride: DeepPartial<HomepageCopy["metrics"]> = overrides.metrics ?? {};
  const featuredOverride: DeepPartial<HomepageCopy["featuredDistricts"]> =
    overrides.featuredDistricts ?? {};
  const coreOverride: DeepPartial<HomepageCopy["coreWorkflows"]> = overrides.coreWorkflows ?? {};
  const carouselOverride: DeepPartial<HomepageCopy["coreWorkflows"]["carouselInstructions"]> =
    coreOverride.carouselInstructions ?? {};
  const processOverride: DeepPartial<HomepageCopy["process"]> = overrides.process ?? {};
  const gradientOverride: DeepPartial<HomepageCopy["gradientCta"]> = overrides.gradientCta ?? {};
  const cookieOverride: DeepPartial<HomepageCopy["cookieBanner"]> = overrides.cookieBanner ?? {};
  const logoutOverride: DeepPartial<HomepageCopy["logoutToast"]> = overrides.logoutToast ?? {};

  return {
    hero: {
      ...defaults.hero,
      ...heroOverride,
      phrases: heroOverride.phrases ?? defaults.hero.phrases,
    },
    metrics: {
      cards: metricsOverride.cards ?? defaults.metrics.cards,
    },
    featuredDistricts: {
      heading: featuredOverride.heading ?? defaults.featuredDistricts.heading,
    },
    coreWorkflows: {
      ...defaults.coreWorkflows,
      ...coreOverride,
      carouselInstructions: {
        ...defaults.coreWorkflows.carouselInstructions,
        ...carouselOverride,
      },
      items: coreOverride.items ?? defaults.coreWorkflows.items,
      listingComposerExample: {
        waterDistrict:
          coreOverride.listingComposerExample?.waterDistrict ??
          defaults.coreWorkflows.listingComposerExample.waterDistrict,
        waterType:
          coreOverride.listingComposerExample?.waterType ??
          defaults.coreWorkflows.listingComposerExample.waterType,
        volume:
          coreOverride.listingComposerExample?.volume ??
          defaults.coreWorkflows.listingComposerExample.volume,
        pricePerAf:
          coreOverride.listingComposerExample?.pricePerAf ??
          defaults.coreWorkflows.listingComposerExample.pricePerAf,
      },
    },
    process: {
      ...defaults.process,
      ...processOverride,
      steps: processOverride.steps ?? defaults.process.steps,
    },
    gradientCta: {
      ...defaults.gradientCta,
      ...gradientOverride,
    },
    cookieBanner: {
      ...defaults.cookieBanner,
      ...cookieOverride,
    },
    logoutToast: {
      ...defaults.logoutToast,
      ...logoutOverride,
    },
  };
}

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
        console.error(error);
        setError(DEFAULT_HOMEPAGE_COPY.hero.metricsError);
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

function useHomepageSettings() {
  const [copy, setCopy] = React.useState<HomepageCopy>(DEFAULT_HOMEPAGE_COPY);
  const [feeRate, setFeeRate] = React.useState<number>(DEFAULT_WATER_TRADER_FEE_RATE);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [copyRes, feeRes] = await Promise.all([
          fetch("/api/site-settings/homepage-copy"),
          fetch("/api/site-settings/water-trader-fee"),
        ]);

        if (!cancelled && copyRes.ok) {
          const json = (await copyRes.json().catch(() => ({}))) as {
            value?: DeepPartial<HomepageCopy>;
          };
          if (json?.value) {
            setCopy(mergeHomepageCopy(DEFAULT_HOMEPAGE_COPY, json.value ?? {}));
          }
        }

        if (!cancelled && feeRes.ok) {
          const json = (await feeRes.json().catch(() => ({}))) as { value?: { rate?: number } };
          const rate = json?.value?.rate;
          if (typeof rate === "number" && Number.isFinite(rate)) {
            setFeeRate(rate);
          }
        }
      } catch {
        // Ignore network errors and keep defaults
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { copy, feeRate };
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

function MetricsGrid({
  data,
  loading,
  cards,
}: {
  data: ListingsResponse | null;
  loading: boolean;
  cards: HomepageCopy["metrics"]["cards"];
}) {
  const metrics = React.useMemo(() => {
    const cardsToRender = cards.length ? cards : DEFAULT_METRIC_CARDS;
    const listings = data?.listings ?? [];
    const totalListings = data?.total ?? listings.length;
    const totalVolumeAf = listings.reduce((total, listing) => total + (listing.acreFeet ?? 0), 0);
    const totalValue = listings.reduce(
      (total, listing) => total + listing.acreFeet * listing.pricePerAf,
      0,
    );

    return cardsToRender.map((card, index) => {
      let rawValue: number;
      if (index === 0) {
        rawValue = totalListings;
      } else if (index === 1) {
        rawValue = totalVolumeAf;
      } else if (index === 2) {
        rawValue = totalValue;
      } else {
        rawValue = totalListings;
      }

      const safeValue = Number.isFinite(rawValue) ? rawValue : 0;
      return {
        label: card.label,
        value: safeValue,
        formatter: card.formatter === "currency" ? formatCurrency : formatInteger,
      };
    });
  }, [cards, data]);

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

function LogoutToast({
  copy,
  onDismiss,
}: {
  copy: HomepageCopy["logoutToast"];
  onDismiss: () => void;
}) {
  const title = copy.title || DEFAULT_HOMEPAGE_COPY.logoutToast.title;
  const body = copy.body || DEFAULT_HOMEPAGE_COPY.logoutToast.body;
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
        <p className="font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-emerald-100/90">{body}</p>
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

function CookieConsentBanner({ copy }: { copy: HomepageCopy["cookieBanner"] }) {
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

  const message = copy.message || DEFAULT_HOMEPAGE_COPY.cookieBanner.message;
  const learnMoreLabel = copy.learnMoreLabel || DEFAULT_HOMEPAGE_COPY.cookieBanner.learnMoreLabel;
  const declineLabel = copy.declineLabel || DEFAULT_HOMEPAGE_COPY.cookieBanner.declineLabel;
  const acceptLabel = copy.acceptLabel || DEFAULT_HOMEPAGE_COPY.cookieBanner.acceptLabel;
  
  return (
    <div role="dialog" aria-live="polite" className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-7xl px-4 pb-4 sm:px-6">
      <div className="rounded-2xl border border-white/20 bg-[#004434] p-4 text-white shadow-lg">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-5">
            {message}{" "}
            <Link href="/privacy-policy" className="text-white/90 underline hover:text-white">
              {learnMoreLabel}
            </Link>
            .
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConsent("rejected")}
              className="h-9 rounded-xl border border-white/30 bg-transparent px-4 text-sm font-medium text-white hover:bg-white/10"
            >
              {declineLabel}
            </button>
            <button
              onClick={() => setConsent("accepted")}
              className="h-9 rounded-xl bg-white px-4 text-sm font-semibold text-[#004434] hover:bg-slate-100"
            >
              {acceptLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturedDistricts({ heading }: { heading: string }) {
  const title = heading || DEFAULT_HOMEPAGE_COPY.featuredDistricts.heading;
  return (
    <div className="mt-12">
      <h2 className="text-sm font-semibold uppercase tracking-[0.4em] text-emerald-200">{title}</h2>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {FEATURED_DISTRICTS.map((logo) => (
          <div
            key={logo.file}
            className="flex items-center justify-center rounded-2xl border border-white/20 bg-white px-3 py-4 shadow-sm"
          >
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

function PreviewFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-[#004434]/80 p-4 text-left text-xs text-emerald-50 shadow-lg">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-200/80">
        <span>{title}</span>
        {subtitle ? <span className="text-emerald-100/70">{subtitle}</span> : <span className="text-emerald-100/70">Live</span>}
      </div>
      <div className="mt-3 space-y-3 text-[11px] leading-5 text-emerald-50/90">{children}</div>
    </div>
  );
}

function BuyNowPreview({ feeRate }: { feeRate: number; copy: HomepageCopy["coreWorkflows"] }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = React.useState<"details" | "clicked" | "redirect">("details");
  const checkoutQuantityAf = 250;
  const checkoutPricePerAf = 845;
  const checkoutSubtotal = checkoutQuantityAf * checkoutPricePerAf;
  const normalizedFeeRate =
    Number.isFinite(feeRate) && feeRate >= 0 ? feeRate : DEFAULT_WATER_TRADER_FEE_RATE;
  const checkoutFee = checkoutSubtotal * normalizedFeeRate;
  const checkoutTotal = checkoutSubtotal + checkoutFee;
  const checkoutPriceDisplay = `$${checkoutPricePerAf.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const feePercentLabel = `${(normalizedFeeRate * 100).toFixed(2)}%`;
    
  React.useEffect(() => {
    if (prefersReducedMotion) {
      setPhase("details");
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const run = (next: typeof phase) => {
      if (cancelled) return;
      setPhase(next);

      const delay =
        next === "details"
          ? 2400
          : next === "clicked"
          ? 900
          : 2400;

      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        const following = next === "details" ? "clicked" : next === "clicked" ? "redirect" : "details";
        run(following);
      }, delay);
    };

    run("details");
    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [prefersReducedMotion]);

  const showDocuSign = phase === "redirect";
  const buttonActive = phase === "clicked";
  const pointerHidden = showDocuSign;

  return (
    <PreviewFrame title="Buy Now" subtitle="Escrow ready">
      <div className="relative overflow-hidden rounded-2xl border border-emerald-200/40 bg-white/90 p-4 text-slate-800 shadow-sm">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-700/80">
          <span>Listing summary</span>
          <span className="text-emerald-500">Verified</span>
        </div>
        <div className="mt-3 grid gap-3 text-[11px] text-slate-600 sm:grid-cols-2">
          <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Quantity (AF)</p>
            <p className="text-base font-semibold text-slate-900">{formatInteger(checkoutQuantityAf)}</p>
            <p className="text-[10px] text-slate-500">Server locks final volume</p>
          </div>
          <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Price per AF</p>
            <p className="text-base font-semibold text-slate-900">{checkoutPriceDisplay}</p>
            <p className="text-[10px] text-slate-500">Pulled from listing controls</p>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/80 p-3 text-sm text-emerald-900" aria-live="polite">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            <span>Checkout summary</span>
            <span>Escrow ready</span>
          </div>
          <dl className="mt-2 space-y-1 text-[11px] text-emerald-800">
            <div className="flex items-center justify-between">
              <dt>Listing subtotal</dt>
              <dd>{formatCurrency(checkoutSubtotal)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Water Trader Fee ({feePercentLabel})</dt>
              <dd>{formatCurrency(checkoutFee)}</dd>
            </div>
          </dl>
          <div className="mt-3 flex items-center justify-between text-sm font-semibold text-emerald-900">
            <span>Total due</span>
            <span>{formatCurrency(checkoutTotal)}</span>
          </div>
          <p className="mt-1 text-[10px] text-emerald-700/80">Auto-reconciled in escrow packet</p>
        </div>
        <button
          type="button"
          className={`relative mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            buttonActive ? "bg-emerald-400 text-emerald-950 shadow-inner" : "bg-emerald-600 text-white shadow"
          }`}
        >
          <span>Buy Now</span>
          <ChevronRight className="h-4 w-4" aria-hidden />
          <span
            className={`pointer-events-none absolute inset-0 rounded-xl border border-emerald-300/70 transition-opacity duration-500 ${
              buttonActive ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden
          />
        </button>
        <MousePointerClick
          className={`pointer-events-none absolute -bottom-2 right-6 h-6 w-6 text-emerald-500/80 transition-all duration-500 ${
            pointerHidden ? "translate-y-3 opacity-0" : buttonActive ? "translate-y-1 scale-95" : "opacity-100"
          }`}
          aria-hidden
        />
        <div
          className={`pointer-events-none absolute inset-x-4 top-[56%] z-20 rounded-2xl border border-emerald-200/60 bg-white/95 p-4 text-[11px] text-slate-700 shadow-lg transition-all duration-500 ${
            showDocuSign ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
            <span>DocuSign session</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-500">Signing</span>
          </div>
          <div className="mt-3 flex items-start gap-3 rounded-xl border border-dashed border-slate-300 bg-white/80 p-3">
            <PenLine className="h-5 w-5 text-emerald-600" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-slate-900">Water transfer agreement</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Awaiting buyer signature</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-slate-500">Auto-redirected after click</span>
            <span className="rounded-lg bg-emerald-600 px-3 py-1 text-[10px] font-semibold text-white">Sign &amp; finish</span>
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}

function CreateListingPreview({
  feeRate: _feeRate,
  copy,
}: {
  feeRate: number;
  copy: HomepageCopy["coreWorkflows"];
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const fallbackWorkflow = React.useMemo(
    () => DEFAULT_HOMEPAGE_COPY.coreWorkflows.items.find((item) => item.id === "create-listing"),
    [],
  );
  const workflowCopy = React.useMemo(() => {
    const fromSettings = copy.items.find((item) => item.id === "create-listing");
    return fromSettings ?? fallbackWorkflow;
  }, [copy.items, fallbackWorkflow]);

  const defaults = DEFAULT_HOMEPAGE_COPY.coreWorkflows.listingComposerExample;
  const listingExample = React.useMemo(
    () => ({
      waterDistrict: copy.listingComposerExample?.waterDistrict?.trim() || defaults.waterDistrict,
      waterType: copy.listingComposerExample?.waterType?.trim() || defaults.waterType,
      volume: copy.listingComposerExample?.volume?.trim() || defaults.volume,
      pricePerAf: copy.listingComposerExample?.pricePerAf?.trim() || defaults.pricePerAf,
    }),
    [copy.listingComposerExample, defaults],
  );

  const [typedPrice, setTypedPrice] = React.useState(
    prefersReducedMotion ? listingExample.pricePerAf : "",
  );

  React.useEffect(() => {
    if (prefersReducedMotion) {
      setTypedPrice(listingExample.pricePerAf);
      return;
    }

    let cancelled = false;
    let index = 0;
    let timeoutId: number | null = null;

    const animate = () => {
      if (cancelled) return;

      if (index <= listingExample.pricePerAf.length) {
        setTypedPrice(listingExample.pricePerAf.slice(0, index));
        index += 1;
        timeoutId = window.setTimeout(animate, 90);
        return;
      }
      
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        index = 0;
        setTypedPrice("");
        timeoutId = window.setTimeout(animate, 480);
      }, 1400);
    };

    animate();
    
    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [listingExample.pricePerAf, prefersReducedMotion]);

  const priceDisplay = prefersReducedMotion ? listingExample.pricePerAf : typedPrice;
  const isTyping = !prefersReducedMotion && priceDisplay.length < listingExample.pricePerAf.length;

  const summaryItems = React.useMemo(
    () => [
      { label: "Water district", value: listingExample.waterDistrict },
      { label: "Water type", value: listingExample.waterType },
      { label: "Volume", value: listingExample.volume },
      { label: "Price per AF", value: listingExample.pricePerAf },
    ],
    [listingExample],
  );

  const highlight = workflowCopy?.highlight ?? "Listings";
  const title = workflowCopy?.title ?? "Publish verified supply";
  const description = workflowCopy?.description ??
    "Compose listings with pricing, volume, and distribution controls.";

  return (
    <PreviewFrame title="Listing composer">
      <div className="space-y-4 text-[11px] sm:text-[12px]">
        <div className="rounded-2xl border border-white/60 bg-white/95 p-4 shadow-[0_20px_45px_rgba(16,185,129,0.18)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-emerald-700">
                {highlight}
              </span>
              <p className="mt-3 text-base font-semibold text-slate-900">{title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{description}</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.32em] text-emerald-600 shadow-inner">
              Ready to publish
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Water district
              </span>
              <input
                readOnly
                value={listingExample.waterDistrict}
                aria-readonly
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-inner shadow-slate-100 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Water type
              </span>
              <input
                readOnly
                value={listingExample.waterType}
                aria-readonly
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-inner shadow-slate-100 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Volume
              </span>
              <input
                readOnly
                value={listingExample.volume}
                aria-readonly
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-inner shadow-slate-100 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2" aria-live="polite">
              <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Price per AF
              </span>
              <div className="relative">
                <input
                  readOnly
                  value={priceDisplay}
                  placeholder={prefersReducedMotion ? undefined : listingExample.pricePerAf}
                  aria-readonly
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-inner shadow-emerald-100 focus:outline-none"
                />
                <span
                  className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-[0.32em] transition ${
                    isTyping ? "text-emerald-500" : "text-emerald-400"
                  }`}
                >
                  {isTyping ? "typing" : "locked"}
                </span>
              </div>
            </label>
          </div>

          <button
            type="button"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-emerald-500"
          >
            Publish listing
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/80 p-4 text-emerald-900 shadow-inner">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-emerald-600">
            Listing summary
          </p>
          <dl className="mt-3 space-y-2">
            {summaryItems.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 text-[11px] shadow">
                <dt className="font-medium text-emerald-700">{item.label}</dt>
                <dd className="font-semibold text-slate-900">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </PreviewFrame>
  );
}

function TrackProgressPreview(_props: { feeRate: number; copy: HomepageCopy["coreWorkflows"] }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const steps = React.useMemo(
    () => [
      { id: "accepted", title: "Offer accepted", description: "Seller locked the terms." },
      { id: "seller", title: "Seller signature", description: "DocuSign sent to seller." },
      { id: "buyer", title: "Buyer signature", description: "Invite follows the seller." },
      { id: "district", title: "District confirmation", description: "District verifies delivery." },
    ],
    [],
  );
  const totalSteps = steps.length;
  const [progressIndex, setProgressIndex] = React.useState(prefersReducedMotion ? totalSteps : 0);

  React.useEffect(() => {
    if (prefersReducedMotion) {
      setProgressIndex(totalSteps);
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const run = (nextIndex: number) => {
      if (cancelled) return;
      setProgressIndex(nextIndex);
      const isFinal = nextIndex >= totalSteps;
      const delay = isFinal ? 2400 : 1700;
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        const following = isFinal ? 0 : nextIndex + 1;
        run(following);
      }, delay);
    };

    run(0);
    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [prefersReducedMotion, totalSteps]);

  const computedSteps = steps.map((step, index) => {
    const status =
      progressIndex >= totalSteps
        ? "complete"
        : index < progressIndex
        ? "complete"
        : index === progressIndex
        ? "current"
        : "upcoming";
    return { ...step, status };
  });

  const progressRatio = progressIndex >= totalSteps ? 1 : Math.max(0, progressIndex / totalSteps);
  const progressPercent = Math.round(progressRatio * 100);
  const headline =
    progressIndex >= totalSteps
      ? "All steps complete"
      : steps[progressIndex]?.title ?? steps[0]?.title ?? "Progress";
  
  return (
    <PreviewFrame title="Deal timeline" subtitle="Real-time">
      <div className="rounded-2xl border border-white/15 bg-white/90 p-4 text-slate-800 shadow-sm">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
          <span>{headline}</span>
          <span className="text-[10px] uppercase tracking-[0.25em] text-emerald-600">{progressPercent}%</span>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full ${progressIndex >= totalSteps ? "bg-emerald-500" : "bg-emerald-400"}`}
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            aria-hidden
          />
        </div>
        <ol className="mt-4 space-y-3 text-sm">
          {computedSteps.map((step) => {
            const indicatorClass =
              step.status === "complete"
                ? "bg-emerald-500 text-white"
                : step.status === "current"
                ? "border-2 border-emerald-500 text-emerald-600"
                : "border border-slate-300 text-slate-400";
            const containerClass =
              step.status === "complete"
                ? "border-emerald-200 bg-emerald-50/80 text-emerald-900"
                : step.status === "current"
                ? "border-emerald-300/60 bg-white text-emerald-800"
                : "border-slate-200 bg-white/70 text-slate-600";

            return (
              <li
                key={step.id}
                className={`flex items-start gap-3 rounded-xl border px-3 py-3 shadow-sm transition ${containerClass}`}
              >
                <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${indicatorClass}`}>
                  {step.status === "complete" ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : "•"}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{step.title}</p>
                  <p className="text-xs text-slate-500">{step.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </PreviewFrame>
  );
}

function CoreWorkflowShowcase({
  copy,
  feeRate,
}: {
  copy: HomepageCopy["coreWorkflows"];
  feeRate: number;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const workflows = React.useMemo(() => {
    const fallbackItems = DEFAULT_HOMEPAGE_COPY.coreWorkflows.items;
    const baseItems = copy.items.length ? copy.items : fallbackItems;


    return CORE_WORKFLOW_ORDER.map((id) => {
      const source =
        baseItems.find((item) => item.id === id) ??
        fallbackItems.find((item) => item.id === id);

      if (!source) {
        return null;
      }

      const mapping = CORE_WORKFLOW_PREVIEWS[id];

      return {
        ...source,
        icon: mapping.icon,
        preview: mapping.preview,
      };
    }).filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [copy.items]);
    
  const workflowCount = workflows.length;
  const [activeIndex, setActiveIndex] = React.useState(0);
  
  React.useEffect(() => {
    if (workflowCount <= 1 || prefersReducedMotion) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % workflowCount);
    }, CORE_WORKFLOW_AUTOPLAY_INTERVAL);

    return () => window.clearInterval(timer);
  }, [prefersReducedMotion, workflowCount]);

  const goTo = React.useCallback(
    (index: number) => {
      if (workflowCount === 0) return;
      const normalized = ((index % workflowCount) + workflowCount) % workflowCount;
      setActiveIndex(normalized);
    },
    [workflowCount],
  );
  
  const handlePrevious = React.useCallback(() => {
    goTo(activeIndex - 1);
  }, [activeIndex, goTo]);

  const handleNext = React.useCallback(() => {
    goTo(activeIndex + 1);
  }, [activeIndex, goTo]);

  const handleKeyDown = React.useCallback<React.KeyboardEventHandler<HTMLDivElement>>(
    (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlePrevious();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNext();
      }
    },
    [handleNext, handlePrevious],
  );

  const activeWorkflow = workflows[activeIndex] ?? workflows[0];
  if (!activeWorkflow) {
    return null;
  }
  const Preview = activeWorkflow.preview;
  const preheading = copy.preheading || DEFAULT_HOMEPAGE_COPY.coreWorkflows.preheading;
  const heading = copy.heading || DEFAULT_HOMEPAGE_COPY.coreWorkflows.heading;
  const description = copy.description || DEFAULT_HOMEPAGE_COPY.coreWorkflows.description;
  const defaultInstructions =
    copy.carouselInstructions.default || DEFAULT_HOMEPAGE_COPY.coreWorkflows.carouselInstructions.default;
  const reducedInstructions =
    copy.carouselInstructions.reducedMotion ||
    DEFAULT_HOMEPAGE_COPY.coreWorkflows.carouselInstructions.reducedMotion;
    
  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-[#004434]/60 p-6 shadow-xl backdrop-blur-lg sm:p-8"
      role="region"
      aria-roledescription="carousel"
      aria-label="Core platform workflows"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="pointer-events-none absolute -left-24 -top-32 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 -right-28 h-72 w-72 rounded-full bg-teal-400/20 blur-3xl" aria-hidden />

      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,0.54fr)_minmax(0,0.46fr)]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-100">{preheading}</p>
          <h3 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">{heading}</h3>
          <p className="mt-2 text-sm leading-relaxed text-emerald-50/80">{description}</p>

          <div className="mt-6 space-y-2">
            {workflows.map((workflow, index) => {
              const isActive = index === activeIndex;
              const Icon = workflow.icon;

              return (
                <button
                  key={workflow.id}
                  type="button"
                  onClick={() => goTo(index)}
                  className={`group flex w-full items-start gap-3 rounded-2xl border px-4 py-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                    isActive
                      ? "border-white/60 bg-white/15 shadow-lg"
                      : "border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10"
                  }`}
                  aria-pressed={isActive}
                  aria-current={isActive ? "true" : undefined}
                  aria-label={`Show workflow: ${workflow.title}`}
                >
                  <span
                    className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold transition ${
                      isActive ? "bg-white text-emerald-800" : "bg-emerald-400/10 text-emerald-100/80"
                    }`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Icon
                        className={`h-4 w-4 transition ${
                          isActive ? "text-emerald-200" : "text-emerald-100/70 group-hover:text-emerald-100"
                        }`}
                        aria-hidden
                      />
                      <span
                        className={`text-[11px] font-semibold uppercase tracking-[0.25em] transition ${
                          isActive ? "text-emerald-100" : "text-emerald-100/70 group-hover:text-emerald-100"
                        }`}
                      >
                        {workflow.highlight}
                      </span>
                    </div>
                    <p className="text-base font-semibold text-white">{workflow.title}</p>
                    <p className="text-sm leading-relaxed text-emerald-50/80">{workflow.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative isolate">
          <div className="pointer-events-none absolute -right-20 -top-16 h-60 w-60 rounded-full bg-emerald-300/20 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-emerald-500/15 blur-2xl" aria-hidden />
          <div className="relative rounded-2xl border border-emerald-400/40 bg-[#0E6A59]/60 p-4 shadow-xl ring-1 ring-emerald-300/20" aria-live="polite">
            <Preview feeRate={feeRate} copy={copy} />
        </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-xs text-emerald-50/70">
          {prefersReducedMotion ? reducedInstructions : defaultInstructions}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePrevious}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-white/5 text-white transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            aria-label="View previous workflow"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-white/5 text-white transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            aria-label="View next workflow"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
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
  loading: boolean;
  error: string | null;
  copy: HomepageCopy;
};

function HeroSection({
  isSignedIn,
  onNavigate,
  showLogoutMessage,
  onDismissLogout,
  listingsData,
  loading,
  error,
  copy,
}: HeroSectionProps) {
  const heroCopy = copy.hero ?? DEFAULT_HOMEPAGE_COPY.hero;
  const phrases = heroCopy.phrases.length ? heroCopy.phrases : DEFAULT_HOMEPAGE_COPY.hero.phrases;
  const metricsCards = copy.metrics.cards.length ? copy.metrics.cards : DEFAULT_METRIC_CARDS;
  const featuredHeading = copy.featuredDistricts.heading || DEFAULT_HOMEPAGE_COPY.featuredDistricts.heading;
  const logoutCopy = copy.logoutToast ?? DEFAULT_HOMEPAGE_COPY.logoutToast;
  const displayError = React.useMemo(() => {
    if (!error) return null;
    if (error === DEFAULT_HOMEPAGE_COPY.hero.metricsError && heroCopy.metricsError) {
      return heroCopy.metricsError;
    }
    return error;
  }, [error, heroCopy.metricsError]);
  return (
    <section className="relative isolate flex-1 overflow-hidden bg-[#004434]">
      <div className="pointer-events-none absolute -left-32 top-16 h-64 w-64 rounded-full bg-[#1A6F5A]/40 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-24 top-32 h-72 w-72 rounded-full bg-[#009276]/30 blur-3xl" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.15),_transparent_55%)]"
        aria-hidden
      />

      <div className="mx-auto flex h-full w-full max-w-7xl flex-col px-4 py-16 sm:px-6 lg:py-24">
        {showLogoutMessage && <LogoutToast copy={logoutCopy} onDismiss={onDismissLogout} />}

        <div className="flex flex-1 items-center">
          <div className="w-full max-w-3xl">
            <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">{heroCopy.preheading}</p>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              <TypewriterHeadline phrases={phrases} />
            </h1>
            <p className="mt-4 max-w-xl text-base text-emerald-100/90">{heroCopy.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {isSignedIn ? (
                <button
                  onClick={() => onNavigate("/dashboard")}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-6 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-white/70"
                >
                  {heroCopy.signedInCta}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => onNavigate("/sign-up")}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-6 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-white/70"
                  >
                    {heroCopy.signedOutPrimaryCta || heroCopy.signedInCta}
                  </button>
                  <button
                    onClick={() => onNavigate("/sign-in")}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-white/60 px-6 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/70"
                  >
                    {heroCopy.signedOutSecondaryCta}
                  </button>
                </>
              )}
            </div>

            {displayError ? (
              <p className="mt-10 rounded-2xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-50">
                {displayError}
              </p>
            ) : (
              <MetricsGrid data={listingsData} loading={loading} cards={metricsCards} />
            )}
            <FeaturedDistricts heading={featuredHeading} />
          </div>

        </div>
      </div>
    </section>
  );
}

function CoreWorkflowsSection({
  copy,
  feeRate,
}: {
  copy: HomepageCopy["coreWorkflows"];
  feeRate: number;
}) {
  const workflowsCopy = copy ?? DEFAULT_HOMEPAGE_COPY.coreWorkflows;

  return (
    <section className="relative border-t border-emerald-900/30 bg-[#023F33] py-20 text-white">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_60%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,_rgba(45,212,191,0.12),_transparent_70%)] sm:block"
        aria-hidden
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          
          <CoreWorkflowShowcase copy={workflowsCopy} feeRate={feeRate} />
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection({ copy }: { copy: HomepageCopy["process"] }) {
  const preheading = copy.preheading || DEFAULT_HOMEPAGE_COPY.process.preheading;
  const heading = copy.heading || DEFAULT_HOMEPAGE_COPY.process.heading;
  const description = copy.description || DEFAULT_HOMEPAGE_COPY.process.description;
  const quote = copy.quote || DEFAULT_HOMEPAGE_COPY.process.quote;
  const attribution = copy.attribution || DEFAULT_HOMEPAGE_COPY.process.attribution;
  const steps = copy.steps.length ? copy.steps : DEFAULT_HOMEPAGE_COPY.process.steps;

  return (
  <section className="border-t bg-white py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_minmax(0,1.2fr)] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">{preheading}</p>
            <h2 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">{heading}</h2>
            <p className="mt-3 text-base text-slate-600">{description}</p>
            <div className="mt-6 rounded-3xl border border-slate-100 bg-slate-50/70 p-6">
              <blockquote className="text-sm text-slate-700">{quote}</blockquote>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{attribution}</p>
            </div>
          </div>

          <ol className="grid gap-6">
            {steps.map((step, index) => (
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

function GradientCtaSection({ copy }: { copy: HomepageCopy["gradientCta"] }) {
  const preheading = copy.preheading || DEFAULT_HOMEPAGE_COPY.gradientCta.preheading;
  const heading = copy.heading || DEFAULT_HOMEPAGE_COPY.gradientCta.heading;
  const description = copy.description || DEFAULT_HOMEPAGE_COPY.gradientCta.description;
  const primaryLabel = copy.primaryCtaLabel || DEFAULT_HOMEPAGE_COPY.gradientCta.primaryCtaLabel;
  const secondaryLabel = copy.secondaryCtaLabel || DEFAULT_HOMEPAGE_COPY.gradientCta.secondaryCtaLabel;

  return (
    <section className="relative border-t bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 py-16">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.2),_transparent_55%)]" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-emerald-100">{preheading}</p>
        <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">{heading}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-base text-emerald-50">{description}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/contact"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-6 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-white/80"
          >
            {primaryLabel}
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/60 px-6 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/70"
          >
            {secondaryLabel}
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
  const { copy, feeRate } = useHomepageSettings();

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

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <HeroSection
        isSignedIn={Boolean(isSignedIn)}
        onNavigate={handleNavigation}
        showLogoutMessage={showLogoutMessage}
        onDismissLogout={() => setShowLogoutMessage(false)}
        listingsData={data}
        loading={loading}
        error={error}
        copy={copy}
      />

      <CoreWorkflowsSection copy={copy.coreWorkflows} feeRate={feeRate} />

      <HowItWorksSection copy={copy.process} />
      <GradientCtaSection copy={copy.gradientCta} />

      <Footer />
      <CookieConsentBanner copy={copy.cookieBanner} />
    </div>
  );
}
