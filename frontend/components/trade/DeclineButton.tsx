// components/trades/DeclineButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  transactionId: string;
  onSuccess?: () => void;
  label?: string;
  className?: string;
};

export default function DeclineButton({
  transactionId,
  onSuccess,
  label = "Decline",
  className,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);        // confirmation modal
  const [confirmText, setConfirmText] = React.useState("");
  const [showSuccess, setShowSuccess] = React.useState(false); // success modal

  function closeModal() {
    setOpen(false);
    setErr(null);
    setConfirmText("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (confirmText !== "DECLINE" || !transactionId) return;

    try {
      setBusy(true);
      setErr(null);

      const res = await fetch(`/api/trades/${transactionId}/seller/decline`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        let message = "Decline failed.";
        try {
          const j = await res.json();
          message = j?.error || message;
        } catch {
          message = (await res.text()) || message;
        }
        throw new Error(message);
      }

      closeModal();
      setShowSuccess(true); // open success popup
    } catch (e: any) {
      setErr(e?.message || "Something went wrong declining the trade.");
    } finally {
      setBusy(false);
    }
  }

  // ESC closes either modal
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
          "inline-flex h-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
        }
        title="Decline this trade"
      >
        {busy ? "Declining…" : label}
      </button>

      {/* Confirm Decline Modal */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />

          <div className="relative z-[110] w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Confirm Decline</h2>
            <p className="mt-2 text-sm text-slate-600">
              This action will <strong>decline</strong> the offer. To confirm, type{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px]">DECLINE</code>.
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <input
                autoFocus
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder='Type "DECLINE" to confirm'
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-600"
              />

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
                  disabled={busy || confirmText !== "DECLINE"}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {busy ? "Declining…" : "Confirm Decline"}
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
            <h2 className="text-lg font-semibold text-slate-900">Offer Declined</h2>
            <p className="mt-2 text-sm text-slate-600">
              The offer has been successfully declined.
            </p>
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
