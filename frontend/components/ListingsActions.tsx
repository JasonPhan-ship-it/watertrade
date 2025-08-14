// components/ListingActions.tsx
"use client";

import * as React from "react";

type Props = {
  listing: {
    id: string;
    kind: "SELL" | "BUY";
    isAuction: boolean;
    reservePriceCents: number | null;
    pricePerAfCents: number; // list price in cents
    maxAf: number;
    status: string; // e.g., ACTIVE, etc.
  };
};

export default function ListingActions({ listing }: Props) {
  const disabled = listing.status !== "ACTIVE";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {listing.kind === "SELL" ? (
        <>
          <Card title="Buy Now" subtitle="Instantly start a transaction at the listed price.">
            <BuyNowForm listing={listing} disabled={disabled} />
          </Card>

          <Card title="Make an Offer" subtitle="Propose your own price and quantity.">
            <OfferForm listing={listing} side="BUYER" disabled={disabled} />
          </Card>

          {listing.isAuction && (
            <Card title="Place a Bid" subtitle="Bid per AF for the auction window.">
              <BidForm listing={listing} disabled={disabled} />
            </Card>
          )}
        </>
      ) : (
        <>
          <Card title="Sell to Buyer" subtitle="Offer your water to fulfill this buyer’s request.">
            <OfferForm listing={listing} side="SELLER" disabled={disabled} />
          </Card>

          {/* Optional: allow buyers to convert to auction—usually not for BUY listings, so omit */}
          <Card title="Ask a Question" subtitle="Message the buyer for terms or timing.">
            <NotImplemented />
          </Card>
        </>
      )}
    </div>
  );
}

/* ------------------------ Forms ------------------------ */

function BuyNowForm({ listing, disabled }: { listing: Props["listing"]; disabled: boolean }) {
  const [qty, setQty] = React.useState(Math.min( listing.maxAf, Math.max(1, listing.maxAf) ));
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const dollars = centsToDollars(listing.pricePerAfCents);
  const total = round2(qty * dollars);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: "BUY_NOW",
          listingId: listing.id,
          acreFeet: qty,
          pricePerAfCents: listing.pricePerAfCents,
        }),
      });

      if (!res.ok) {
        let message = "Failed to create transaction";
        try { message = (await res.json()).error || message; } catch {}
        if (res.status === 404) message = "Buy Now API not implemented yet.";
        throw new Error(message);
      }

      setMsg("Transaction created. Check your dashboard for next steps.");
    } catch (err: any) {
      setMsg(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Acre-Feet">
        <input
          type="number"
          min={1}
          max={listing.maxAf}
          step={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Math.min(listing.maxAf, Number(e.target.value) || 1)))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          disabled={disabled || loading}
          required
        />
      </Field>

      <div className="text-sm text-slate-600">
        Price: <span className="font-medium">${fmt(dollars)}</span> / AF • Total:{" "}
        <span className="font-semibold">${fmt(total)}</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={disabled || loading}
          className="rounded-xl bg-[#004434] px-4 py-2 text-sm font-medium text-white hover:bg-[#00392f] disabled:opacity-50"
        >
          {loading ? "Processing…" : "Buy Now"}
        </button>
        {msg && <p className="text-sm text-slate-600">{msg}</p>}
      </div>
    </form>
  );
}

function OfferForm({
  listing,
  side,
  disabled,
}: {
  listing: Props["listing"];
  side: "BUYER" | "SELLER";
  disabled: boolean;
}) {
  const [qty, setQty] = React.useState(Math.min(listing.maxAf, Math.max(1, listing.maxAf)));
  const [price, setPrice] = React.useState(centsToDollars(listing.pricePerAfCents));
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const total = round2(qty * price);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          listingId: listing.id,
          side, // BUYER making an offer on SELL listing, or SELLER offering on BUY listing
          acreFeet: qty,
          pricePerAfCents: dollarsToCents(price),
        }),
      });

      if (!res.ok) {
        let message = "Failed to submit offer";
        try { message = (await res.json()).error || message; } catch {}
        if (res.status === 404) message = "Offers API not implemented yet.";
        throw new Error(message);
      }

      setMsg("Offer submitted. We’ll notify the other party.");
    } catch (err: any) {
      setMsg(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Acre-Feet">
          <input
            type="number"
            min={1}
            max={listing.maxAf}
            step={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(listing.maxAf, Number(e.target.value) || 1)))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            disabled={disabled || loading}
            required
          />
        </Field>
        <Field label="Offer $ / AF">
          <input
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            disabled={disabled || loading}
            required
          />
        </Field>
      </div>

      <div className="text-sm text-slate-600">
        Total: <span className="font-semibold">${fmt(total)}</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={disabled || loading}
          className="rounded-xl bg-[#004434] px-4 py-2 text-sm font-medium text-white hover:bg-[#00392f] disabled:opacity-50"
        >
          {loading ? "Submitting…" : side === "BUYER" ? "Submit Offer" : "Offer to Sell"}
        </button>
        {msg && <p className="text-sm text-slate-600">{msg}</p>}
      </div>
    </form>
  );
}

function BidForm({ listing, disabled }: { listing: Props["listing"]; disabled: boolean }) {
  const [qty, setQty] = React.useState(Math.min(listing.maxAf, Math.max(1, listing.maxAf)));
  const [bid, setBid] = React.useState(centsToDollars(Math.max(listing.reservePriceCents ?? 0, 0)));
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          listingId: listing.id,
          acreFeet: qty,
          pricePerAfCents: dollarsToCents(bid),
        }),
      });

      if (!res.ok) {
        let message = "Failed to place bid";
        try { message = (await res.json()).error || message; } catch {}
        if (res.status === 404) message = "Bids API not implemented yet.";
        throw new Error(message);
      }

      setMsg("Bid placed successfully.");
    } catch (err: any) {
      setMsg(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Acre-Feet">
          <input
            type="number"
            min={1}
            max={listing.maxAf}
            step={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(listing.maxAf, Number(e.target.value) || 1)))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            disabled={disabled || loading}
            required
          />
        </Field>
        <Field label="Your Bid $ / AF">
          <input
            type="number"
            min={0}
            step="0.01"
            value={bid}
            onChange={(e) => setBid(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            disabled={disabled || loading}
            required
          />
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={disabled || loading}
          className="rounded-xl bg-[#004434] px-4 py-2 text-sm font-medium text-white hover:bg-[#00392f] disabled:opacity-50"
        >
          {loading ? "Placing…" : "Place Bid"}
        </button>
        {msg && <p className="text-sm text-slate-600">{msg}</p>}
      </div>
    </form>
  );
}

/* ------------------------ UI helpers ------------------------ */

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {subtitle && <div className="text-xs text-slate-600">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function NotImplemented() {
  return (
    <p className="text-sm text-slate-600">
      Messaging isn’t enabled yet. For now, submit an offer or use the contact info in the listing description.
    </p>
  );
}

/* ------------------------ money helpers ------------------------ */

function dollarsToCents(n: number) {
  return Math.max(0, Math.round(n * 100));
}
function centsToDollars(cents: number) {
  return Math.round((cents / 100) * 100) / 100;
}
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
