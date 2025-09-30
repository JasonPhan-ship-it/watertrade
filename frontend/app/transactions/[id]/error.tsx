// app/transactions/[id]/error.tsx
"use client";

import * as React from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Log full details for debugging (visible in browser devtools)
  // Avoid putting stack/message in the UI in production.
  // eslint-disable-next-line no-console
  console.error("[transactions/[id]] error boundary", {
    message: error?.message,
    digest: (error as any)?.digest,
    stack: error?.stack,
  });

  const digest = error?.digest ?? "—";
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="mx-auto max-w-2xl p-6" role="alert" aria-live="polite">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        We couldn’t render this transaction. Try again, or go back to your dashboard.
      </p>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
        <div>
          <strong>Digest:</strong> {digest}
        </div>
        {isDev && error?.message ? (
          <div className="mt-2">
            <strong>Message (dev only):</strong> {error.message}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex gap-3">
        <button
          onClick={reset}
          className="rounded-xl bg-[#004434] px-5 py-2 text-white hover:bg-[#003a2f]"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="rounded-xl border border-slate-300 px-5 py-2 text-slate-700 hover:bg-slate-50"
        >
          Back to dashboard
        </a>
        <a
          href={`mailto:support@watertraders.com?subject=Transaction%20render%20error&body=Digest:%20${encodeURIComponent(
            digest
          )}%0AURL:%20${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}
          className="rounded-xl border border-slate-300 px-5 py-2 text-slate-700 hover:bg-slate-50"
        >
          Contact support
        </a>
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        The digest helps our team trace the underlying issue without exposing sensitive details.
      </p>
    </div>
  );
}
