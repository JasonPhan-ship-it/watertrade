// components/BuyNow.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";

type BuyNowProps = {
  listingId: string;
  /** Listing price per AF in **cents** (e.g. 10000 for $100.00). */
  pricePerAFCents: number;
  /** Optional preview AF to display (server still decides actual AF). */
  defaultAcreFeet?: number;
  className?: string;
  /** kept for backwards-compat; not used anymore */
  maxAcreFeet?: number;
};

export default function BuyNow({
  listingId,
  pricePerAFCents,
  defaultAcreFeet = 1,
  className,
}: BuyNowProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // Read-only preview; server determines actual AF
  const previewAcreFeet = Math.max(1, Math.floor(defaultAcreFeet));

  const priceDollars = (pricePerAFCents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
  const totalDollars = ((pricePerAFCents * previewAcreFeet) / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });

  async function startBuyNow() {
    setLoading(true);
    setErr(null);
    try {
      // ✅ Only send listingId (via querystring). No quantity from client.
      const res = await fetch(
        `/api/transactions/buy-now?listingId=${encodeURIComponent(listingId)}`,
        { method: "POST", credentials: "include" }
      );

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(data?.error || `Failed to start Buy Now (${res.status})`);

      router.push(`/transactions/${data.id}?action=review`);
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
          <div className="text-sm text-slate-700">
            Quantity (AF)
            <div className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              {previewAcreFeet.toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Final quantity is determined by the listing.
            </div>
          </div>

          <div className="text-sm text-slate-700">
            Price / AF
            <div className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              {priceDollars}
            </div>
            <div className="mt-1 text-xs text-slate-500">Price is fixed by the listing.</div>
          </div>
        </div>

        <div className="mt-3 text-sm">
          <span className="text-slate-600">Preview Total:</span>{" "}
          <span className="font-medium">{totalDollars}</span>
          <span className="ml-2 text-xs text-slate-500">(final total computed on server)</span>
        </div>

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <button
          onClick={startBuyNow}
          disabled={loading}
          className="mt-4 rounded-xl bg-[#004434] px-5 py-2 text-white hover:bg-[#003a2f] disabled:opacity-50"
        >
          {loading ? "Starting…" : "Buy Now"}
        </button>
      </div>
    </div>
  );
}
