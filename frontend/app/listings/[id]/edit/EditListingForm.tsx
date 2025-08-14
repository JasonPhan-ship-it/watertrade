// app/listings/[id]/edit/EditListingForm.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";

const DISTRICTS = ["Westlands Water District","San Luis Water District","Panoche Water District","Arvin Edison Water District"] as const;
const WATER_TYPES = ["CVP Allocation","Pumping Credits","Supplemental Water"] as const;

type ListingForm = {
  id: string;
  title: string;
  description: string;
  district: string;
  waterType: string;
  availabilityStartISO: string;
  availabilityEndISO: string;
  acreFeet: number;
  pricePerAF: number; // cents
  isAuction: boolean;
  reservePrice: number | null; // cents
  auctionEndsAtISO: string;
};

function toDateInput(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.valueOf())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function EditListingForm({ listing }: { listing: ListingForm }) {
  const router = useRouter();

  // string states so users can clear inputs
  const [title, setTitle] = React.useState(listing.title);
  const [description, setDescription] = React.useState(listing.description);
  const [district, setDistrict] = React.useState(listing.district);
  const [waterType, setWaterType] = React.useState(listing.waterType);
  const [startStr, setStartStr] = React.useState(toDateInput(listing.availabilityStartISO));
  const [endStr, setEndStr] = React.useState(toDateInput(listing.availabilityEndISO));
  const [acreFeetStr, setAcreFeetStr] = React.useState(String(listing.acreFeet));
  const [priceStr, setPriceStr] = React.useState((listing.pricePerAF / 100).toFixed(2)); // dollars
  const [isAuction, setIsAuction] = React.useState(listing.isAuction);
  const [reserveStr, setReserveStr] = React.useState(
    listing.reservePrice != null ? (listing.reservePrice / 100).toFixed(2) : ""
  ); // dollars
  const [endsStr, setEndsStr] = React.useState(toDateInput(listing.auctionEndsAtISO));

  const [submitting, setSubmitting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  function clampInt(v: string) {
    if (v.trim() === "") return "";
    return v.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
  }
  function clampMoney(v: string) {
    if (v.trim() === "") return "";
    let clean = v.replace(/[^\d.]/g, "");
    const parts = clean.split(".");
    if (parts.length > 2) clean = `${parts[0]}.${parts.slice(1).join("")}`;
    const [i, d = ""] = clean.split(".");
    return d ? `${i}.${d.slice(0, 2)}` : i;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);

    try {
      const payload: any = {
        title,
        description,
        district,
        waterType,
      };

      if (startStr) payload.availabilityStart = new Date(startStr).toISOString();
      if (endStr) payload.availabilityEnd = new Date(endStr).toISOString();
      if (acreFeetStr) payload.acreFeet = Number(acreFeetStr);
      if (priceStr) payload.pricePerAF = Number(priceStr); // dollars -> server converts

      payload.isAuction = isAuction;
      if (reserveStr) payload.reservePrice = Number(reserveStr); // dollars
      if (endsStr) payload.auctionEndsAt = new Date(endsStr).toISOString();

      const res = await fetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let msg = "Update failed";
        try {
          const j = await res.json();
          msg = j?.error || msg;
        } catch {
          msg = await res.text().catch(() => msg);
        }
        throw new Error(msg);
      }

      // Back to detail page
      router.replace(`/create-listing/${listing.id}`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Failed to update listing");
      alert(e?.message || "Failed to update listing");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Title
          <input className="mt-1 w-full rounded-lg border px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="text-sm">
          District
          <select className="mt-1 w-full rounded-lg border px-3 py-2" value={district} onChange={(e) => setDistrict(e.target.value)}>
            <option value="">Select…</option>
            {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      </div>

      <label className="text-sm block">
        Description
        <textarea className="mt-1 w-full rounded-lg border px-3 py-2" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="text-sm">
          Water Type
          <select className="mt-1 w-full rounded-lg border px-3 py-2" value={waterType} onChange={(e) => setWaterType(e.target.value)}>
            <option value="">Select…</option>
            {WATER_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Availability Start
          <input type="date" className="mt-1 w-full rounded-lg border px-3 py-2" value={startStr} onChange={(e) => setStartStr(e.target.value)} />
        </label>
        <label className="text-sm">
          Availability End
          <input type="date" className="mt-1 w-full rounded-lg border px-3 py-2" value={endStr} onChange={(e) => setEndStr(e.target.value)} />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="text-sm">
          Acre-Feet
          <input
            type="text"
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border px-3 py-2"
            value={acreFeetStr}
            onChange={(e) => setAcreFeetStr(clampInt(e.target.value))}
            placeholder="e.g. 250"
          />
        </label>
        <label className="text-sm">
          Price / AF (USD)
          <input
            type="text"
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border px-3 py-2"
            value={priceStr}
            onChange={(e) => setPriceStr(clampMoney(e.target.value))}
            placeholder="e.g. 650.00"
          />
        </label>
        <div className="flex items-end">
          <div className="text-sm text-slate-600">
            Total:{" "}
            <span className="font-medium">
              $
              {Number(acreFeetStr || 0) * Number(priceStr || 0) > 0
                ? (Number(acreFeetStr) * Number(priceStr)).toLocaleString(undefined, { minimumFractionDigits: 2 })
                : "0.00"}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border p-3 space-y-3">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isAuction} onChange={(e) => setIsAuction(e.target.checked)} />
          <span>Run as auction</span>
        </label>

        {isAuction && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Reserve Price (USD / AF)
              <input
                type="text"
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={reserveStr}
                onChange={(e) => setReserveStr(clampMoney(e.target.value))}
                placeholder="optional"
              />
            </label>
            <label className="text-sm">
              Auction Ends
              <input
                type="date"
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={endsStr}
                onChange={(e) => setEndsStr(e.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-[#004434] px-5 py-2 text-white hover:bg-[#003a2f] disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/create-listing/${listing.id}`)}
          className="rounded-xl border px-5 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
