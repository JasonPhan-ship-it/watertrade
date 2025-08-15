"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// Optional: common districts for suggestions (free-text still allowed)
const DISTRICTS = [
  "Westlands Water District",
  "San Luis Water District",
  "Panoche Water District",
  "Arvin Edison Water District",
];

export default function CreateListingPage() {
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  // NEW: auction toggle & local reserve value (in dollars)
  const [auction, setAuction] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const formEl = e.currentTarget;

    try {
      const formData = new FormData(formEl);

      const payload = {
        title: String(formData.get("title") || ""),
        description: String(formData.get("description") || ""),
        volumeAF: Number(formData.get("volumeAF") || 0),
        pricePerAF: Number(formData.get("pricePerAF") || 0), // dollars in UI; server can convert to cents
        // Only "sell" is allowed now
        type: String(formData.get("type") || "sell"),
        district: String(formData.get("district") || ""),
        // NEW auction fields
        isAuction: auction,
        reservePrice: auction
          ? (() => {
              const r = formData.get("reservePrice");
              const n = r == null || String(r).trim() === "" ? null : Number(r);
              return Number.isFinite(n as number) ? (n as number) : null; // dollars in UI
            })()
          : null,
      };

      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `API ${res.status}: ${res.statusText}${text ? " - " + text.slice(0, 200) : ""}`
        );
      }

      setMessage(auction ? "Auction listing created!" : "Listing created!");
      formEl.reset();
      setAuction(false);
    } catch (err: any) {
      console.error(err);
      setMessage(err?.message || "Failed to create listing.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Listing</CardTitle>
        </CardHeader>

        <form onSubmit={handleSubmit} className="contents">
          <CardContent className="space-y-5">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                placeholder="e.g., 50 AF transfer in Westlands"
                required
              />
            </div>

            {/* Water District */}
            <div className="space-y-2">
              <Label htmlFor="district">Water District</Label>
              <Input
                id="district"
                name="district"
                list="district-options"
                placeholder="e.g., Westlands Water District"
                required
              />
              <datalist id="district-options">
                {DISTRICTS.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>

            {/* Core numbers */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="volumeAF">Volume (AF)</Label>
                <Input
                  id="volumeAF"
                  name="volumeAF"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pricePerAF">
                  {auction ? "Starting Price / AF ($)" : "Price per AF ($)"}
                </Label>
                <Input
                  id="pricePerAF"
                  name="pricePerAF"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                />
              </div>
            </div>

            {/* Type: only Sell */}
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                name="type"
                defaultValue="sell"
                required
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="sell">Sell</option>
              </select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Add context, district window, timing, terms..."
              />
            </div>

            {/* ---------- NEW: Auction Section ---------- */}
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">List as Auction</div>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Buyers can place bids. Optionally add a reserve price (minimum you’ll accept).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAuction((v) => !v)}
                  className={[
                    "h-9 rounded-xl px-3 text-sm font-medium ring-1",
                    auction
                      ? "bg-[#0E6A59] text-white ring-[#0E6A59]"
                      : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {auction ? "Auction Enabled" : "Enable Auction"}
                </button>
              </div>

              {/* Reserve appears only when auction is on */}
              {auction && (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="reservePrice">Reserve Price / AF ($)</Label>
                    <Input
                      id="reservePrice"
                      name="reservePrice"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="invisible block">_</Label>
                    <div className="text-xs text-slate-600">
                      Leave blank for <span className="font-medium">no reserve</span>.
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* ---------- /NEW Auction Section ---------- */}
          </CardContent>

          <CardFooter className="flex items-center gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? "Submitting..." : auction ? "Create Auction" : "Create"}
            </Button>
            {message && (
              <p className="text-sm text-gray-600" aria-live="polite">
                {message}
              </p>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
