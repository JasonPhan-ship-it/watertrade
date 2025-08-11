"use client";
import { useState } from "react";

export default function MakeOffer({ listing }: { listing: any }) {
  const [qty, setQty] = useState(Math.min(250, listing.acreFeet));
  const [price, setPrice] = useState(listing.pricePerAF);
  const [sent, setSent] = useState(false);

  async function onOffer() {
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          type: "OFFER",
          acreFeet: qty,
          pricePerAF: price,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSent(true);
    } catch (e) {
      alert((e as Error).message || "Failed to send offer");
    }
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm font-medium">Make Offer</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-sm">
          AF
          <input
            className="mt-1 w-full rounded-lg border px-2 py-1"
            type="number"
            min={1}
            max={listing.acreFeet}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
        </label>
        <label className="text-sm">
          $/AF
          <input
            className="mt-1 w-full rounded-lg border px-2 py-1"
            type="number"
            min={1}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
          />
        </label>
      </div>
      <button onClick={onOffer} className="mt-3 h-10 w-full rounded-xl border">
        {sent ? "Offer Sent" : "Submit Offer"}
      </button>
    </div>
  );
}
