// components/DeleteListingButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  listingId: string;
  onSuccess?: () => void;
  label?: string;
  className?: string;
};

export default function DeleteListingButton({
  listingId,
  onSuccess,
  label = "Delete Listing",
  className,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [showSuccess, setShowSuccess] = React.useState(false);

  function closeModal() {
    setOpen(false);
    setErr(null);
    setConfirmText("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (confirmText !== "DELETE" || !listingId) return;

    try {
      setBusy(true);
      setErr(null);

      const res = await fetch(`/api/listings/${encodeURIComponent(listingId)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        let message = "Delete failed.";
        try {
          const j = await res.json();
          message = j?.error || message;
        } catch {
          message = (await res.text()) || message;
        }
        throw new Error(message);
      }

      closeModal();
      setShowSuccess(true);
    } catch (e: any) {
      setErr(e?.message || "Something went wrong deleting the listing.");
    } finally {
      setBusy(false);
    }
  }

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
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className={
          className ??
          "inline-flex h-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
        }
        title="Delete this listing"
      >
        {busy ? "Deleting…" : label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative z-[110] w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Confirm Deletion</h2>
            <p className="mt-2 text-sm text-slate-600">
              This will <strong>permanently delete</strong> the listing. To confirm, type{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px]">DELETE</code>.
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <input
                autoFocus
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder='Type "DELETE" to confirm'
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
                  disabled={busy || confirmText !== "DELETE"}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {busy ? "Deleting…" : "Confirm Delete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSuccess(false)} />
          <div className="relative z-[110] w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl text-center">
            <h2 className="text-lg font-semibold text-slate-900">Listing Deleted</h2>
            <p className="mt-2 text-sm text-slate-600">The listing has been permanently removed.</p>
            <button
              onClick={() => {
                setShowSuccess(false);
                if (onSuccess) onSuccess();
                else router.push("/dashboard?scope=mine&nocreate=1");
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
