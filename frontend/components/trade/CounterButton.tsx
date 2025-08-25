// components/trade/CounterButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Role = "buyer" | "seller";

type Props = {
  postUrl: string;             // API endpoint to POST the counter
  role: Role;                  // "buyer" | "seller"
  currentPriceCents: number;   // current price per AF (in cents)
  currentQty: number;          // current volume (AF)
  label?: string;
  className?: string;
};

export default function CounterButton({
  postUrl,
  role,
  currentPriceCents,
  currentQty,
  label = "Counter",
  className,
}: Props) {
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [priceUsd, setPriceUsd] = React.useState<string>(() =>
    (Math.max(0, currentPriceCents) / 100).toString()
  );
  const [qtyAf, setQtyAf] = React.useState<string>(() =>
    String(Math.max(0, currentQty || 0))
  );

  const minUsd = Math.max(0, currentPriceCents) / 100;

  function resetAndClose() {
    setOpen(false);
    setErr(null);
    setBusy(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const priceNum = Number(priceUsd);
    const qtyNum = Number(qtyAf);

    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setErr("Please enter a valid price (USD/AF) greater than 0.");
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setErr("Please enter a valid quantity (AF) greater than 0.");
      return;
    }
    if (priceNum < minUsd) {
      setErr(`Counter price must be at least ${minUsd.toFixed(2)} USD/AF.`);
      return;
    }

    const payload = {
      pricePerAf: Math.round(priceNum * 100),
      volumeAf: qtyNum,
    };

    try {
      setBusy(true);

      const res = await fetch(postUrl, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const ct = res.headers.get("content-type") || "";
      const isJson = ct.includes("application/json");

      if (!res.ok) {
        const message = isJson
          ? ((await res.json()).error || "Counter failed.")
          : ((await res.text()) || "Counter failed.");
        throw new Error(message);
      }

      alert(`Counter sent!`);
      resetAndClose();
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Something went wrong sending your counter.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className={
          className ??
          "inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        }
      >
        {busy ? "Submitting…" : label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={resetAndClose} />

          <div className="relative z-[110] w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Send Counter</h2>
            <p className="mt-1 text-sm text-slate-600">
              Current: <strong>{minUsd.toLocaleString(undefined, { style: "currency", currency: "USD" })}</strong> per AF ·{" "}
              <strong>{currentQty}</strong> AF
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-slate-700">Price (USD/AF)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={priceUsd}
                  onChange={(e) => setPriceUsd(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  placeholder={minUsd.toFixed(2)}
                />
              </label>

              <label className="block text-sm">
                <span className="text-slate-700">Quantity (AF)</span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={qtyAf}
                  onChange={(e) => setQtyAf(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  placeholder={String(currentQty)}
                />
              </label>

              {err && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {err}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {busy ? "Submitting…" : "Send Counter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
