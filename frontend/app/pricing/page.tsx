// app/pricing/page.tsx
import Link from "next/link";

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Upgrade to Premium</h1>
      <p className="mt-2 text-slate-600">
        Unlock full listings, early access, and premium analytics.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Free</h2>
          <p className="mt-2 text-sm text-slate-600">Limited listings and analytics.</p>
          <div className="mt-4 text-3xl font-bold">$0</div>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>• Limited listings</li>
            <li>• Basic analytics</li>
          </ul>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex h-10 items-center rounded-xl border border-slate-300 px-4 text-sm hover:bg-slate-50"
          >
            Continue Free
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-indigo-600/10">
          <h2 className="text-lg font-semibold">Premium</h2>
          <p className="mt-2 text-sm text-slate-600">Full details, early access, advanced analytics.</p>
          <div className="mt-4 text-3xl font-bold">
            {/* You can hardcode or fetch from Stripe; keeping simple here */}
            $<span>99</span> <span className="text-base font-normal text-slate-500">/ mo</span>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li>• Full listing details</li>
            <li>• Early access alerts</li>
            <li>• Advanced analytics</li>
          </ul>
          {/* We link to /pricing/checkout which handles auth + onboarding + Stripe */}
          <Link
            href="/pricing/checkout"
            className="mt-6 inline-flex h-10 items-center rounded-xl bg-black px-4 text-sm text-white"
          >
            Upgrade to Premium
          </Link>
        </div>
      </div>
    </main>
  );
}
