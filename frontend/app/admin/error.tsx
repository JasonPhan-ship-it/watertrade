// app/admin/error.tsx
"use client";

import Link from "next/link";

export default function AdminError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-red-800">Admin route error</h2>
      <p className="mt-2 text-sm text-red-700">
        We ran into a problem while loading the admin panel. Please refresh the page or
        return to the dashboard below. If the issue continues, contact support so we can
        help.
      </p>
      <div className="mt-4">
        <Link
          href="/admin"
          className="inline-flex items-center rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-100"
        >
          Back to admin dashboard
        </Link>
      </div>
      {error.digest && (
        <p className="mt-4 text-xs text-red-600">
          Reference code: <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </div>
  );
}
