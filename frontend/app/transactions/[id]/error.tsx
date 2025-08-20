"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        We couldn’t render this transaction. Please try again.
      </p>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <div><strong>Digest:</strong> {error?.digest || "—"}</div>
      </div>
      <button
        onClick={reset}
        className="mt-4 rounded-xl bg-[#004434] px-5 py-2 text-white hover:bg-[#003a2f]"
      >
        Try again
      </button>
    </div>
  );
}
