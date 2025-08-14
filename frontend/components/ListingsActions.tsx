// components/ListingActions.tsx
"use client";

import * as React from "react";

type Props = {
  listingId: string;
  kind: "SELL" | "BUY";
  pricePerAf: number;      // dollars (UI)
  isAuction?: boolean;
  reservePrice?: number | null; // dollars
};

export default function ListingActions({
  listingId,
  kind,
  pricePerAf,
  isAuction,
  reservePrice,
}: Props) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function postJSON(url: string, body: any) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // keep UX friendly if endpoints aren’t built yet
      let text = "";
      try {
        text = await res.text();
      } catch {}
      throw new Error(text || `${res.status} ${res.statusText}`);
    }
    return res.json().catch(() => ({}));
  }

  async function handleBuyNow() {
    setBusy("buy");
    setMsg(null);
    try {
      // minimal payload — adjust to your Transaction model as you wire it up
      await postJSON("/api/transactions", {
        listingId,
        type: "BUY_NOW",
        acreFeet: undefined, // add a selector if you want partial buys
        pricePerAf: Math.round(pricePerAf * 100), // cents
      });
      setMsg("Buy Now initiated! We’ll email next steps.");
    } catch (e: any) {
      setMsg(
        e?.message?.includes("Not Found")
          ? "Buy Now isn’t set up yet. (Missing /api/transactions)"
          : `Buy Now failed: ${e?.message || "Unknown error"}`
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleOffer() {
    setBusy("offer");
    setMsg(null);
    try {
      await postJSON("/api/offers", {
        listingId,
        // you could add a form for custom $/AF and AF — this is a stub
        pricePerAf: Math.round(pricePerAf * 100),
      });
      setMsg("Offer submitted!");
    } catch (e: any) {
      setMsg(
        e?.message?.includes("Not Found")
          ? "Offers aren’t set up yet. (Missing /api/offers)"
          : `Offer failed: ${e?.message || "Unknown error"}`
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleBid() {
    setBusy("bid");
    setMsg(null);
    try {
      await postJSON("/api/bids", {
        listingId,
        // add an input for custom bid if you like; here we use asking as placeholder
        pricePerAf: Math.round(pricePerAf * 100),
      });
      setMsg("Bid placed!");
    } catch (e: any) {
      setMsg(
        e?.message?.includes("Not Found")
          ? "Auctions aren’t set up yet. (Missing /api/bids)"
          : `Bid failed: ${e?.message || "Unknown error"}`
      );
    } finally {
      setBusy(null);
    }
  }

  const selling = kind === "SELL";
  const buying = kind === "BUY";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        {/* SELL listing (buyer’s perspective) */}
        {selling && (
          <>
            <button
              onClick={handleBuyNow}
              disabled={busy !== null}
              className="rounded-xl bg-[#004434] px-4 py-2 text-sm font-semibold text-white hover:bg-[#00392f] disabled:opacity-50"
            >
              {busy === "buy" ? "Processing…" : "Buy Now"}
            </button>

            <button
              onClick={handleOffer}
              disabled={busy !== null}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "offer" ? "Submitting…" : "Make Offer"}
            </button>
          </>
        )}

        {/* BUY listing (seller’s perspective) */}
        {buying && (
          <button
            onClick={handleOffer}
            disabled={busy !== null}
            className="rounded-xl bg-[#004434] px-4 py-2 text-sm font-semibold text-white hover:bg-[#00392f] disabled:opacity-50"
          >
            {busy === "offer" ? "Submitting…" : "Offer to Sell"}
          </button>
        )}

        {/* Auction actions */}
        {isAuction && (
          <>
            <button
              onClick={handleBid}
              disabled={busy !== null}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "bid" ? "Placing…" : "Place Bid"}
            </button>
            {reservePrice != null && (
              <span className="text-xs text-slate-500">
                Reserve: ${new Intl.NumberFormat("en-US").format(reservePrice)} / AF
              </span>
            )}
          </>
        )}
      </div>

      {msg && <p className="mt-3 text-xs text-slate-600">{msg}</p>}

      {/* Developer hint when endpoints aren’t implemented yet */}
      {!isAuction && (
        <p className="mt-3 text-[11px] text-slate-400">
          Tip: Wire up <code>/api/transactions</code> and <code>/api/offers</code> to persist actions.
        </p>
      )}
      {isAuction && (
        <p className="mt-3 text-[11px] text-slate-400">
          Tip: Wire up <code>/api/bids</code> to persist bids.
        </p>
      )}
    </div>
  );
}
