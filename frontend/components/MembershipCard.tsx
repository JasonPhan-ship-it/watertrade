"use client";

import Link from "next/link";

export default function MembershipCard(props: {
  name: string;
  subtitle: string;
  priceLabel: string;
  ctaLabel: string;
  /** For simple navigation */
  ctaHref?: string;
  /** For custom logic (e.g., API + redirect). If provided, a <button> is rendered instead of a <Link> */
  onCta?: () => void;
  highlights: string[];
  featured?: boolean;
  disabled?: boolean;
}) {
  const { name, subtitle, priceLabel, ctaLabel, ctaHref, onCta, highlights, featured, disabled } = props;
  const baseCtaClasses = [
    "mt-5 inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium",
    featured ? "bg-[#0E6A59] text-white hover:bg-[#0c5c4d]" : "border border-slate-300 text-slate-700 hover:bg-slate-50",
    disabled ? "opacity-60 cursor-not-allowed" : "",
  ].join(" ");

  return (
    <div
      className={[
        "relative rounded-2xl border bg-white p-6 shadow-sm",
        featured ? "border-[#0E6A59] ring-1 ring-[#0E6A59]/20" : "border-slate-200",
      ].join(" ")}
    >
      {featured && (
        <span className="absolute -top-3 left-6 rounded-full bg-[#0E6A59] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
          Most Popular
        </span>
      )}
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{name}</h3>
          <p className="text-xs text-slate-600">{subtitle}</p>
        </div>
        <div className="text-sm font-semibold text-slate-900">{priceLabel}</div>
      </div>

      <ul className="mt-4 space-y-2 text-sm">
        {highlights.map((h, i) => (
          <li key={i} className="flex items-start gap-2 text-slate-700">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#0E6A59]" />
            <span>{h}</span>
          </li>
        ))}
      </ul>

      {onCta ? (
        <button onClick={disabled ? undefined : onCta} className={baseCtaClasses} disabled={disabled}>
          {ctaLabel}
        </button>
      ) : (
        <Link href={ctaHref || "#"} className={baseCtaClasses} aria-disabled={disabled}>
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
