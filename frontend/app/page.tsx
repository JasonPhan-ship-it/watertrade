"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Trade water with confidence.
            </h1>
            <p className="mt-3 text-slate-600">
              A marketplace built for growers and districts. Discover live
              listings, compare prices by district, and complete transfers with
              a clear, auditable workflow.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                View Dashboard
              </Link>
              <Link
                href="/create-listing"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 px-5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                List Water
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="aspect-[16/10] rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-500" />
            <p className="mt-3 text-center text-xs text-slate-500">
              Dashboard preview — sign in to access.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t bg-slate-50 py-12">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 sm:grid-cols-3 sm:px-6">
          {[
            "Transparent Pricing",
            "District-Aware Transfers",
            "Premium Analytics",
          ].map((h, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="text-sm font-semibold">{h}</div>
              <p className="mt-2 text-sm text-slate-600">
                {i === 0 && "See current $/AF by district and water type."}
                {i === 1 && "Workflows tailored to each district’s window and forms."}
                {i === 2 && "Early-access listings plus pricing trends and alerts."}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
