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
  onSuccess?: () => void;
  successTitle?: string;
  successMessage?: string;
};

export default function AcceptButton({
  postUrl,
  token,
  label = "Accept",
  className,
  confirm = true,
  confirmMessage = "Accept this offer?",
  onSuccess,
  successTitle = "Offer Accepted",
  successMessage = "The offer was accepted. Next steps have been sent to both parties.",
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const [showSuccess, setShowSuccess] = React.useState(false);

  async function handleClick() {
    if (busy) return;
    setErr(null);
    setOk(null);

    if (confirm && !window.confirm(confirmMessage)) return;

    try {
      setBusy(true);

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["x-trade-token"] = token;

      const res = await fetch(postUrl, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ token }),
      });

      let data: any = {};
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        try { data = await res.json(); } catch {}
      } else {
        try { data = { raw: await res.text() }; } catch {}
      }

      if (!res.ok) {
        const message = data?.error || data?.message || "Accept failed.";
        throw new Error(message);
      }

      setOk(data?.message || "Awaiting buyer signature");
      setShowSuccess(true);
      onSuccess?.();
      // NOTE: wait to refresh until user clicks OK in the modal
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

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSuccess(false)} />
          <div className="relative z-[110] w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl text-center">
            <h2 className="text-lg font-semibold text-slate-900">{successTitle}</h2>
            <p className="mt-2 text-sm text-slate-600">{successMessage}</p>
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
    </div>
  );
}
