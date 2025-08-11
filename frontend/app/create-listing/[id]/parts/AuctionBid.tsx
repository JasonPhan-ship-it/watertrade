"use client";
import { useState } from "react";

export default function AuctionBid({ listing }: { listing: any }) {
  const [price, setPrice] = useState(listing.pricePerAF);
  const [ok, setOk] = useState(false);

  async function onBid() {
    try {
      const res = await fetch("/api/auctions/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, pricePerAF: price }),
      });
      if (!res.ok) throw new Error(await res.text());
      setOk(true);
    } catch (e) {
      alert((e as Error).message || "Failed to place bid");
    }
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm font-medium">Place Bid</div>
      <div className="mt-2 flex gap-2">
        <input
          className="w-32 rounded-lg border px-2 py-1"
          type="number"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
        <button onClick={onBid} className="h-10 rounded-xl border px-4">
          {ok ? "Bid Placed" : "Bid"}
        </button>
      </div>
    </div>
  );
}
