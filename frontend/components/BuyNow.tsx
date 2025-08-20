// components/BuyNow.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

type BuyNowProps = {
  listingId: string;
  /** Price per AF in cents (e.g. 10000 for $100.00). Dollars are also accepted; API converts. */
  pricePerAFCents: number;
  defaultAcreFeet?: number;
  className?: string;
};

export default function BuyNow({
  listingId,
  pricePerAFCents,
  defaultAcreFeet = 1,
  className,
}: BuyNowProps) {
  const router = useRouter();
  const [acreFeet, setAcreFeet] = useState<number>(defaultAcreFeet);
  const [pricePerAF, setPricePerAF] = useState<number>(pricePerAFCents);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function startBuyNow() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          type: "BUY_NOW",
          acreFeet,
          // Can be cents or dollars; your API converts dollars -> cents if < 10000
          pricePerAF,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        throw new Error(j?.error || `Failed to start Buy Now (${res.status})`);
      }

      const { id } = await res.json();
      router.push(`/transactions/${id}`);
    } catch (e: any) {
      setErr(e?.message || "Failed to start Buy Now");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-medium">Buy Now</div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-700">
            Acre-Feet
            <input
              type="number"
              min={1}
              step={1}
              value={acreFeet}
              onChange={(e) => setAcreFeet(Math.max(1, Number(e.target.value)))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-700">
            Price / AF (cents)
            <input
              type="number"
              min={1}
              step={1}
              value={pricePerAF}
              onChange={(e) => setPricePerAF(Math.max(1, Number(e.target.value)))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <div className="mt-1 text-xs text-slate-500">
              Tip: enter <code>10000</code> for $100.00/AF (dollars are also accepted).
            </div>
          </label>
        </div>

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <button
          onClick={startBuyNow}
          disabled={loading}
          className="mt-4 rounded-xl bg-[#004434] px-5 py-2 text-white hover:bg-[#003a2f] disabled:opacity-50"
        >
          {loading ? "Starting…" : "Start Buy Now"}
        </button>
      </div>
    </div>
  );
}
