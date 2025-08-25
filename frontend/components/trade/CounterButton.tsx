// components/trade/CounterButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  postUrl: string;             // e.g. /api/trades/:id/seller/counter?token=...
  role: "buyer" | "seller";
  token?: string;              // ⬅ add
  currentPriceCents: number;
  currentQty: number;
  label?: string;
  className?: string;
};

export default function CounterButton({
  postUrl,
  role,
  token,
  currentPriceCents,
  currentQty,
  label = "Counter",
  className,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [price, setPrice] = React.useState((currentPriceCents / 100).toString());
  const [qty, setQty] = React.useState(currentQty.toString());

  function close() {
    setOpen(false);
    setErr(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const priceNum = Math.round(Number(price) * 100); // cents
    const qtyNum = Number(qty);

    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setErr("Enter a valid price (USD/AF).");
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setErr("Enter a valid quantity (AF).");
      return;
    }
    if (priceNum < currentPriceCents) {
      setErr("Your counter price cannot be lower than the current offer.");
      return;
    }

    try {
      setBusy(true);
      setErr(null);

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
        headers["X-Magic-Token"] = token;
      }

      const res = await fetch(postUrl, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          token,             // body token
          role,              // sometimes used server-side
          pricePerAf: priceNum,
          volumeAf: qtyNum,
        }),
      });

      if (!res.ok) {
        let message = "Counter failed.";
        try {
          const ct = res.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            const j = await res.json();
            message = j?.error || message;
          } else {
            message = (await res.text()) || message;
          }
        } catch { /* ignore */ }
        throw new Error(message);
      }

      close();
      alert("Counter sent.");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Something went wrong sending the counter.");
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
        title="Make a counteroffer"
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/40" onClick={close} />

          <div className="relative z-[110] w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Counteroffer</h2>
            <p className="mt-1 text-sm text-slate-600">
              Your counter price must be <strong>≥ current offer</strong>.
            </p>

            <form className="mt-4 space-y-3" onSubmit={onSubmit}>
              <label className="block text-sm">
                <span className="text-slate-700">Price (USD/AF)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </label>

              <label className="block text-sm">
                <span className="text-slate-700">Quantity (AF)</span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
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
                  onClick={close}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-[#004434] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003a2f] disabled:opacity-60"
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
