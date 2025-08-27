// components/trade/AcceptButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  postUrl: string;
  token?: string;
  label?: string;
  className?: string;
  confirm?: boolean;
  confirmMessage?: string;
  onSuccess?: () => void; // kept for backward-compat
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
  const [ok, setOk] = React.useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setErr(null);
    setOk(null);

    if (confirm && !window.confirm(confirmMessage)) return;

    try {
      setBusy(true);

      // Your server checks URL ?token or the 'x-trade-token' header (not 'Authorization', not 'X-Magic-Token')
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["x-trade-token"] = token;

      const res = await fetch(postUrl, {
        method: "POST",
        credentials: "include",
        headers,
        // sending token in the body is optional; server doesn't require it, but harmless
        body: JSON.stringify({ token }),
      });

      // try to parse JSON either way (ok or error)
      let data: any = {};
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        try { data = await res.json(); } catch { /* ignore */ }
      } else {
        try { data = { raw: await res.text() }; } catch { /* ignore */ }
      }

      if (!res.ok) {
        const message = data?.error || data?.message || "Accept failed.";
        throw new Error(message);
      }

      // Success: show inline confirmation and refresh to reflect new status
      setOk(data?.message || "Awaiting buyer signature");
      onSuccess?.();

      // If you prefer to navigate instead of staying, uncomment:
      // if (data?.redirectUrl) router.push(data.redirectUrl); else router.refresh();

      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Something went wrong while accepting.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-2">
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

      {ok && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {ok}
        </div>
      )}

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}
    </div>
  );
}
