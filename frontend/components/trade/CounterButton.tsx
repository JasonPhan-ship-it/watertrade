// components/trade/CounterButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** The API endpoint to POST the counter to */
  postUrl: string;
  /** "seller" | "buyer" (sent to the server in the payload; optional, but useful for logging) */
  role?: "seller" | "buyer";
  /** Current offer price per AF, in cents (used for client-side validation) */
  currentPriceCents: number;
  /** Current quantity (AF), used to prefill the modal (optional) */
  currentQty?: number;
  /** Optional UI customizations */
  label?: string;
  className?: string;
  onSuccess?: () => void;
};

export default function CounterButton({
  postUrl,
  role,
  currentPriceCents,
  currentQty = 0,
  label = "Counter",
  className,
  onSuccess,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [priceUsd, setPriceUsd] = React.useState<string>(
    (currentPriceCents / 100).toFixed(2)
  );
  const [qty, setQty] = React.useState<string>(currentQty ? String(currentQty) : "");
  const [showSuccess, setShowSuccess] = React.useState(false);

  const priceCentsInput =
    Math.round((Number(priceUsd || "0") + Number.EPSILON) * 100) || 0;
  const qtyNumber = Number(qty || "0");
  const priceTooLow = priceCentsInput < (currentPriceCents || 0);

  function closeModal() {
    setOpen(false);
    setErr(null);
  }

  async function submitCounter(e: React.FormEvent) {
    e.preventDefault();
    if (!postUrl) return;

    if (qtyNumber <= 0 || priceCentsInput <= 0) {
      setErr("Please enter a valid quantity (> 0) and price (> 0).");
      return;
    }
    if (priceTooLow) {
      setErr(
        `Price must be ≥ ${(currentPriceCents / 100).toFixed(2)} USD/AF.`
      );
      return;
    }

    try {
      setBusy(true);
      setErr(null);

      const res = await fetch(postUrl, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,                 // optional for server context
          acreFeet: qtyNumber,  // aligns with your buyer route fallback mapping
          volumeAf: qtyNumber,  // aligns with seller route expectation
          pricePerAf: priceCentsInput, // cents
          pricePerAF: priceCentsInput,  // extra alias (server normalizes)
        }),
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
      setErr(e?.message || "Something went wrong sending the counter.");
    } finally {
      setBusy(false);
    }
  }

  // ESC to close modals
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
        disabled={busy}
        className={
          className ??
          "rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        }
      >
        {label}
      </button>

      {/* Counter Modal */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative z-[110] w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Submit Counter</h2>
            <p className="mt-2 text-sm text-slate-600">
              Enter your revised price and quantity. Price must be{" "}
              <strong>at least</strong>{" "}
              ${(currentPriceCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              per AF.
            </p>

            <form onSubmit={submitCounter} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">Price / AF (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceUsd}
                  onChange={(e) => setPriceUsd(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-600"
                />
                {priceTooLow && (
                  <p className="mt-1 text-xs text-red-600">
                    Price must be ≥ ${(currentPriceCents / 100).toFixed(2)} per AF.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600">Quantity (AF)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-600"
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
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || priceTooLow || priceCentsInput <= 0 || qtyNumber <= 0}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {busy ? "Sending…" : "Send Counter"}
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
            <h2 className="text-lg font-semibold text-slate-900">Counter Sent</h2>
            <p className="mt-2 text-sm text-slate-600">Your counter offer has been submitted.</p>
            <button
              onClick={() => {
                setShowSuccess(false);
                if (onSuccess) onSuccess();
                else router.refresh();
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
