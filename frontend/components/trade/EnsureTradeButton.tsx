// components/trade/EnsureTradeButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  transactionId: string;
  label?: string;
  className?: string;
};

export default function EnsureTradeButton({
  transactionId,
  label = "Enable Counter",
  className,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setErr(null);
    try {
      setBusy(true);
      const res = await fetch(`/api/transactions/${transactionId}/ensure-trade`, {
        method: "POST",
        credentials: "include",
      });
      const ct = res.headers.get("content-type") || "";
      const isJson = ct.includes("application/json");

      if (!res.ok) {
        const message = isJson
          ? ((await res.json()).error || "Failed to enable counter.")
          : ((await res.text()) || "Failed to enable counter.");
        throw new Error(message);
      }
      // (We don’t need the payload; just refresh so TradeShell will find the Trade)
      if (isJson) await res.json().catch(() => null);
      else await res.text().catch(() => null);

      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={
          className ??
          "inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        }
      >
        {busy ? "Enabling…" : label}
      </button>
      {err && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}
    </div>
  );
}
