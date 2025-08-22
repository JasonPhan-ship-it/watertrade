// components/BuyNow.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

type BuyNowProps = {
  listingId: string;
  /** Listing price per AF in **cents** (e.g. 10000 for $100.00). */
  pricePerAFCents: number;
  /** Optional max AF a user can buy in one go (e.g., listing's available AF). */
  maxAcreFeet?: number;
  defaultAcreFeet?: number;
  className?: string;
};

export default function BuyNow({
  listingId,
  pricePerAFCents,
  maxAcreFeet,
  defaultAcreFeet = 1,
  className,
}: BuyNowProps) {
  const router = useRouter();
  const [acreFeet, setAcreFeet] = useState<number>(defaultAcreFeet);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const priceDollars = (pricePerAFCents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });

  const totalDollars = ((pricePerAFCents * Math.max(1, acreFeet)) / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });

  async function startBuyNow() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/transactions/buy-now", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          acreFeet, // ← ONLY send quantity; server will read price from Listing
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        throw new Error(j?.error || `Failed to start Buy Now (${res.status})`);
      }

      const { id } = await res.json();
      router.push(`/transactions/${id}?action=review`);
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
            Acre‑Feet
            <input
              type="number"
              min={1}
              max={maxAcreFeet ?? undefined}
              step={1}
              value={acreFeet}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value));
                setAcreFeet(maxAcreFeet ? Math.min(v, maxAcreFeet) : v);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            {maxAcreFeet ? (
              <div className="mt-1 text-xs text-slate-500">Max available: {maxAcreFeet.toLocaleString()} AF</div>
            ) : null}
          </label>

          <div className="text-sm text-slate-700">
            Price / AF
            <div className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              {priceDollars}
            </div>
            <div className="mt-1 text-xs text-slate-500">Price is fixed by the listing.</div>
          </div>
        </div>

        <div className="mt-3 text-sm">
          <span className="text-slate-600">Total:</span>{" "}
          <span className="font-medium">{totalDollars}</span>
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
