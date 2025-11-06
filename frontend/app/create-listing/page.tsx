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
import { Button } from "@/components/ui/button";

const CTA_GREEN = "#004434";
const CTA_GREEN_HOVER = "#00392f";

const DISTRICTS = [
  "Westlands Water District",
  "San Luis Water District",
  "Panoche Water District",
  "Arvin Edison Water District",
];

const WESTLANDS = "Westlands Water District";

type WaterCodeOption = {
  id: string;
  code: string;
  year: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
};

type FarmOption = {
  id: string;
  name: string | null;
  accountNumber: string | null;
  district: string | null;
};

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

async function extractErrorMessage(res: Response) {
  const text = await res.text();
  if (!text) return "Failed to create listing.";
  try {
    const data = JSON.parse(text);
    if (data && typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }
  } catch {
    // ignore JSON parse error, fall through to text
  }
  return text;
}

function sanitizeContactInfo(text: string) {
  if (!text) return text;
  let sanitized = text.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    ""
  );
  sanitized = sanitized.replace(
    /(?:\+?\d{1,3}[\s().-]*)?(?:\(\s*\d{3}\s*\)|\d{3})[\s().-]*\d{3}[\s().-]*\d{4}/g,
    ""
  );
  return sanitized.replace(/[ \t]{2,}/g, " ");
}

