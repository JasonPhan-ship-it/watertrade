// components/trade/CounterButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  postUrl: string;             // e.g. /api/trades/:id/{buyer|seller}/counter (qs optional)
  role: "buyer" | "seller";
  token?: string;
  currentPriceCents: number;   // current offer price in cents
  currentQty: number;          // current offer volume in AF
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

  // form state shown as dollars + AF
  const [price, setPrice] = React.useState((currentPriceCents / 100).toString());
  const [qty, setQty] = React.useState(currentQty.toString());
  const [windowLabel, setWindowLabel] = React.useState("");

  function close() {
    setOpen(false);
    setErr(null);
  }

  function ensureUrlWithToken(u: string) {
    if (!token) return u;
    const hasToken = u.includes("token=");
    const hasRole = u.includes("role=");
    if (hasToken && hasRole) return u;
    const url = new URL(u, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    if (!hasToken) url.searchParams.set("token", token);
    if (!hasRole) url.searchParams.set("role", role);
    return url.toString();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const priceNum = Math.round(Number(price) * 100); // -> cents
    const qtyNum = Number(qty);

    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setErr("Enter a valid price (USD/AF).");
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setErr("Enter a valid quantity (AF).");
      return;
    }

    // Business rule: seller must go >= current; buyer must go <= current
    if (role === "seller" && priceNum < currentPriceCents) {
      setErr("Your counter price cannot be lower than the current offer.");
      return;
    }
    if (role === "buyer" && priceNum > currentPriceCents) {
      setErr("Your counter price cannot be higher than the current offer.");
      return;
    }

    try {
      setBusy(true);
      setErr(null);

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["x-trade-token"] = token; // 👈 server reads this

      const url = ensureUrlWithToken(postUrl);

      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          // server supports both JSON and form-data; we send JSON
          pricePerAf: priceNum,
          volumeAf: qtyNum,
          windowLabel: windowLabel.trim() || undefined,
          // role in body is optional; auth is based on session/token
          role,
        }),
      });

      // try to parse JSON either way
      let data: any = {};
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        try { data = await res.json(); } catch { /* ignore */ }
      } else {
        try { data = { raw: await res.text() }; } catch { /* ignore */ }
      }

      if (!res.ok) {
        // Surface helpful 403 diagnostics if present
        if (res.status === 403 && data?.details) {
          const d = data.details;
          const hint =
            `Not recognized as buyer.\n` +
            `viewerRole=${d.viewerRole}, via=${d.via}, hasToken=${d.hasToken}, sawRoleParam=${d.sawRoleParam}`;
          throw new Error(data?.error ? `${data.error}\n${hint}` : hint);
        }
        throw new Error(data?.error || "Counter failed.");
      }

      close();
      // Optional: toast instead of alert in your UI system
      // e.g., setToast({ kind: "success", text: "Counter sent." })
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Something went wrong sending the counter.");
    } finally {
      setBusy(false);
    }
  }

  const ruleText =
    role === "seller"
      ? "Your counter price must be ≥ current offer."
      : "Your counter price must be ≤ current offer.";

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
            <p className="mt-1 text-sm text-slate-600">{ruleText}</p>

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

              <label className="block text-sm">
                <span className="text-slate-700">Window (optional)</span>
                <input
                  type="text"
                  value={windowLabel}
                  onChange={(e) => setWindowLabel(e.target.value)}
                  placeholder="e.g. Jan–Mar 2026"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </label>

              {err && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 whitespace-pre-wrap">
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
