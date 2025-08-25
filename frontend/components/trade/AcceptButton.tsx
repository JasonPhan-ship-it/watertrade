// components/trade/AcceptButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  postUrl: string;
  token?: string;                // ⬅ add
  label?: string;
  className?: string;
  confirm?: boolean;
  confirmMessage?: string;
  onSuccess?: () => void;
};

export default function AcceptButton({
  postUrl,
  token,
  label = "Accept",
  className,
  confirm = true,
  confirmMessage = "Accept this offer?",
  onSuccess,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setErr(null);

    if (confirm && !window.confirm(confirmMessage)) return;

    try {
      setBusy(true);

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
        headers["X-Magic-Token"] = token;
      }

      // also include token in body, and leave token in query string on postUrl (already added in TradeShell)
      const res = await fetch(postUrl, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        // try to read json first; if it fails, fall back to text
        let message = "Accept failed.";
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

      // success UX
      alert("Offer accepted!");
      onSuccess?.();
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Something went wrong while accepting.");
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
          "inline-flex h-9 items-center justify-center rounded-xl bg-[#004434] px-4 text-sm font-semibold text-white hover:bg-[#003a2f] disabled:opacity-60"
        }
        title="Accept this offer"
      >
        {busy ? "Accepting…" : label}
      </button>

      {err && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}
    </div>
  );
}
