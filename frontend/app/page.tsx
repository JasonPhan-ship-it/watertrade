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

type WorkflowPreviewComponent = React.ComponentType<{ feeRate: number }>;

const CORE_WORKFLOW_PREVIEWS: Record<
  string,
  { icon: LucideIcon; preview: WorkflowPreviewComponent }
> = {
  offer: { icon: PenLine, preview: OfferPreview },
  "buy-now": { icon: MousePointerClick, preview: BuyNowPreview },
  "create-listing": { icon: FileText, preview: CreateListingPreview },
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
          const json = (await copyRes.json().catch(() => ({}))) as { value?: HomepageCopy };
          if (json?.value) {
            setCopy(json.value);
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
              Learn more
              {learnMoreLabel}
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
    <div className="mt-6 rounded-2xl border border-white/15 bg-slate-900/60 p-4 text-left text-xs text-emerald-50 shadow-lg">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-200/80">
        <span>{title}</span>
        {subtitle ? <span className="text-emerald-100/60">{subtitle}</span> : <span className="text-emerald-100/60">Live</span>}
      </div>
      <div className="mt-3 space-y-3 text-[11px] leading-5 text-emerald-50/90">{children}</div>
    </div>
  );
}

function OfferPreview(_props: { feeRate: number }) {
  return (
    <PreviewFrame title="Offer workspace" subtitle="SJV growers">
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-emerald-200/70">
          <span>Delivery window</span>
          <span>Jul 1 – Aug 15</span>
        </div>
        <div className="mt-3 grid gap-2 text-[11px]">
          <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-emerald-50/90">
            <span>Westlands WD</span>
            <span className="font-semibold">1,200 AF</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-emerald-50/90">
            <span>Panoche WD</span>
            <span className="font-semibold">600 AF</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/70">Approval flow</p>
          <p className="text-[11px] text-emerald-50/90">Grower → Advisor → District</p>
        </div>
        <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-[11px] font-semibold text-emerald-200">Ready</span>
      </div>
    </PreviewFrame>
  );
}

