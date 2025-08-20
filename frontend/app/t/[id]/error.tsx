"use client";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
        <div className="text-sm font-semibold">Something went wrong</div>
        <p className="mt-1 text-sm">
          We couldn’t render this transaction page. Try again, or share the digest with support.
        </p>
        {error?.digest && (
          <p className="mt-2 text-xs">
            <span className="font-semibold">Digest:</span> <code>{error.digest}</code>
          </p>
        )}
        <div className="mt-3">
          <button
            onClick={reset}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