function containsContactInfo(text: string) {
  if (!text) return false;
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) return true;
  if (/(?:\+?\d{1,3}[\s().-]*)?(?:\(\s*\d{3}\s*\)|\d{3})[\s().-]*\d{3}[\s().-]*\d{4}/.test(text)) {
    return true;
  }
  const digitCount = text.replace(/\D/g, "").length;
  return digitCount >= 10;
}

  export default function CreateListingPage() {
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [isAuction, setIsAuction] = React.useState(false);

  // Form state
  const [volumeAF, setVolumeAF] = React.useState<number | "">("");
  const [pricePerAF, setPricePerAF] = React.useState<number | "">("");
  const [waterType, setWaterType] = React.useState("");
  const [district, setDistrict] = React.useState("");

 const [waterCodes, setWaterCodes] = React.useState<WaterCodeOption[]>([]);
  const [waterCodesLoading, setWaterCodesLoading] = React.useState(false);
  const [waterCodeError, setWaterCodeError] = React.useState<string | null>(null);
  const [selectedWaterCodeId, setSelectedWaterCodeId] = React.useState<string>("custom");
  const [waterCodeValue, setWaterCodeValue] = React.useState("");
  const [waterCodeYear, setWaterCodeYear] = React.useState("");
  const [waterCodeDescriptionWarning, setWaterCodeDescriptionWarning] = React.useState<string | null>(null);

  const [farms, setFarms] = React.useState<FarmOption[]>([]);
  const [farmsLoading, setFarmsLoading] = React.useState(false);
  const [selectedSellerFarmId, setSelectedSellerFarmId] = React.useState<string>("");

  const groupedWaterCodes = React.useMemo(() => {
    if (!waterCodes.length) return [] as Array<[string, WaterCodeOption[]]>;
    const groups = new Map<string, WaterCodeOption[]>();
    for (const wc of waterCodes) {
      const key = (wc.category || "Other").trim() || "Other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(wc);
    }
    return Array.from(groups.entries()).map(([label, options]) => [
      label,
      options.slice().sort((a, b) => a.code.localeCompare(b.code)),
    ]) as Array<[string, WaterCodeOption[]]>;
  }, [waterCodes]);

  const selectedFarm = React.useMemo(
    () => farms.find((farm) => farm.id === selectedSellerFarmId) || null,
    [farms, selectedSellerFarmId]
  );
  
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
    let active = true;
    setFarmsLoading(true);
    fetch("/api/profile", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return (await res.json()) as { farms?: FarmOption[] };
      })
      .then((data) => {
        if (!active) return;
        const apiFarms = Array.isArray(data?.farms) ? data.farms : [];
        setFarms(
          apiFarms.map((f: any) => ({
            id: String(f.id ?? ""),
            name: f.name ?? null,
            accountNumber: f.accountNumber ?? null,
            district: f.district ?? null,
          }))
        );
      })
      .catch(() => {
        if (!active) return;
        setFarms([]);
      })
      .finally(() => {
        if (active) setFarmsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (district !== WESTLANDS) {
      setWaterCodes([]);
      setWaterCodeError(null);
      setWaterCodeDescriptionWarning(null);
      if (selectedWaterCodeId !== "custom") setSelectedWaterCodeId("custom");
      return;
    }

    let active = true;
    setWaterCodesLoading(true);
    setWaterCodeError(null);
    fetch(`/api/water-codes?district=${encodeURIComponent(WESTLANDS)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return (await res.json()) as { codes?: WaterCodeOption[] };
      })
      .then((data) => {
        if (!active) return;
        const codes = Array.isArray(data?.codes) ? data.codes : [];
        setWaterCodes(codes);
        if (codes.length && selectedWaterCodeId === "custom") {
          setSelectedWaterCodeId("");
        }
      })
      .catch((err: any) => {
        if (!active) return;
        setWaterCodes([]);
        setWaterCodeError(err?.message || "Unable to load water codes");
      })
      .finally(() => {
        if (active) setWaterCodesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [district, selectedWaterCodeId]);

  const applyWaterCodeSelection = React.useCallback(
    (id: string) => {
      if (!id || id === "custom") return;
      const match = waterCodes.find((w) => w.id === id);
      if (!match) return;
      setWaterCodeValue(match.code || "");
      setWaterCodeYear(match.year || "");
      const nextDescription = sanitizeContactInfo(match.description || "");
      setWaterCodeDescription(nextDescription);
      setWaterCodeDescriptionWarning(
        nextDescription !== (match.description || "")
          ? "Contact details were removed from this preset description."
          : null
      );
      const nextWaterType = match.category?.trim();
      if (nextWaterType) {
        setWaterType(nextWaterType);
      }
    },
    [waterCodes]
  );

  React.useEffect(() => {
    if (!selectedWaterCodeId || selectedWaterCodeId === "custom") return;
    applyWaterCodeSelection(selectedWaterCodeId);
  }, [applyWaterCodeSelection, selectedWaterCodeId]);
    
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

      const trimmedWaterCode = waterCodeValue.trim();
      const trimmedWaterYear = waterCodeYear.trim();
      const trimmedWaterDescription = waterCodeDescription.trim();
      if (trimmedWaterDescription && containsContactInfo(trimmedWaterDescription)) {
        setMessage("Please remove phone numbers or email addresses from the description.");
        setLoading(false);
        return;
      }
      if (selectedWaterCodeId && selectedWaterCodeId !== "custom") {
        payload.waterCodeId = selectedWaterCodeId;
      }
      if (trimmedWaterCode) payload.waterCodeValue = trimmedWaterCode;
      if (trimmedWaterYear) payload.waterCodeYear = trimmedWaterYear;
      if (trimmedWaterDescription) payload.waterCodeDescription = trimmedWaterDescription;
      if (selectedSellerFarmId) payload.sellerFarmId = selectedSellerFarmId;
      
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
        setVolumeAF("");
        setPricePerAF("");
        setWaterType("");
        setDistrict("");
        setWaterCodes([]);
        setWaterCodeError(null);
        setSelectedWaterCodeId("custom");
        setWaterCodeValue("");
        setWaterCodeYear("");
        setWaterCodeDescription("");
        setWaterCodeDescriptionWarning(null);
        setSelectedSellerFarmId("");
        setStartingBid("");
        setReservePrice("");
        const d = new Date();
        d.setHours(d.getHours() + 24);
        setEndDate(toLocalDatetimeInputValue(d));
      } else {
        const error = await extractErrorMessage(res);
        setMessage(error || "Failed to create listing.");
      }
    } catch (err: any) {
      setMessage(err?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  // UI helpers
  const waterCodeSelectValue =
    district === WESTLANDS ? (selectedWaterCodeId === "custom" ? "" : selectedWaterCodeId) : "custom";
  const hasPresetWaterCodes = district === WESTLANDS && waterCodes.length > 0;
  const isPresetWaterCodeSelected =
    hasPresetWaterCodes && Boolean(selectedWaterCodeId && selectedWaterCodeId !== "custom");
    
  const infoChips = [
    district && `District: ${district}`,
    waterType && `Type: ${waterType}`,
    volumeAF ? `${formatAcreFeet(volumeAF)} AF` : null,
    waterCodeValue && `Code: ${waterCodeValue}`,
    waterCodeYear && `Year: ${waterCodeYear}`,
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

              {/* Water code metadata */}
              <div className="space-y-4">
                {district === WESTLANDS ? (
                  <div className="space-y-2">
                    <Label htmlFor="waterCodeSelect">Westlands Water Code</Label>
                    <select
                      id="waterCodeSelect"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      value={waterCodeSelectValue}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (!next || next === "custom") {
                          setSelectedWaterCodeId("custom");
                          setWaterCodeDescriptionWarning(null);
                          return;
                        }
                        setSelectedWaterCodeId(next);
                        applyWaterCodeSelection(next);
                      }}
                      disabled={waterCodesLoading}
                    >
                      <option value="">Select a code…</option>
                      {groupedWaterCodes.map(([category, codes]) => (
                        <optgroup key={category} label={category}>
                          {codes.map((code) => (
                            <option key={code.id} value={code.id}>
                              {code.code} — {code.year}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      <option value="custom">Custom / Not listed</option>
                    </select>
                    {waterCodesLoading ? (
                      <p className="text-xs text-slate-500">Loading Westlands codes…</p>
                    ) : null}
                    {waterCodeError ? (
                      <p className="text-xs text-rose-600">{waterCodeError}</p>
                    ) : null}
                    <p className="text-xs text-slate-500">
                      Select a preset code or choose custom to enter your own details.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Enter the water code details for {district || "this district"}. Westlands codes will appear
                    automatically when that district is selected.
                  </p>
                )}
                <input
                  type="hidden"
                  name="waterCodeId"
                  value={selectedWaterCodeId !== "custom" ? selectedWaterCodeId : ""}
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="waterCodeValue">Water Code</Label>
                    <Input
                      id="waterCodeValue"
                      name="waterCodeValue"
                      placeholder="e.g. WC1802"
                      value={waterCodeValue}
                      onChange={(e) => {
                      const nextRaw = e.target.value;
                      const sanitized = sanitizeContactInfo(nextRaw);
                      if (sanitized !== nextRaw) {
                        setWaterCodeDescriptionWarning(
                          "Contact details are not allowed in the description and have been removed."
                        );
                      } else {
                        setWaterCodeDescriptionWarning(null);
                      }
                      setWaterCodeDescription(sanitized);
                        if (selectedWaterCodeId !== "custom") {
                          const match = waterCodes.find((w) => w.id === selectedWaterCodeId);
                        if (!match || (match.description || "") !== sanitized) setSelectedWaterCodeId("custom");
                        }
                      }}
                      readOnly={isPresetWaterCodeSelected}
                      disabled={isPresetWaterCodeSelected}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="waterCodeYear">Water Year</Label>
                    <Input
                      id="waterCodeYear"
                      name="waterCodeYear"
                      placeholder="e.g. 2024-25"
                      value={waterCodeYear}
                      onChange={(e) => {
                        const next = e.target.value;
                        setWaterCodeYear(next);
                        if (selectedWaterCodeId !== "custom") {
                          const match = waterCodes.find((w) => w.id === selectedWaterCodeId);
                          if (!match || match.year !== next) setSelectedWaterCodeId("custom");
                        }
                      }}
                      readOnly={isPresetWaterCodeSelected}
                      disabled={isPresetWaterCodeSelected}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="waterCodeDescription">Description</Label>
                  <Input
                    id="waterCodeDescription"
                    name="waterCodeDescription"
                    placeholder="e.g. SGMA Groundwater Allocation"
                    value={waterCodeDescription}
                    onChange={(e) => {
                      const next = e.target.value;
                      setWaterCodeDescription(next);
                      if (selectedWaterCodeId !== "custom") {
                        const match = waterCodes.find((w) => w.id === selectedWaterCodeId);
                        if (!match || (match.description || "") !== next) setSelectedWaterCodeId("custom");
                      }
                    }}
                    readOnly={isPresetWaterCodeSelected}
                    disabled={isPresetWaterCodeSelected}
                  />
                  {waterCodeDescriptionWarning ? (
                    <p className="text-xs text-amber-600">{waterCodeDescriptionWarning}</p>
                  ) : null}
                </div>
              </div>

              {/* Seller logistics */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sellerFarmId">Source Farm</Label>
                  <select
                    id="sellerFarmId"
                    name="sellerFarmId"
                    value={selectedSellerFarmId}
                    onChange={(e) => setSelectedSellerFarmId(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  >
                    <option value="">Select a farm</option>
                    {farms.map((farm) => (
                      <option key={farm.id} value={farm.id}>
                        {farm.name || "Unnamed Farm"}
                        {farm.accountNumber ? ` — ${farm.accountNumber}` : ""}
                      </option>
                    ))}
                  </select>
                  {farmsLoading ? (
                    <p className="text-xs text-slate-500">Loading your farms…</p>
                  ) : farms.length ? (
                    <p className="text-xs text-slate-500">Only you can see this reference.</p>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Add farms from your{" "}
                      <Link href="/profile/edit" className="text-emerald-700 underline">
                        profile
                      </Link>{" "}
                      to reference them here.
                    </p>
                  )}
                </div>

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
                      "relative flex h-10 w-20 items-center rounded-full border transition",
                      isAuction
                        ? "border-emerald-600 bg-emerald-500 text-white"
                        : "border-slate-300 bg-white text-slate-500",
                    ].join(" ")}
                    aria-pressed={isAuction}
                  >
                    <span
                      className={[
                        "absolute top-1 left-1 h-8 w-8 rounded-full bg-white shadow transition-all",
                        isAuction ? "translate-x-10" : "",
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


              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Water Code</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {waterCodeValue || "Not specified"}
                </div>
                {waterCodeYear ? (
                  <div className="text-xs text-slate-500">Water Year: {waterCodeYear}</div>
                ) : null}
                {waterCodeDescription ? (
                  <p className="mt-1 text-xs text-slate-600">{waterCodeDescription}</p>
                ) : null}
              </div>

              {selectedFarm && (
                <div className="rounded-lg border border-slate-200 p-3 space-y-1">
                  <div className="text-xs text-slate-500">Logistics</div>
                  <div className="text-sm text-slate-900">
                    Seller farm: {selectedFarm.name || "Unnamed Farm"}
                    {selectedFarm.accountNumber ? ` (#${selectedFarm.accountNumber})` : ""}
                  </div>
                </div>
              )}

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
