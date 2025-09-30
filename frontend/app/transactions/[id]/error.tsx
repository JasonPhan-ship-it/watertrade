// app/transactions/[id]/error.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [debug, setDebug] = useState(false);

  // Show full message only when you add ?debug=1 to the URL
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    setDebug(qs.get("debug") === "1");
  }, []);

  useEffect(() => {
    // This will appear in Vercel → Functions logs
    // Includes the digest to correlate with the generic page
    // eslint-disable-next-line no-console
    console.error("[transactions/[id]] error boundary", {
      message: error?.message,
      digest: (error as any)?.digest,
      stack: error?.stack,
    });
  }, [error]);

  const digest = useMemo(() => (error as any)?.digest ?? "—", [error]);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Transaction error</h1>
      <p className="mt-2 text-sm text-slate-600">
        Something went wrong rendering this transaction. Use the digest when checking server logs.
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <div><span className="text-slate-500">Digest:</span> <code>{digest}</code></div>
        {debug && (
          <details className="mt-2">
            <summary className="cursor-pointer text-slate-700">Show error message</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs text-slate-800">
{error?.message}
            </pre>
          </details>
        )}
      </div>

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => reset()}
          className="rounded-lg bg-[#004434] px-4 py-2 text-sm font-medium text-white hover:bg-[#00392f]"
        >
          Retry
        </button>
        <a
          href="/dashboard"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Dashboard
        </a>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Tip: append <code>?debug=1</code> to the URL to reveal the error message here.
      </p>
    </div>
  );
}
