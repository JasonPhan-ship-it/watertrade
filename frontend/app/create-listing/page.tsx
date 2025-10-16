// app/create-listing/page.tsx
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

const DISTRICTS = [
  "Westlands Water District",
  "San Luis Water District",
  "Panoche Water District",
  "Arvin Edison Water District",
];

function toLocalDatetimeInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function formatAcreFeet(value: number | "" | null | undefined) {
  if (value === "" || value == null) return "";
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num)) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(num);
}

export default function CreateListingPage() {
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [isAuction, setIsAuction] = React.useState(false);

  // Form state
  const [description, setDescription] = React.useState("");
  const [volumeAF, setVolumeAF] = React.useState<number | "">("");
  const [pricePerAF, setPricePerAF] = React.useState<number | "">("");
  const [waterType, setWaterType] = React.useState("");
  const [district, setDistrict] = React.useState("");

  // Auction-specific
  const [startingBid, setStartingBid] = React.useState<number | "">("");
  const [reservePrice, setReservePrice] = React.useState<number | "">("");
  const [endDate, setEndDate] = React.useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 24);
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
      // Basic sanity checks
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

      // Build payload
      const formData = new FormData(formEl);
      const volumeLabel = volumeAF ? `${formatAcreFeet(volumeAF)} AF` : "";
      const derivedTitle = [district.trim(), waterType.trim(), volumeLabel]
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
    volumeAF ? `${formatAcreFeet(volumeAF)} AF` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        {/* Left: Form */}
        <Card className="md:col-span-1">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl font-semibold text-slate-900">
              Create a Listing
            </CardTitle>
            <p className="text-sm text-slate-500">
              Share your available water, set pricing or open an auction, and publish in minutes.
            </p>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              {/* District + Water Type */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="district">Water District</Label>
                  <Input
                    id="district"
                    name="district"
                    list="district-list"
                    placeholder="e.g. Westlands Water District"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    required
                  />
                  <datalist id="district-list">
                    {DISTRICTS.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="waterType">Water Type</Label>
                  <Input
                    id="waterType"
                    name="waterType"
                    placeholder="e.g. CVP, SWP, Well"
                    value={waterType}
                    onChange={(e) => setWaterType(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Key details buyers should know (source, delivery, timing)…"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* Volume + Pricing toggle */}
              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <Label htmlFor="volumeAF">Volume (acre-feet)</Label>
                  <Input
                    id="volumeAF"
                    name="volumeAF"
                    type="number"
                    inputMode="decimal"
                    min={1}
                    step={1}
                    placeholder="e.g. 1500"
                    value={volumeAF}
                    onChange={(e) =>
                      setVolumeAF(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label className="block text-sm font-medium text-slate-700">Auction?</Label>
                  <button
                    type="button"
                    onClick={() => setIsAuction((prev) => !prev)}
                    className={[
                      "relative flex h-10 w-16 items-center rounded-full border transition",
                      isAuction
                        ? "border-emerald-600 bg-emerald-500 text-white"
                        : "border-slate-300 bg-white text-slate-500",
                    ].join(" ")}
                    aria-pressed={isAuction}
                  >
                    <span
                      className={[
                        "absolute top-1 left-1 h-8 w-8 rounded-full bg-white shadow transition-all",
                        isAuction ? "translate-x-6" : "",
                      ].join(" ")}
                    />
                    <span className="mx-auto text-xs font-semibold uppercase tracking-wide">
                      {isAuction ? "Yes" : "No"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Fixed Price vs Auction Fields */}
              <div className="space-y-4">
                {!isAuction ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="pricePerAF">Price per AF ($)</Label>
                      <Input
                        id="pricePerAF"
                        name="pricePerAF"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        placeholder="e.g. 750"
                        value={pricePerAF}
                        onChange={(e) =>
                          setPricePerAF(e.target.value === "" ? "" : Number(e.target.value))
                        }
                        required={!isAuction}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="startingBid">Starting Bid ($/AF)</Label>
                        <Input
                          id="startingBid"
                          name="startingBid"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          placeholder="e.g. 500"
                          value={startingBid}
                          onChange={(e) =>
                            setStartingBid(e.target.value === "" ? "" : Number(e.target.value))
                          }
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reservePrice">Reserve Price ($/AF)</Label>
                        <Input
                          id="reservePrice"
                          name="reservePrice"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={1}
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
                  </div>
                )}
              </div>
            </CardContent>

            {/* Footer: disclaimer + button with spacing/link */}
            <CardFooter className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-xs text-slate-500">
                By creating a listing you agree to our{" "}
                <Link href="/rules" className="text-[#004434] underline hover:text-[#00392f]">
                  terms and marketplace rules
                </Link>
                .
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
                {[district, waterType, volumeAF ? `${formatAcreFeet(volumeAF)} AF` : ""]
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
