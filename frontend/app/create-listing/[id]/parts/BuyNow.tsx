// frontend/app/create-listing/[id]/parts/BuyNow.tsx
"use client";
import { useMemo, useState } from "react";

type ListingLike = {
  id: string;
  acreFeet: number;   // full quantity to purchase
  pricePerAF: number; // can be dollars OR cents depending on your data
  title?: string;
};

export default function BuyNow({ listing }: { listing: ListingLike }) {
  const [loading, setLoading] = useState(false);

  // If value is small (< 10k), treat as dollars; otherwise treat as cents.
  const priceInDollars = useMemo(() => {
    const v = Number(listing.pricePerAF);
    if (!Number.isFinite(v)) return 0;
    return v < 10_000 ? v : v / 100;
  }, [listing.pricePerAF]);

  const totalInDollars = useMemo(
    () => Number(listing.acreFeet) * priceInDollars,
    [listing.acreFeet, priceInDollars]
  );

  const disabled =
    loading ||
    !listing?.id ||
    !Number.isFinite(listing.acreFeet) ||
    Number(listing.acreFeet) <= 0;

  async function onBuyNow() {
    try {
      setLoading(true);

      // Always use the listing's own values
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          type: "BUY_NOW",
          acreFeet: listing.acreFeet,
          // Send the raw price; the API converts dollars->cents if needed
          pricePerAF: listing.pricePerAF,
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

      // Navigate to the transaction
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
          {Number(listing.acreFeet).toLocaleString()} AF @ $
          {priceInDollars.toLocaleString(undefined, { minimumFractionDigits: 2 })}/AF
          <span className="text-slate-400"> • </span>
          Total:{" "}
          <span className="font-medium text-slate-900">
            ${totalInDollars.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <button
          onClick={onBuyNow}
          disabled={disabled}
          className="h-10 rounded-xl bg-black px-4 text-white disabled:opacity-50"
          aria-label={`Buy ${listing.acreFeet} AF at $${priceInDollars.toFixed(
            2
          )} per AF, total $${totalInDollars.toFixed(2)}`}
        >
          {loading ? "Starting…" : "Buy Now"}
        </button>
      </div>
    </div>
  );
}
