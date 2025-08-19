"use client";

import * as React from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const CTA_GREEN = "#004434";
const CTA_GREEN_HOVER = "#00392f";

// Optional: common districts for suggestions (free-text still allowed)
const DISTRICTS = [
  "Westlands Water District",
  "San Luis Water District",
  "Panoche Water District",
  "Arvin Edison Water District",
];

function toLocalDatetimeInputValue(d: Date) {
  // Format: YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export default function CreateListingPage() {
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [isAuction, setIsAuction] = React.useState(false);

  // Form state (for live preview + sensible defaults)
  const [description, setDescription] = React.useState("");
  const [volumeAF, setVolumeAF] = React.useState<number | "">("");
  const [pricePerAF, setPricePerAF] = React.useState<number | "">("");
  const [waterType, setWaterType] = React.useState("");
  const [district, setDistrict] = React.useState("");

  // Auction-specific state
  const [startingBid, setStartingBid] = React.useState<number | "">("");
  const [reservePrice, setReservePrice] = React.useState<number | "">("");
  const [endDate, setEndDate] = React.useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 24); // default: +24h
    return toLocalDatetimeInputValue(d);
  });

  // Countdown preview for auctions
  const [countdown, setCountdown] = React.useState<string>("");

  React.useEffect(() => {
    if (!isAuction || !endDate) {
      setCountdown("");
      return;
    }
    const tick = () => {
      const now = new Date();
      const end = new Date(endDate);
      const diff = end.getTime() - now.getTime();
      if (Number.isNaN(diff) || diff <= 0) {
        setCountdown("Auction ended");
        return;
      }
      const s = Math.floor(diff / 1000);
      const days = Math.floor(s / 86400);
      const hrs = Math.floor((s % 86400) / 3600);
      const mins = Math.floor((s % 3600) / 60);
      const secs = s % 60;
      const parts = [
        days ? `${days}d` : null,
        hrs ? `${hrs}h` : null,
        mins ? `${mins}m` : null,
        `${secs}s`,
      ].filter(Boolean);
      setCountdown(parts.join(" "));
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isAuction, endDate]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const formEl = e.currentTarget;

    try {
      // Basic client-side sanity checks
      if (!district.trim() || !waterType.trim()) {
        throw new Error("Please provide both Water District and Water Type.");
      }
      if (!volumeAF || Number(volumeAF) <= 0) {
        throw new Error("Volume (acre-feet) must be greater than 0.");
      }
      if (!isAuction) {
        if (!pricePerAF || Number(pricePerAF) <= 0) {
          throw new Error("Price per AF must be greater than 0.");
        }
      } else {
        if (!startingBid || Number(startingBid) < 0) {
          throw new Error("Starting bid must be 0 or greater.");
        }
        if (reservePrice !== "" && Number(reservePrice) < 0) {
          throw new Error("Reserve price cannot be negative.");
        }
        if (!endDate) {
          throw new Error("Please choose an auction end date/time.");
        }
        const end = new Date(endDate);
        if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) {
          throw new Error("Auction end time must be in the future.");
        }
      }

      // Build payload from FormData (but we're using controlled state anyway)
      const formData = new FormData(formEl);

      // Generate a clean title for backend (UI has no title field)
      const derivedTitle = [
        district.trim(),
        waterType.trim(),
        volumeAF ? `${volumeAF} AF` : "",
      ]
        .filter(Boolean)
        .join(" • ");

      const payload: any = {
        title: derivedTitle,
        description: String(formData.get("description") || description || ""),
        volumeAF: Number(formData.get("volumeAF") || volumeAF || 0),
        waterType: String(formData.get("waterType") || waterType || ""),
        district: String(formData.get("district") || district || ""),
        isAuction,
      };

      if (isAuction) {
        payload.startingBid = Number(formData.get("startingBid") || startingBid || 0);
        payload.reservePrice =
          formData.get("reservePrice") !== null && String(formData.get("reservePrice")).trim() !== ""
            ? Number(formData.get("reservePrice"))
            : reservePrice === "" ? undefined : Number(reservePrice);
        payload.endDate = String(formData.get("endDate") || endDate || "");
      } else {
        payload.pricePerAF = Number(formData.get("pricePerAF") || pricePerAF || 0);
      }

      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setMessage("✅ Listing created successfully!");
        formEl.reset();
        // Reset local state
        setIsAuction(false);
        setDescription("");
        setVolumeAF("");
        setPricePerAF("");
        setWaterType("");
        setDistrict("");
        setStartingBid("");
        setReservePrice("");
        const d = new Date();
        d.setHours(d.getHours() + 24);
        setEndDate(toLocalDatetimeInputValue(d));
      } else {
        const error = await res.text();
        setMessage(error || "Failed to create listing.");
      }
    } catch (err: any) {
      setMessage(err?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  // UI helpers
  const infoChips = [
    district && `District: ${district}`,
    waterType && `Type: ${waterType}`,
    volumeAF && `${volumeAF} AF`,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-4">
      {/* Top actions */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Create Listing</h1>
        <Link href="/dashboard" className="shrink-0">
          <Button variant="outline">← Back to Dashboard</Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left: Form */}
        <Card className="md:col-span-2">
          <form onSubmit={handleSubmit}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Listing Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={5}
                  placeholder="Brief details, availability window, transfer notes, eligibility, etc."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
                <p className="mt-1 text-xs text-slate-500">
                  Be concise and factual. Avoid sharing sensitive information.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="district">Water District</Label>
                  <Input
                    id="district"
                    name="district"
                    list="district-options"
                    placeholder="Start typing…"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    required
                  />
                  <datalist id="district-options">
                    {DISTRICTS.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <Label htmlFor="waterType">Water Type</Label>
                  <Input
                    id="waterType"
                    name="waterType"
                    placeholder="e.g., CVP, SWP, Groundwater, etc."
                    value={waterType}
                    onChange={(e) => setWaterType(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="volumeAF">Volume (acre-feet)</Label>
                  <Input
                    id="volumeAF"
                    name="volumeAF"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="1"
                    placeholder="e.g., 50"
                    value={volumeAF}
                    onChange={(e) => setVolumeAF(e.target.value === "" ? "" : Number(e.target.value))}
                    required
                  />
                </div>

                {/* Fixed-price only shows when not auction */}
                {!isAuction && (
                  <div>
                    <Label htmlFor="pricePerAF">Price per AF ($)</Label>
                    <Input
                      id="pricePerAF"
                      name="pricePerAF"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      placeholder="e.g., 450.00"
                      value={pricePerAF}
                      onChange={(e) =>
                        setPricePerAF(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      required
                    />
                  </div>
                )}
              </div>

              {/* Auction toggle */}
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Auction</div>
                    <p className="mt-1 text-xs text-slate-500">
                      Enable bidding to let the market set price. Fixed “Price per AF” is hidden while auction is enabled.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isAuction"
                      checked={isAuction}
                      onChange={(e) => setIsAuction(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="isAuction" className="text-sm">
                      Sell via Auction
                    </Label>
                  </div>
                </div>

                {isAuction && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="startingBid">Starting Bid ($)</Label>
                      <Input
                        id="startingBid"
                        name="startingBid"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        placeholder="e.g., 200.00"
                        value={startingBid}
                        onChange={(e) =>
                          setStartingBid(e.target.value === "" ? "" : Number(e.target.value))
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="reservePrice">Reserve Price ($)</Label>
                      <Input
                        id="reservePrice"
                        name="reservePrice"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        placeholder="Optional"
                        value={reservePrice}
                        onChange={(e) =>
                          setReservePrice(e.target.value === "" ? "" : Number(e.target.value))
                        }
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Optional minimum you’re willing to accept.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="endDate">Auction End</Label>
                      <Input
                        id="endDate"
                        name="endDate"
                        type="datetime-local"
                        min={toLocalDatetimeInputValue(new Date())}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="justify-between">
              <div className="text-xs text-slate-500">
                By creating a listing you agree to our terms and marketplace rules.
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="bg-[var(--cta,theme(colors.emerald.900))]"
                style={{ backgroundColor: CTA_GREEN }}
                onMouseOver={(e) => ((e.currentTarget.style.backgroundColor = CTA_GREEN_HOVER))}
                onMouseOut={(e) => ((e.currentTarget.style.backgroundColor = CTA_GREEN))}
              >
                {loading ? "Creating…" : "Create Listing"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Right: Live preview */}
        <div className="space-y-4 md:col-span-1">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Generated Title */}
              <div className="text-sm font-semibold text-slate-900">
                {[district, waterType, volumeAF ? `${volumeAF} AF` : ""]
                  .filter(Boolean)
                  .join(" • ") || "Listing title will appear here"}
              </div>

              {/* Chips */}
              {infoChips.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {infoChips.map((c, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}

              {/* Price vs Auction */}
              {!isAuction ? (
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Fixed Price</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {pricePerAF ? `$${Number(pricePerAF).toFixed(2)} / AF` : "—"}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-xs font-semibold text-emerald-900">Auction</div>
                  <div className="mt-1 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-slate-500">Starting Bid</div>
                      <div className="font-medium">
                        {startingBid !== "" ? `$${Number(startingBid).toFixed(2)}` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Reserve</div>
                      <div className="font-medium">
                        {reservePrice !== "" ? `$${Number(reservePrice).toFixed(2)}` : "None"}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-slate-500">Ends</div>
                      <div className="font-medium">
                        {endDate ? new Date(endDate).toLocaleString() : "—"}
                      </div>
                      <div className="mt-1 text-xs text-emerald-900">
                        {countdown ? `⏳ ${countdown}` : ""}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Description</div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-slate-900">
                  {description || "Brief listing details will appear here."}
                </div>
              </div>
            </CardContent>
          </Card>

          {message && (
            <div
              className={[
                "rounded-xl border p-3 text-sm",
                message.startsWith("✅")
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-red-200 bg-red-50 text-red-700",
              ].join(" ")}
            >
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
