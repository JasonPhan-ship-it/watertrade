// components/ListingActions.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Kind = "SELL" | "BUY";
type Mode = "BUY_NOW" | "SELL_NOW" | "OFFER" | "BID";

type Props = {
  listingId: string;
  kind: Kind;                  // SELL = you're buying from seller; BUY = you're selling to buyer
  pricePerAf: number;          // dollars (already converted from cents)
  isAuction?: boolean;
  reservePrice?: number | null; // dollars, if applicable
  /** Where Cancel should land. Update if your listings tab is different. */
  cancelHref?: string;          // default: "/dashboard?tab=listings"
};

export default function ListingActions({
  listingId,
  kind,
  pricePerAf,
  isAuction = false,
  reservePrice = null,
  cancelHref = "/dashboard?tab=listings",
}: Props) {
  const router = useRouter();

  const [mode, setMode] = React.useState<Mode>(() =>
    kind === "SELL" ? "BUY_NOW" : "SELL_NOW"
  );

  // Inputs ONLY for OFFER / BID
  const [acreFeetInput, setAcreFeetInput] = React.useState<string>("1");
  const parsedAcreFeet = React.useMemo(() => parseIntegerInput(acreFeetInput), [acreFeetInput]);
  const acreFeet = React.useMemo(() => {
    if (parsedAcreFeet == null) return 0;
    return Math.max(0, parsedAcreFeet);
  }, [parsedAcreFeet]);
  const [priceInput, setPriceInput] = React.useState<string>(() => {
    const base = isAuction ? (reservePrice ?? pricePerAf) : pricePerAf;
    return round2(base).toFixed(2);
  });
  const parsedPrice = React.useMemo(() => parsePriceInput(priceInput), [priceInput]);

  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const total = React.useMemo(
    () => round2(Math.max(0, acreFeet) * (parsedPrice ?? 0)),
    [acreFeet, parsedPrice]
  );

  React.useEffect(() => {
    if (mode === "OFFER") setPriceInput(round2(pricePerAf).toFixed(2));
    if (mode === "BID") setPriceInput(round2(reservePrice ?? pricePerAf).toFixed(2));
  }, [mode, pricePerAf, reservePrice]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setMessage(null);

    try {
      if (mode === "OFFER" || mode === "BID") {
        if (parsedAcreFeet == null || parsedAcreFeet < 1) {
          setMessage("Enter at least 1 acre-foot.");
          return;
        }

        if (parsedPrice == null) {
          setMessage("Enter a valid price per acre-foot.");
          return;
        }

        if (parsedPrice <= 0) {
          setMessage("Enter a valid price per acre-foot.");
          return;
        }

        if (mode === "BID" && parsedPrice < minBid) {
          setMessage(`Your bid must be at least ${format2(minBid)} / AF.`);
          return;
        }
      }

      if (mode === "BUY_NOW" || mode === "SELL_NOW") {
        const res = await fetch(
          `/api/transactions/buy-now?listingId=${encodeURIComponent(listingId)}`,
          { method: "POST", credentials: "include" }
        );

        let data: any = null;
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) data = await res.json().catch(() => ({} as any));
        else data = await res.text().catch(() => "");

        if (!res.ok) {
          const msg = (typeof data === "string" ? data : data?.error) || "Failed to start Buy Now";
          throw new Error(msg);
        }

        const location = res.headers.get("Location");
        if (location) router.push(location);
        else {
          const id = typeof data === "object" ? data?.id : undefined;
          if (!id) throw new Error("Missing transaction id from server.");
          router.push(`/transactions/${id}?action=review`);
        }
        return;
      }

      if (mode === "OFFER") {
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            type: "OFFER",
            listingId,
            acreFeet: parsedAcreFeet!,
            pricePerAF: parsedPrice!,
          }),
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data?.error || "Offer failed");
        setMessage("Offer sent!");
        return;
      }

      if (mode === "BID") {
        const res = await fetch("/api/auctions/bid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            listingId,
            acreFeet: parsedAcreFeet!,
            pricePerAF: parsedPrice!,
          }),
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data?.error || "Bid failed");
        setMessage("Bid placed");
        return;
      }
    } catch (err: any) {
      setMessage(err?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const onCancel = React.useCallback(() => {
    // If we navigated from create page, skip going back there.
    const ref = typeof document !== "undefined" ? document.referrer : "";
    const fromCreate = ref.includes("/listings/create");

    // If there is history and we didn't come from create, go back.
    if (typeof window !== "undefined" && window.history.length > 1 && !fromCreate) {
      router.back();
      return;
    }

    // Otherwise, force a deterministic dashboard listings URL.
    router.replace(cancelHref);
  }, [router, cancelHref]);

  const canBuyNow = kind === "SELL";
  const canSellNow = kind === "BUY";
  const minBid = reservePrice ?? pricePerAf;

  const isFixed = mode === "BUY_NOW" || mode === "SELL_NOW";
  const showInputs = mode === "OFFER" || mode === "BID";

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {canBuyNow && (
          <Tab selected={mode === "BUY_NOW"} onClick={() => setMode("BUY_NOW")}>
            Buy Now
          </Tab>
        )}
        {canSellNow && (
          <Tab selected={mode === "SELL_NOW"} onClick={() => setMode("SELL_NOW")}>
            Sell to Buyer
          </Tab>
        )}
        <Tab selected={mode === "OFFER"} onClick={() => setMode("OFFER")}>
          Make Offer
        </Tab>
        {isAuction && (
          <Tab selected={mode === "BID"} onClick={() => setMode("BID")}>
            Place Bid
          </Tab>
        )}
      </div>

      {/* Form */}
      <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* BUY/SELL NOW: price only */}
        {isFixed && (
          <div className="sm:col-span-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px]">
                <label className="block">
                  <div className="text-xs text-emerald-700/80">Price $/AF</div>
                  <div className="mt-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-medium text-emerald-900">
                    ${format2(pricePerAf)}
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* OFFER / BID inputs */}
        {showInputs && (
          <>
            <Field label="Acre-Feet">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                value={acreFeetInput}
                placeholder="1"
                onChange={(e) => setAcreFeetInput(sanitizeIntegerInput(e.target.value))}
                onBlur={() => setAcreFeetInput((prev) => normalizeIntegerInput(prev))}
                className="w-full rounded-lg border border-emerald-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </Field>

            <Field label={mode === "BID" ? "Your Bid $/AF" : "Price $/AF"}>
              <input
                type="text"
                inputMode="decimal"
                required
                value={priceInput}
                placeholder={round2(mode === "BID" ? minBid : pricePerAf).toFixed(2)}
                onChange={(e) => setPriceInput(sanitizeDecimalInput(e.target.value))}
                onBlur={() => setPriceInput((prev) => normalizeDecimalInput(prev))}
                className="w-full rounded-lg border border-emerald-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              {mode === "BID" && (
                <p className="mt-1 text-xs text-emerald-700/80">
                  Minimum: ${format2(minBid)} / AF
                </p>
              )}
            </Field>

            <Field label="Estimated Total">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-medium text-emerald-900">
                ${format2(total)}
              </div>
            </Field>
          </>
        )}

        <div className="sm:col-span-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? actionText(mode) + "…" : actionText(mode)}
          </button>

          {/* Cancel -> go back OR force dashboard listings */}
          <button
            type="button"
            formNoValidate
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-300 px-5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            aria-label="Cancel and go back to Your Listing dashboard"
          >
            Cancel
          </button>

          {message && <p className="text-sm text-emerald-800">{message}</p>}
        </div>
      </form>
    </div>
  );
}

