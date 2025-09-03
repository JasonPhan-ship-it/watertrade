// components/trade/BuyNowConfirmButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export default function BuyNowConfirmButton({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);

  async function confirm() {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/transactions/${transactionId}/kickoff`, {
        method: "POST",
        credentials: "include",
      });
      const ct = res.headers.get("content-type") || "";
      const isJson = ct.includes("application/json");
      const data = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");

      if (!res.ok) throw new Error((isJson ? data?.error : data) || "Failed to complete Buy Now.");

      setOk(true);
      // Refresh in case server changed status, totals, etc.
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
        onClick={confirm}
        disabled={busy || ok}
        className="inline-flex h-10 items-center justify-center rounded-xl bg-[#004434] px-5 text-sm font-semibold text-white hover:bg-[#00392f] disabled:opacity-60"
      >
        {busy ? "Processing…" : ok ? "Completed" : "Buy Now"}
      </button>
      {err && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}
    </div>
  );
}
