"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// Optional suggestions (free-text is allowed)
const DISTRICTS = [
  "Westlands Water District",
  "San Luis Water District",
  "Panoche Water District",
  "Arvin Edison Water District",
];

type DurationUnit = "hours" | "days";

export default function CreateListingPage() {
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [auction, setAuction] = React.useState(false);

  // NEW: auction duration controls
  const [auctionDuration, setAuctionDuration] = React.useState<number>(24); // sensible default
  const [auctionDurationUnit, setAuctionDurationUnit] = React.useState<DurationUnit>("hours");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const formEl = e.currentTarget;

    try {
      const formData = new FormData(formEl);

      const title = String(formData.get("title") || "");
      const description = String(formData.get("description") || "");
      const volumeAF = Number(formData.get("volumeAF") || 0);
      const pricePerAF = Number(formData.get("pricePerAF") || 0); // dollars in UI; convert server-side
      const district = String(formData.get("district") || "");

      // Build auctionEndsAt if auction is enabled
      let auctionEndsAt: string | null = null;
      if (auction) {
        const n = Number(auctionDuration);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error("Please enter a valid auction duration greater than 0.");
        }
        const now = new Date();
        if (auctionDurationUnit === "days") {
          now.setUTCDate(now.getUTCDate() + n);
        } else {
          // hours
          now.setUTCHours(now.getUTCHours() + n);
        }
        auctionEndsAt = now.toISOString();
      }

      // Reserve price (optional)
      const reserveRaw = formData.get("reservePrice");
      const reservePrice =
        auction && reserveRaw != null && String(reserveRaw).trim() !== ""
          ? Number(reserveRaw)
          : null;

      // Basic client-side validation
      if (!title.trim()) throw new Error("Title is required.");
      if (!district.trim()) throw new Error("Water District is required.");
      if (!volumeAF || volumeAF <= 0) throw new Error("Volume (AF) must be greater than 0.");
      if (!auction && (!pricePerAF || pricePerAF <= 0)) {
        throw new Error("Price per AF must be greater than 0 for non-auction listings.");
      }
      if (auction && !auctionEndsAt) {
        throw new Error("Auction duration must be specified.");
      }

      const payload = {
        title,
        description,
        volumeAF,
        pricePerAF, // starting price if auction
        type: "sell", // only sell for now
        district,

        // auction fields
        isAuction: auction,
        reservePrice,       // dollars (server converts to cents)
        auctionEndsAt,      // ISO (server should validate > now)
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
      setAuctionDuration(24);
      setAuctionDurationUnit("hours");
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

            {/* Type: only Sell (kept for future flexibility) */}
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

            {/* ---------- Auction Section ---------- */}
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">List as Auction</div>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Buyers can place bids. Set starting price, optional reserve, and how long the auction runs.
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

              {auction && (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {/* Reserve price (optional) */}
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

                  {/* Auction duration numeric */}
                  <div className="space-y-2">
                    <Label htmlFor="auctionDuration">Auction Length</Label>
                    <Input
                      id="auctionDuration"
                      name="auctionDuration"
                      type="number"
                      min={1}
                      step="1"
                      value={auctionDuration}
                      onChange={(e) => setAuctionDuration(Number(e.target.value))}
                      required
                    />
                  </div>

                  {/* Auction duration unit */}
                  <div className="space-y-2">
                    <Label htmlFor="auctionDurationUnit" className="invisible">
                      Unit
                    </Label>
                    <select
                      id="auctionDurationUnit"
                      name="auctionDurationUnit"
                      value={auctionDurationUnit}
                      onChange={(e) => setAuctionDurationUnit(e.target.value as DurationUnit)}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            {/* ---------- /Auction Section ---------- */}
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
