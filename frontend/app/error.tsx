// app/error.tsx - Global error boundary
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const digest = error?.digest ?? "—";

  useEffect(() => {
    // Log rich details for debugging (safe in console)
    // eslint-disable-next-line no-console
    console.error("[app error boundary]", {
      message: error?.message,
      digest,
      stack: error?.stack,
    });
  }, [error, digest]);

  const copyDigest = async () => {
    try {
      await navigator.clipboard.writeText(digest);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no-op */
    }
  };

  const supportHref = `mailto:support@watertraders.com?subject=App%20error&body=Digest:%20${encodeURIComponent(
    digest
  )}%0AURL:%20${encodeURIComponent(
    typeof window !== "undefined" ? window.location.href : ""
  )}%0A%0APlease%20describe%20what%20you%20were%20doing:%0A`;

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="min-h-screen flex items-center justify-center px-4" role="alert" aria-live="polite">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <h1 className="text-6xl font-bold text-slate-900 mb-4">Oops!</h1>
          <h2 className="text-2xl font-semibold text-slate-700 mb-2">Something went wrong</h2>
          <p className="text-slate-600">
            We couldn’t render this page. Try again, or head back to your dashboard.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={reset}
            className="w-full bg-[#004434] text-white px-6 py-3 rounded-xl hover:bg-[#003a2f] transition-colors"
          >
            Try Again
          </button>

          <Link
            href="/dashboard"
            className="block w-full bg-slate-100 text-slate-700 px-6 py-3 rounded-xl hover:bg-slate-200 transition-colors"
          >
            Go to Dashboard
          </Link>

          <Link
            href="/"
            className="block text-slate-600 hover:text-slate-900 transition-colors"
          >
            Return Home
          </Link>
        </div>

        {/* Diagnostic panel (safe for prod) */}
        <div className="mt-8 p-4 bg-white border border-slate-200 rounded-lg text-left">
          <div className="text-xs text-slate-600 break-words">
            <div className="flex items-center justify-between gap-2">
              <p><strong>Digest:</strong> <span className="font-mono">{digest}</span></p>
              <button
                onClick={copyDigest}
                className="text-[11px] rounded-md border px-2 py-1 hover:bg-slate-50"
                title="Copy digest"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            {isDev && error?.message ? (
              <p className="mt-2"><strong>Message (dev only):</strong> {error.message}</p>
            ) : null}
          </div>

          <div className="mt-3 flex gap-3">
            <a
              href={supportHref}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Report this issue
            </a>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-slate-500">
          The digest helps us trace the underlying error without exposing sensitive details.
        </p>
      </div>
    </div>
  );
}
