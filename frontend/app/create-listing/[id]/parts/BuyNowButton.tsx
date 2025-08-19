"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

type Props = {
  listingId: string;
  acreFeet: number;     // from server
  pricePerAF: number;   // cents, from server
  label?: string;
};

export default function BuyNowButton({ listingId, acreFeet, pricePerAF, label }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function handleBuyNow() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/purchase/buy-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // We pass values, but the server will re-read the DB to guarantee truth
        body: JSON.stringify({ listingId, acreFeet, pricePerAF }),
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Purchase failed");
      }

      const data = await res.json();
      setMsg(`Success! Order #${data.orderId} created.`);
      // Optional: redirect to checkout or orders page
      // router.push(`/orders/${data.orderId}`);
    } catch (e: any) {
      setMsg(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleBuyNow} disabled={loading}>
        {loading ? "Processing..." : (label ?? "Buy Now")}
      </Button>
      {msg ? <div className="text-sm">{msg}</div> : null}
    </div>
  );
}
