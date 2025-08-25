// components/trade/CounterButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** Endpoint to POST the counter to, e.g. /api/trades/{id}/counter or /api/transactions/{id}/counter */
  endpoint: string;
  /** Current offer price per AF in CENTS (for validation) */
  currentPriceCents: number;
  /** Current quantity (AF) – optional, used to prefill and basic validation */
  currentQty?: number;
  /** Optional: button label */
  label?: string;
  /** Optional: extra classes for the trigger */
  className?: string;
};

export default function CounterButton({
  endpoint,
  currentPriceCents,
  currentQty = 0,
  label = "Counter",
  className,
}: Props) {
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [priceUsd, setPriceUsd] = React.useState<string>(
    (currentPriceCents / 100).toString()
  );
  const [qty, setQty] = React.useState<string>(currentQty ? String(currentQty) : "");
  const [showSuccess, setShowSuccess] = React.useState(false);

  function reset() {
    setErr(null);
    setBusy(false);
    setPriceUsd((currentPriceCents / 100).toString());
    setQty(currentQty ? String(currentQty) : "");
  }

  function closeModal() {
    setOpen(false);
    reset();
  }

  // basic client-side validation
  const parsedPrice = Number(priceUsd);
  const parsedQty = Number(qty);
  const minPriceUsd = currentPriceCents / 100;

  const priceTooLow = !Number.isFinite(parsedPrice) || parsedPrice < minPriceUsd;
  const qtyInvalid = !Number.isFinite(parsedQty) || parsedQty <= 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (priceTooLow || qtyInvalid) {
      setErr(
        priceTooLow
          ? `Price must be at least $${minPriceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per AF.`
          : "Quantity must be a positive number."
      );
      return;
    }

    try {
      setBusy(true);
      setErr(null);

      const body = {
        pricePerAF: Math.round(parsedPrice * 100), // send as cents
        acreFeet: parsedQty,
      };

      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let message = "Counter failed.";
        try {
          const j = await res.json();
          message = j?.error || message;
        } catch {
          message = (await res.text()) || message;
        }
        throw new Error(message);
      }

      setOpen(false);
      setShowSuccess(true);
    } catch (e: any) {
      setErr(e?.message || "Something went wrong submitting the counter.");
    } finally {
      setBusy(false);
    }
  }

  // ESC closes modals
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setShowSuccess(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        }
        disabled={busy}
        title="Send a counteroffer"
      >
        {busy ? "Working…" : label}
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative z-[110] w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Counter Offer</h2>
            <p className="mt-2 text-sm text-slate-600">
              Enter your revised <strong>Price/AF</strong> and <strong>Quantity</strong>.
            </p>

            <form onSubmit={onSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Price / AF (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min={minPriceUsd}
                  value={priceUsd}
                  onChange={(e) => setPriceUsd(e.target.value)}
                  className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:ring-2 ${
                    priceTooLow
                      ? "border-red-300 focus:ring-red-600"
                      : "border-slate-300 focus:ring-emerald-600"
                  }`}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Must be ≥ ${minPriceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / AF
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Quantity (AF)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:ring-2 ${
                    qtyInvalid
                      ? "border-red-300 focus:ring-red-600"
                      : "border-slate-300 focus:ring-emerald-600"
                  }`}
                />
              </div>

              {err && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {err}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || priceTooLow || qtyInvalid}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {busy ? "Submitting…" : "Submit Counter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSuccess(false)} />
          <div className="relative z-[110] w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl text-center">
            <h3 className="text-lg font-semibold text-slate-900">Counter Sent</h3>
            <p className="mt-2 text-sm text-slate-600">Your counter offer has been submitted.</p>
            <button
              onClick={() => {
                setShowSuccess(false);
                router.refresh();
              }}
              className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}
