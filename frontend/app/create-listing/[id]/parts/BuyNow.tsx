"use client";
import { useState } from "react";

export default function BuyNow({ listing }: { listing: any }) {
  const [qty, setQty] = useState(listing.acreFeet);
  const [loading, setLoading] = useState(false);

  async function onBuyNow() {
    try {
      setLoading(true);
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          type: "BUY_NOW",
          acreFeet: qty,
          pricePerAF: listing.pricePerAF, // make sure units match your backend
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { id } = await res.json();

      // Kick off DocuSign to seller + payment email to buyer
      await fetch(`/api/transactions/${id}/kickoff`, { method: "POST" });

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
      <div className="mt-2 flex items-center gap-2">
        <input
          className="w-24 rounded-lg border px-2 py-1"
          type="number"
          min={1}
          max={listing.acreFeet}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        />
        <button
          onClick={onBuyNow}
          disabled={loading}
          className="h-10 rounded-xl bg-black px-4 text-white disabled:opacity-50"
        >
          {loading ? "Starting…" : "Buy Now"}
        </button>
      </div>
    </div>
  );
}
