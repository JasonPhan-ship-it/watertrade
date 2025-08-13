// app/admin/error.tsx
"use client";

export default function AdminError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-red-800">Admin route error</h2>
      <p className="mt-2 text-sm text-red-700">
        {error.message || "Something went wrong while rendering the admin page."}
      </p>
      {error.digest && (
        <p className="mt-1 text-xs text-red-600">Digest: {error.digest}</p>
      )}
    </div>
  );
}
