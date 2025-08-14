// frontend/app/create-listing/[id]/parts/MakeOffer.tsx
"use client";
import { useMemo, useState } from "react";

type ListingLike = {
  id: string;
  acreFeet: number;    // available quantity
  pricePerAF: number;  // cents per AF in DB
  title?: string;
};

export default function MakeOffer({ listing }: { listing: ListingLike }) {
  // Start EMPTY so the user can type or leave blank until ready
  const [qtyStr, setQtyStr] = useState("");
  const [priceStr, setPriceStr] = useState(""); // dollars
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qty = useMemo(() => {
    if (qtyStr.trim() === "") return NaN;
    const n = Number(qtyStr);
    return Number.isFinite(n) ? Math.floor(n) : NaN;
  }, [qtyStr]);

  const priceDollars = useMemo(() => {
    if (priceStr.trim() === "") return NaN;
    const n = Number(priceStr);
    return Number.isFinite(n) ? n : NaN;
  }, [priceStr]);

  const totalDollars = useMemo(() => {
    if (!Number.isFinite(qty) || !Number.isFinite(priceDollars)) return NaN;
    return qty * priceDollars;
  }, [qty, priceDollars]);

  const qtyValid = Number.isFinite(qty) && qty >= 1 && qty <= listing.acreFeet;
  const priceValid = Number.isFinite(priceDollars) && priceDollars > 0;
  const canSubmit = qtyValid && priceValid && !sent && !submitting;

  function clampQtyInput(v: string) {
    if (v.trim() === "") return "";
    const clean = v.replace(/[^\d]/g, "");
    const normalized = clean.replace(/^0+(?=\d)/, "");
    return normalized;
  }

  function clampPriceInput(v: string) {
    if (v.trim() === "") return "";
    let clean = v.replace(/[^\d.]/g, "");
    const parts = clean.split(".");
    if (parts.length > 2) clean = `${parts[0]}.${parts.slice(1).join("")}`;
    const [intPart, decPart = ""] = clean.split(".");
    const dec = decPart.slice(0, 2); // max 2 decimals
    return decPart !== "" ? `${intPart}.${dec}` : intPart;
  }

  async function onOffer() {
    try {
      setSubmitting(true);
      setError(null);

      if (!qtyValid) throw new Error("Please enter a valid AF quantity.");
      if (!priceValid) throw new Error("Please enter a valid $/AF price.");

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          type: "OFFER",
          acreFeet: qty,            // integer AF
          pricePerAF: priceDollars, // dollars/AF; server converts to cents
        }),
      });

      if (!res.ok) {
        let msg = "Request failed";
        try {
          const j = await res.json();
          msg = j?.error || msg;
        } catch {
          msg = await res.text().catch(() => msg);
        }
        throw new Error(msg);
      }

      setSent(true);
    } catch (e: any) {
      setError(e?.message || "Failed to send offer");
      alert(e?.message || "Failed to send offer");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm font-medium">Make Offer</div>

      {listing.title ? (
        <div className="mt-1 text-sm text-slate-600">
          <span className="font-medium text-slate-900">{listing.title}</span>
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-sm">
          AF
          <div className="mt-1 relative">
            <input
              type="text"                // <-- text so it can be fully cleared
              inputMode="numeric"
              pattern="\d*"
              className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm outline-none ${
                qtyStr === "" ? "placeholder-slate-400" : ""
              }`}
              placeholder={`max ${listing.acreFeet}`}
              value={qtyStr}
              onChange={(e) => setQtyStr(clampQtyInput(e.target.value))}
              onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()} // prevent scroll changes
            />
            <span className="absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">
              AF
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Available: {listing.acreFeet.toLocaleString()} AF
          </div>
          {!qtyValid && qtyStr !== "" && (
            <div className="mt-1 text-xs text-red-600">
              Enter 1–{listing.acreFeet}
            </div>
          )}
        </label>

        <label className="text-sm">
          $ / AF
          <div className="mt-1 relative">
            <input
              type="text"                // <-- text so it can be fully cleared
              inputMode="decimal"
              className={`w-full rounded-lg border pl-7 pr-3 py-2 text-sm outline-none ${
                priceStr === "" ? "placeholder-slate-400" : ""
              }`}
              placeholder={(listing.pricePerAF / 100).toFixed(2)}
              value={priceStr}
              onChange={(e) => setPriceStr(clampPriceInput(e.target.value))}
              onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
            />
            <span className="absolute inset-y-0 left-3 flex items-center text-xs text-slate-500">
              $
            </span>
          </div>
          {!priceValid && priceStr !== "" && (
            <div className="mt-1 text-xs text-red-600">Enter a valid price</div>
          )}
        </label>
      </div>

      <div className="mt-3 text-sm text-slate-700">
        {Number.isFinite(totalDollars) ? (
          <>
            Total:{" "}
            <span className="font-medium">
              $
              {totalDollars.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </>
        ) : (
          <span className="text-slate-500">Total will appear here</span>
        )}
      </div>

      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}

      <button
        onClick={onOffer}
        disabled={!canSubmit}
        className="mt-3 h-10 w-full rounded-xl bg-black text-white disabled:opacity-50"
      >
        {sent ? "Offer Sent" : submitting ? "Submitting…" : "Submit Offer"}
      </button>
    </div>
  );
}
