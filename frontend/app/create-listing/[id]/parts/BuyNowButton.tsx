// frontend/app/create-listing/[id]/parts/BuyNowButton.tsx
"use client";

import React from "react";

export default function BuyNowButton({
  listingId,
  acreFeet,
  pricePerAF, // cents per AF
  label,
}: {
  listingId: string;
  acreFeet: number;
  pricePerAF: number;
  label?: string;
}) {
  const [loading, setLoading] = React.useState(false);

  async function onBuyNow() {
    try {
      setLoading(true);

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          type: "BUY_NOW",
          acreFeet,
          pricePerAF, // send cents directly; API already supports both
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

      window.location.href = `/transactions/${id}`;
    } catch (e) {
      alert((e as Error).message || "Failed to start transaction");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={onBuyNow}
      disabled={loading || !listingId || acreFeet <= 0 || pricePerAF <= 0}
      className="h-10 rounded-xl bg-black px-4 text-white disabled:opacity-50"
      aria-label={label || "Buy Now"}
      title={label || "Buy Now"}
    >
      {loading ? "Starting…" : "Buy Now"}
    </button>
  );
}