/* ----------------- helpers & bits ----------------- */

async function safeJson(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function Tab({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "h-9 rounded-full px-4 text-sm transition-colors " +
        (selected
          ? "bg-emerald-600 text-white"
          : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200")
      }
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-emerald-700/80">{label}</div>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function sanitizeIntegerInput(value: string) {
  return value.replace(/\D+/g, "");
}

function normalizeIntegerInput(value: string) {
  const digits = sanitizeIntegerInput(value);
  if (!digits) return "";
  return String(Number.parseInt(digits, 10));
}

function parseIntegerInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function sanitizeDecimalInput(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  const whole = cleaned.slice(0, firstDot);
  const decimals = cleaned
    .slice(firstDot + 1)
    .replace(/\./g, "")
    .slice(0, 2);
  return `${whole}.${decimals}`;
}

function normalizeDecimalInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/[0-9]/.test(trimmed)) return "";
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return "";
  return round2(parsed).toFixed(2);
}

function parsePriceInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/[0-9]/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return round2(parsed);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function format2(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function actionText(mode: Mode) {
  switch (mode) {
    case "BUY_NOW":
      return "Buy Now";
    case "SELL_NOW":
      return "Sell Now";
    case "OFFER":
      return "Send Offer";
    case "BID":
      return "Place Bid";
  }
}
