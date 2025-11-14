"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = {
  listingId: string;
  buyerWaterAccount?: string;
  mode: "BUY_NOW" | "SELL_NOW";
  backHref: string;
};

export default function BuyNowConfirmClient({
  listingId,
  buyerWaterAccount,
  mode,
  backHref,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const confirmLabel =
    mode === "SELL_NOW" ? "Confirm Sale & Open DocuSign" : "Confirm Purchase & Open DocuSign";

  async function startBuyNow() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/transactions/buy-now", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          buyerWaterAccount: buyerWaterAccount || undefined,
        }),
      });

      const ct = res.headers.get("content-type") || "";
      const isJson = ct.includes("application/json");
      const data = isJson
        ? await res.json().catch(() => ({} as any))
        : await res.text().catch(() => "");

      if (!res.ok) {
        const msg = (typeof data === "string" ? data : data?.error) || "Failed to start Buy Now.";
        throw new Error(msg);
      }

      const location = res.headers.get("Location");
      if (location) {
        router.push(location);
        return;
      }

      if (isJson && data && typeof data === "object") {
        const signUrl = typeof data.signUrl === "string" ? data.signUrl : "";
        if (signUrl) {
          window.location.href = signUrl;
          return;
        }
        const id = typeof data.id === "string" ? data.id : "";
        if (id) {
          router.push(`/transactions/${id}?action=review`);
          return;
        }
      }

      router.push(`/listings/${listingId}`);
    } catch (err: any) {
      const message =
        err?.message ||
        err?.cause?.message ||
        (typeof err === "string" ? err : "") ||
        "Failed to start Buy Now.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={startBuyNow}
          disabled={busy}
          className="inline-flex w-full items-center justify-center rounded-xl bg-[#004434] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#003a2f] disabled:opacity-60 sm:w-auto"
        >
          {busy ? "Starting…" : confirmLabel}
        </button>
        <Link
          href={backHref}
          className="text-center text-sm font-medium text-slate-600 transition hover:text-slate-900"
        >
          Cancel and go back
        </Link>
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
