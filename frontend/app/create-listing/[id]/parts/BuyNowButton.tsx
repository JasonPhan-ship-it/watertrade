// app/create-listing/[id]/parts/BuyNowButton.tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

type Props = {
  listingId: string; // server decides qty/price; client sends only the id
  label?: string;
};

export default function BuyNowButton({ listingId, label }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function handleBuyNow() {
    setLoading(true);
    setMsg(null);
    try {
      // ✅ No client inputs; post only listingId in the URL
      const res = await fetch(
        `/api/transactions/buy-now?listingId=${encodeURIComponent(listingId)}`,
        { method: "POST", credentials: "include" }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Purchase failed");

      // Redirect to review page for the created transaction
      window.location.href = `/transactions/${data.id}?action=review`;
    } catch (e: any) {
      setMsg(e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleBuyNow} disabled={loading}>
        {loading ? "Processing..." : (label ?? "Buy Now")}
      </Button>
      {msg ? <div className="text-sm text-red-600">{msg}</div> : null}
    </div>
  );
}
