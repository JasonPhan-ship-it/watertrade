// components/ListingActions.tsx
"use client";

import * as React from "react";

type Kind = "SELL" | "BUY";

export default function ListingActions({
  listingId,
  kind,
  pricePerAf,
  isAuction = false,
  reservePrice = null,
}: Props) {
  // 🔎 beacon
  if (typeof window !== "undefined") {
    console.debug("[Render] <ListingActions>", { listingId, kind, isAuction });
  }

  const [mode, setMode] = React.useState<Mode>(() => (kind === "SELL" ? "BUY_NOW" : "SELL_NOW"));

export default function ListingActions({
  listingId,
  kind,
  pricePerAf,
  isAuction = false,
  reservePrice = null,
}: Props) {
  const [mode, setMode] = React.useState<Mode>(() => (kind === "SELL" ? "BUY_NOW" : "SELL_NOW"));
  const [acreFeet, setAcreFeet] = React.useState<number>(1);
  const [price, setPrice] = React.useState<number>(() => {
    const base = isAuction ? (reservePrice ?? pricePerAf) : pricePerAf;
    return round2(base);
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const total = React.useMemo(() => round2(acreFeet * price), [acreFeet, price]);

  React.useEffect(() => {
    // Reset suggested price when mode changes
    if (mode === "BUY_NOW" || mode === "SELL_NOW") setPrice(round2(pricePerAf));
    if (mode === "BID") setPrice(round2(reservePrice ?? pricePerAf));
    if (mode === "OFFER") setPrice(round2(pricePerAf));
  }, [mode, pricePerAf, reservePrice]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setMessage(null);

    // Map modes -> API endpoints (you can change these to match your routes)
    let url = "/api/transactions";
    let payload: any = {
      listingId,
      acreFeet: Number(acreFeet),
      pricePerAF: Number(price), // dollars
    };

    if (mode === "BUY_NOW") {
      payload.type = "BUY_NOW";
      payload.intent = "BUY_FROM_SELLER";
    } else if (mode === "SELL_NOW") {
      payload.type = "BUY_NOW";
      payload.intent = "SELL_TO_BUYER";
    } else if (mode === "OFFER") {
      payload.type = "OFFER";
    } else if (mode === "BID") {
      url = "/api/bids";
      payload = {
        listingId,
        pricePerAF: Number(price),
        acreFeet: Number(acreFeet),
      };
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let msg = "Request failed";
        try {
          const j = await res.json();
          msg = j?.error || msg;
        } catch {
          msg = await res.text();
        }
        throw new Error(msg);
      }

      setMessage(successText(mode));
    } catch (err: any) {
      setMessage(err?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const canBuyNow = kind === "SELL";
  const canSellNow = kind === "BUY";
  const minBid = reservePrice ?? pricePerAf;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {canBuyNow && (
          <Tab selected={mode === "BUY_NOW"} onClick={() => setMode("BUY_NOW")}>
            Buy Now
          </Tab>
        )}
        {canSellNow && (
          <Tab selected={mode === "SELL_NOW"} onClick={() => setMode("SELL_NOW")}>
            Sell to Buyer
          </Tab>
        )}
        <Tab selected={mode === "OFFER"} onClick={() => setMode("OFFER")}>
          Make Offer
        </Tab>
        {isAuction && (
          <Tab selected={mode === "BID"} onClick={() => setMode("BID")}>
            Place Bid
          </Tab>
        )}
      </div>

      {/* Form */}
      <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Acre-Feet">
          <input
            type="number"
            min={1}
            step={1}
            required
            value={acreFeet}
            onChange={(e) => setAcreFeet(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </Field>

        <Field label={mode === "BID" ? "Your Bid $/AF" : "Price $/AF"}>
          <input
            type="number"
            min={mode === "BID" ? minBid : 0}
            step="0.01"
            required
            value={price}
            onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          {mode === "BID" && (
            <p className="mt-1 text-xs text-slate-500">Minimum: ${format2(minBid)} / AF</p>
          )}
        </Field>

        <Field label="Estimated Total">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-medium">
            ${format2(total)}
          </div>
        </Field>

        <div className="sm:col-span-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[#004434] px-5 text-sm font-medium text-white hover:bg-[#00392f] disabled:opacity-50"
          >
            {submitting ? actionText(mode) + "…" : actionText(mode)}
          </button>
          {message && <p className="text-sm text-slate-600">{message}</p>}
        </div>
      </form>
    </div>
  );
}

/* ----------------- helpers & bits ----------------- */

function Tab({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "h-9 rounded-full px-4 text-sm " +
        (selected
          ? "bg-[#0A6B58] text-white"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200")
      }
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function format2(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function actionText(mode: Mode) {
  switch (mode) {
    case "BUY_NOW":
      return "Buy Now";
    case "SELL_NOW":
      return "Sell Now";
    case "OFFER":
      return "Send Offer";
    case "BID":
      return "Place Bid";
  }
}

function successText(mode: Mode) {
  switch (mode) {
    case "BUY_NOW":
      return "Created transaction — check your dashboard";
    case "SELL_NOW":
      return "Submitted sale — buyer will be notified";
    case "OFFER":
      return "Offer sent to the counterparty";
    case "BID":
      return "Bid placed";
  }
}
