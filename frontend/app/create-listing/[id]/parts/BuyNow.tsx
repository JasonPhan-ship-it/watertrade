"use client";
import { useState, useMemo } from "react";

type ListingLike = {
  id: string;
  acreFeet: number;      // quantity to purchase
  pricePerAF: number;    // cents per AF (matches your schema)
  title?: string;
};

export default function BuyNow({ listing }: { listing: ListingLike }) {
  const [loading, setLoading] = useState(false);

  // Display helpers (assumes cents in DB)
  const priceDollars = useMemo(
    () => (listing.pricePerAF / 100).toLocaleString(undefined, { minimumFractionDigits: 2 }),
    [listing.pricePerAF]
  );
  const totalDollars = useMemo(
    () =>
      ((listing.acreFeet * listing.pricePerAF) / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
      }),
    [listing.acreFeet, listing.pricePerAF]
  );

  const disabled =
    loading || !listing?.id || !Number.isFinite(listing.acreFeet) || listing.acreFeet <= 0;

  async function onBuyNow() {
    try {
      setLoading(true);

      // Optional: basic confirm to prevent accidental clicks
      // const ok = window.confirm(
      //   `Buy ${listing.acreFeet} AF at $${priceDollars}/AF (Total: $${totalDollars})?`
      // );
      // if (!ok) return;

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          type: "BUY_NOW",
          acreFeet: listing.acreFeet,
          pricePerAF: listing.pricePerAF, // cents per AF
        }),
      });

      if (!res.ok) {
        let msg = "Request failed";
        try {
          const j = await res.json();
          msg = j?.error || msg;
        } catch {
          msg = await res.text().catch(() => msg);
        }
        throw new Error(msg);
      }

      const { id } = await res.json();

      // Kick off docs/payment flow
      await fetch(`/api/transactions/${id}/kickoff`, { method: "POST" });

      // Go to transaction page
      window.location.href = `/transactions/${id}`;
    } catch (e) {
      alert((e as Error).message || "Failed to start transaction");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm font-medium">Buy Now</div>

      <div className="mt-2 text-sm text-slate-600">
        {listing.title ? <div className="font-medium text-slate-900">{listing.title}</div> : null}
        <div>
          {listing.acreFeet.toLocaleString()} AF @ ${priceDollars}/AF
          <span className="text-slate-400"> • </span>
          Total: <span className="font-medium text-slate-900">${totalDollars}</span>
        </div>
      </div>

      <div className="mt-3">
        <button
          onClick={onBuyNow}
          disabled={disabled}
          className="h-10 rounded-xl bg-black px-4 text-white disabled:opacity-50"
          aria-label={`Buy ${listing.acreFeet} AF at $${priceDollars} per AF, total $${totalDollars}`}
        >
          {loading ? "Starting…" : "Buy Now"}
        </button>
      </div>

      {!disabled && listing.acreFeet <= 0 && (
        <div className="mt-2 text-xs text-red-600">This listing has no available quantity.</div>
      )}
    </div>
  );
}
