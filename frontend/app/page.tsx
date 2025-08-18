// app/page.tsx (Home)
"use client";

import Link from "next/link";
import Image from "next/image";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
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

type ApiResponse = {
  listings: Listing[];
  total: number;
  limited?: boolean;
};

/** ---- Robust logo list: use file names, not fixed paths ---- */
const DISTRICT_LOGOS = [
  { name: "Westlands Water District", file: "westlands.png", width: 360, height: 96 },
  { name: "San Luis Water District", file: "san-luis.png", width: 360, height: 96 },
  { name: "Panoche Water District", file: "panoche.png", width: 360, height: 96 },
  { name: "Arvin Edison Water District", file: "arvin-edison.png", width: 400, height: 96 },
] as const;

/** ---- Image with fallback: /file.png -> /logos/file.png on error ---- */
function LogoWithFallback({
  file,
  alt,
  width,
  height,
  className,
}: {
  file: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}) {
  const primary = `/${file}`;
  const fallback = `/logos/${file}`;
  const [src, setSrc] = React.useState(primary);

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      onError={() => {
        if (src !== fallback) setSrc(fallback);
      }}
      sizes="(max-width: 640px) 256px, 360px"
      loading="lazy"
      priority={false}
    />
  );
}

/** ---- Tiny Typewriter ---- */
function useTypewriter(phrases: string[], { typeSpeed = 45, deleteSpeed = 25, pauseMs = 5000 } = {}) {
  const [i, setI] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = phrases[i % phrases.length];
    let t: ReturnType<typeof setTimeout>;

    if (!deleting && text === current) {
      t = setTimeout(() => setDeleting(true), pauseMs);
    } else if (deleting && text.length === 0) {
      t = setTimeout(() => {
        setDeleting(false);
        setI((prev) => (prev + 1) % phrases.length);
      }, 800);
    } else {
      const nextLen = deleting ? text.length - 1 : text.length + 1;
      const next = current.slice(0, nextLen);
      t = setTimeout(() => setText(next), deleting ? deleteSpeed : typeSpeed);
    }

    return () => clearTimeout(t);
  }, [text, deleting, i, phrases, typeSpeed, deleteSpeed, pauseMs]);

  return text;
}

function Typewriter({ phrases, className = "" }: { phrases: string[]; className?: string }) {
  const text = useTypewriter(phrases, { pauseMs: 5000, typeSpeed: 45, deleteSpeed: 25 });
  return (
    <span className={className}>
      {text}
      <span aria-hidden className="ml-1 inline-block animate-pulse">|</span>
    </span>
  );
}

/** ---- Page ---- */
export default function HomePage() {
  if (typeof window !== "undefined") console.debug("[Render] / HomePage");

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/listings?premium=false&page=1&pageSize=3&sortBy=createdAt&sortDir=desc")
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<ApiResponse>;
      })
      .then((json) => active && setData(json))
      .catch((e) => active && setError(e.message || "Failed to load"))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const rows = data?.listings ?? [];
    const totalAf = rows.reduce((s, l) => s + l.acreFeet, 0);
    const avg =
      rows.length > 0
        ? Math.round((rows.reduce((s, l) => s + l.pricePerAf, 0) / rows.length) * 100) / 100
        : 0;
    return { count: data?.total ?? 0, af: formatNumber(totalAf), avg: avg ? `$${formatNumber(avg)}` : "$0" };
  }, [data]);

  const PHRASES = useMemo(() => ["From Growers, For Growers.", "List fast. Move water faster."], []);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 flex-1">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              <Typewriter phrases={PHRASES} />
            </h1>
            <p className="mt-3 text-slate-600">
              A marketplace built for growers and districts. Discover live listings, compare prices by district, and
              complete transfers with a clear, auditable workflow.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/sign-up"
                className="inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-medium text-white bg-[#004434] hover:bg-[#00392f] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#004434]"
              >
                Create Account
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 px-5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign In
              </Link>
            </div>
          </div>

          {/* Live preview card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between px-2 pt-1">
              <div className="text-sm font-medium text-slate-900">Dashboard Preview</div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">Read-only</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Kpi label="Listings" value={String(stats.count)} />
              <Kpi label="Acre-Feet" value={stats.af} />
              <Kpi label="Avg $/AF" value={stats.avg} />
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
                        <th className="px-4 py-3 text-right font-medium w-36">Action</th>
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
                          <td className="px-4 py-3 text-right">
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
      </section>

      {/* District logo cloud */}
      <section aria-label="District partners" className="border-t bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <p className="text-center text-xs font-medium tracking-wide text-slate-500">
            Working with growers across these districts
          </p>

          {/* ↑ More space between the sentence and the logos */}
          <div className="mt-12 grid grid-cols-2 items-center justify-items-center gap-x-10 gap-y-10 sm:grid-cols-4">
            {DISTRICT_LOGOS.map((logo) => (
              <div
                key={logo.name}
                className="opacity-80 grayscale transition hover:opacity-100 hover:grayscale-0 focus-within:opacity-100"
              >
                <LogoWithFallback
                  file={logo.file}
                  alt={logo.name}
                  width={logo.width}
                  height={logo.height}
                  className="h-16 w-auto object-contain sm:h-20"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature blurbs with centered icons */}
      <section className="border-t bg-slate-50 py-12">
        <div className="mx-auto grid max-w--7xl grid-cols-1 gap-6 px-4 sm:grid-cols-3 sm:px-6">
          {[
            { title: "Transparent Pricing", blurb: "See current $/AF by district and water type.", icon: <TagIcon /> },
            {
              title: "District-Aware Transfers",
              blurb: "Workflows tailored to each district’s window and forms.",
              icon: <ClipboardIcon />,
            },
            { title: "Premium Analytics", blurb: "Early-access listings plus pricing trends and alerts.", icon: <ChartIcon /> },
          ].map((f, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#E6F4F1]">
                <div className="h-6 w-6 text-[#0E6A59]">{f.icon}</div>
              </div>
              <div className="text-sm font-semibold">{f.title}</div>
              <p className="mt-2 text-sm text-slate-600">{f.blurb}</p>
            </div>
          ))}
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
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-slate-500 text-xs">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight">{value}</div>
    </div>
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

/* ---------------------- Helpers ---------------------- */
function formatNumber(n: number | string) {
  const num = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(num);
}