function BuyNowPreview({ feeRate }: { feeRate: number }) {
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

function CreateListingPreview({ feeRate }: { feeRate: number }) {
  const normalizedFeeRate =
    Number.isFinite(feeRate) && feeRate >= 0 ? feeRate : DEFAULT_WATER_TRADER_FEE_RATE;

  const prefersReducedMotion = usePrefersReducedMotion();
  const listingVolumeAf = 1200;
  const listingPricePerAf = 795;
  const listingGrossValue = listingVolumeAf * listingPricePerAf;
  const listingFee = listingGrossValue * normalizedFeeRate;
  const listingNet = listingGrossValue - listingFee;
  const listingPriceDisplay = `$${listingPricePerAf.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const feePercentLabel = `${(normalizedFeeRate * 100).toFixed(2)}%`;
  const sectionOrder = ["basics", "volume", "distribution"] as const;
  const sectionCount = sectionOrder.length;
  const [activeSection, setActiveSection] = React.useState(prefersReducedMotion ? -1 : 0);

  React.useEffect(() => {
    if (prefersReducedMotion) {
      setActiveSection(-1);
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    const durations = [2600, 2200, 2600];

    const run = (index: number) => {
      if (cancelled) return;
      setActiveSection(index);
      const delay = durations[index % durations.length] ?? 2400;
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        const next = (index + 1) % sectionCount;
        run(next);
      }, delay);
    };

    run(0);
    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [prefersReducedMotion, sectionCount]);

  const completion = activeSection < 0 ? 0.5 : (activeSection + 1) / sectionCount;

  const baseSectionClass = "rounded-2xl border bg-white/90 p-4 text-slate-800 shadow-sm transition-all duration-500";
  const inactiveSectionClass = "border-white/50";
  const activeSectionClass =
    "border-emerald-200 ring-2 ring-emerald-300/70 shadow-[0_18px_40px_rgba(16,185,129,0.18)]";
  
  return (
    <PreviewFrame title="Listing composer" subtitle="Guided">
      <div className="grid gap-3 text-[11px] sm:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-3">
          <section
            className={`${baseSectionClass} ${activeSection === 0 ? activeSectionClass : inactiveSectionClass}`}
            aria-label="Listing basics"
          >
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-emerald-600/80">
              <span>Listing basics</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  activeSection === 0 ? "bg-emerald-100 text-emerald-700" : "bg-emerald-50 text-emerald-600/80"
                }`}
              >
                Step 1
              </span>
            </div>
            <div className="mt-3 space-y-2">
              <label className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Listing title
                <div
                  className={`mt-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                    activeSection === 0
                      ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                      : "border-slate-200 bg-slate-50/80 text-slate-800"
                  }`}
                >
                  2024 Allocation — Kern
                </div>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  District
                  <div
                    className={`mt-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                      activeSection === 0
                        ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                        : "border-slate-200 bg-slate-50/80 text-slate-800"
                    }`}
                  >
                    Kern Water Bank
                  </div>
                </label>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  Water type
                  <div
                    className={`mt-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                      activeSection === 0
                        ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                        : "border-slate-200 bg-slate-50/80 text-slate-800"
                    }`}
                  >
                    Surface allocation
                  </div>
                </label>
              </div>
            </div>
          </section>

          <section
            className={`${baseSectionClass} ${activeSection === 1 ? activeSectionClass : inactiveSectionClass}`}
            aria-label="Volume and pricing"
          >
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-emerald-600/80">
              <span>Volume &amp; pricing</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  activeSection === 1 ? "bg-emerald-100 text-emerald-700" : "bg-emerald-50 text-emerald-600/80"
                }`}
              >
                Step 2
              </span>
            </div>
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Volume (acre-feet)</p>
                <div
                  className={`mt-1 rounded-lg border px-3 py-2 text-base font-semibold ${
                    activeSection === 1
                      ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                      : "border-slate-200 bg-slate-50/80 text-slate-800"
                  }`}
                >
                  {formatInteger(listingVolumeAf)}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Price per AF ($)</p>
                  <div
                    className={`mt-1 rounded-lg border px-3 py-2 text-base font-semibold ${
                      activeSection === 1
                        ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                        : "border-slate-200 bg-slate-50/80 text-slate-800"
                    }`}
                  >
                    {listingPriceDisplay}
                  </div>
                </div>
                <div className="space-y-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  Pricing mode
                  <div
                    className={`flex rounded-full border p-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                      activeSection === 1
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <span
                      className={`flex-1 rounded-full px-2 py-1 text-center text-[10px] ${
                        activeSection === 1 ? "bg-emerald-600 text-white shadow" : "bg-white text-slate-600"
                      }`}
                    >
                      Fixed
                    </span>
                    <span className="flex-1 rounded-full px-2 py-1 text-center text-slate-400">Auction</span>
                  </div>
                  <p className="text-[9px] normal-case text-slate-500">Toggle to expose auction settings.</p>
                </div>
              <div
                className={`rounded-xl border px-3 py-3 ${
                  activeSection === 1
                    ? "border-emerald-200 bg-emerald-50/80 text-emerald-900"
                    : "border-slate-200 bg-slate-50/80 text-slate-800"
                }`}
              >
                <div
                  className={`flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] ${
                    activeSection === 1 ? "text-emerald-700" : "text-slate-500"
                  }`}
                >
                  <span>Estimated order value</span>
                  <span>{formatCurrency(listingGrossValue)}</span>
                </div>
                <div className="mt-2 space-y-1 text-[11px]">
                  <div
                    className={`flex items-center justify-between ${
                      activeSection === 1 ? "text-emerald-700/80" : "text-slate-500"
                    }`}
                  >
                    <span>Water Trader Fee ({feePercentLabel})</span>
                    <span>-{formatCurrency(listingFee)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm font-semibold text-emerald-600">
                    <span>Projected seller net</span>
                    <span>{formatCurrency(listingNet)}</span>
                  </div>
                </div>
              </div>
              </div>
            </div>
          </section>
        </div>

        <section
          className={`${baseSectionClass} ${activeSection === 2 ? activeSectionClass : inactiveSectionClass}`}
          aria-label="Distribution controls"
        >
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-emerald-600/80">
            <span>Visibility &amp; routing</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                activeSection === 2 ? "bg-emerald-100 text-emerald-700" : "bg-emerald-50 text-emerald-600/80"
              }`}
            >
              Step 3
            </span>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div
              className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                activeSection === 2
                  ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                  : "border-slate-200 bg-slate-50/80 text-slate-800"
              }`}
            >
              <span>District partners</span>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">Default</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-dashed border-slate-200 px-3 py-2 text-slate-500">
              <span>Private buyers</span>
              <span className="text-[10px] uppercase tracking-[0.2em]">Invite only</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-slate-700">
              <span>DocuSign packet</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-600">Auto generated</span>
            </div>
            </div>
          <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
              <span>Counterparty guardrails saved</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
              <span>Stakeholders notified on publish</span>
            </div>
          </div>
          <button
            type="button"
            className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeSection === 2 ? "bg-emerald-600 text-white shadow-lg" : "bg-emerald-500/90 text-white shadow"
            }`}
          >
            Create listing
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </section>
      </div>

      <div className="mt-4 rounded-2xl border border-white/30 bg-white/10 p-3 text-[10px] uppercase tracking-[0.3em] text-emerald-100/80">
        <div className="flex items-center justify-between text-[10px] font-semibold">
          <span>Submission readiness</span>
          <span>{Math.round(completion * 100)}%</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-emerald-300 transition-all duration-700"
            style={{ width: `${Math.min(100, Math.round(completion * 100))}%` }}
            aria-hidden
          />
        </div>
      </div>
    </PreviewFrame>
  );
}

function TrackProgressPreview(_props: { feeRate: number }) {
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
    const fallbackId = baseItems[0]?.id ?? fallbackItems[0]?.id ?? "offer";
    const fallbackPreview = CORE_WORKFLOW_PREVIEWS[fallbackId] ?? CORE_WORKFLOW_PREVIEWS["offer"];
    return baseItems
      .map((item) => {
        const mapping = CORE_WORKFLOW_PREVIEWS[item.id] ?? fallbackPreview;
        return {
          ...item,
          icon: mapping.icon,
          preview: mapping.preview,
        };
      })
      .filter((item) => Boolean(item.preview));
  }, [copy.items]);

  const workflowCount = workflows.length;
  const [activeIndex, setActiveIndex] = React.useState(0);
  const workflowCount = CORE_WORKFLOWS.length;
  
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

  const activeWorkflow = CORE_WORKFLOWS[activeIndex] ?? CORE_WORKFLOWS[0];
  if (!activeWorkflow) {
    return null;
  }
  const Preview = activeWorkflow.preview;
  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-white/15 bg-white/10 p-6 shadow-xl backdrop-blur-lg sm:p-8"
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
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-100">Core workflows</p>
          <h3 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
            Explore the operating system for water trading
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-emerald-50/80">
            Guided workspaces keep growers, advisors, and districts aligned from first offer to final delivery.
          </p>

          <div className="mt-6 space-y-2">
            {CORE_WORKFLOWS.map((workflow, index) => {
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
          <div className="relative rounded-2xl border border-white/15 bg-slate-900/60 p-4 shadow-xl ring-1 ring-white/10" aria-live="polite">
            <Preview />
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-xs text-emerald-50/70">
          {prefersReducedMotion
            ? "Select a workflow to explore the UI at your own pace."
            : "Carousel advances every 8 seconds. Use the controls to explore manually."}
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
};

function HeroSection({
  isSignedIn,
  onNavigate,
  showLogoutMessage,
  onDismissLogout,
  listingsData,
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

            {error ? (
              <p className="mt-10 rounded-2xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-50">
                {error}
              </p>
            ) : (
              <MetricsGrid data={listingsData} loading={loading} />
            )}
            <FeaturedDistricts />
          </div>

          <CoreWorkflowShowcase />
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
      />

      <HowItWorksSection />
      <GradientCtaSection />

      <Footer />
      <CookieConsentBanner />
    </div>
  );
}
