// app/admin/transactions/DownloadTransactionsButton.tsx
"use client";

import React from "react";

export default function DownloadTransactionsButton({ from, to }: { from?: string; to?: string }) {
  const [downloading, setDownloading] = React.useState(false);

  function href() {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return `/api/admin/transactions/export${q.toString() ? `?${q.toString()}` : ""}`;
  }

  return (
    <a
      href={href()}
      onClick={() => setDownloading(true)}
      className="inline-flex h-10 items-center rounded-xl bg-black px-4 text-sm text-white disabled:opacity-50"
      aria-label="Download XLSX"
    >
      {downloading ? "Preparing…" : "Download .xlsx"}
    </a>
  );
}
