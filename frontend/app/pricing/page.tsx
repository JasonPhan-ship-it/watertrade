// app/pricing/page.tsx
import Link from "next/link";

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Upgrade to Premium</h1>
      <p className="mt-2 text-slate-600">
        Unlock full listings, early access, alerts, and advanced analytics.
      </p>

      <div className="relative mt-10">
        {/* MOST POPULAR badge */}
        <div className="absolute -top-4 left-6">
          <span className="inline-flex items-center rounded-full bg-[#0A6B58] px-3 py-1 text-xs font-semibold text-white shadow-sm ring-1 ring-white/10">
            MOST POPULAR
          </span>
        </div>

        {/* Card */}
        <div className="rounded-[28px] border-2 border-[#0A6B58] bg-white p-6 sm:p-8 shadow-sm">
          {/* Header row */}
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Premium</h2>
              <p className="mt-1 text-sm text-slate-600">For active buyers &amp; sellers</p>
            </div>

            {/* Price on the right */}
            <div className="text-right">
              <div className="text-xl font-semibold text-slate-900 sm:text-2xl">
                $20<span className="text-base font-normal text-slate-500">/mo</span>
              </div>
            </div>
          </div>

          {/* Features */}
          <ul className="mt-6 space-y-3 text-slate-800">
            <Feature>Early access to new listings</Feature>
            <Feature>Advanced analytics &amp; historical $/AF</Feature>
            <Feature>District window alerts (email/SMS)</Feature>
            <Feature>Saved searches &amp; instant notifications</Feature>
            <Feature>Bulk bid tools &amp; offer history</Feature>
            <Feature>Priority support</Feature>
          </ul>

          {/* CTA */}
          <div className="mt-8">
            <Link
              href="/pricing/checkout"
              className="inline-flex h-12 items-center justify-center rounded-full bg-[#0A6B58] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#085748] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A6B58]"
            >
              Upgrade to Premium
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

/* Small helper so we don’t pull an icon package */
function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E6F2EF] ring-1 ring-[#0A6B58]/20">
        {/* check icon */}
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          className="h-3.5 w-3.5"
        >
          <path
            d="M5 10.5l3 3 7-7"
            stroke="#0A6B58"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-sm text-slate-800">{children}</span>
    </li>
  );
}
