// app/preview/listing-actions/page.tsx
"use client";

import React from "react";
import ListingActions from "@/components/ListingActions";

export default function PreviewListingActions() {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">ListingActions Preview</h1>
        <p className="mt-1 text-sm text-slate-600">
          This shows the revised layout with the <strong>Price $/AF</strong> input above the controls and
          aligned with the submit button.
        </p>

        <section className="mt-6 grid gap-6">
          {/* SELL listing (you as buyer): default "Buy Now" tab, price read-only */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">SELL Listing (you are buying)</h2>
            <ListingActions
              listingId="demo-sell-123"
              kind="SELL"
              pricePerAf={675.0}
              isAuction={false}
              reservePrice={null}
            />
          </div>

          {/* SELL listing with auction enabled (so you can switch to "Place Bid") */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">
              SELL Listing w/ Auction (you are buying)
            </h2>
            <ListingActions
              listingId="demo-auction-123"
              kind="SELL"
              pricePerAf={640.0}
              isAuction={true}
              reservePrice={630.0}
            />
          </div>

          {/* BUY listing (you as seller): default "Sell Now" tab, price read-only */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">BUY Listing (you are selling)</h2>
            <ListingActions
              listingId="demo-buy-123"
              kind="BUY"
              pricePerAf={620.0}
              isAuction={false}
              reservePrice={null}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
