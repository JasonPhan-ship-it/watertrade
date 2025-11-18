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
    <div className="mt-10 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={startBuyNow}
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-700 via-[#004434] to-[#003626] px-6 py-3 text-sm font-semibold text-white shadow-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 hover:from-emerald-800 hover:via-[#003a2f] hover:to-[#002e24] disabled:opacity-60 sm:w-auto"        >
          {busy ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-transparent" aria-hidden />
              Starting…
            </>
          ) : (
            confirmLabel
          )}
        </button>
        <Link
          href={backHref}
          className="text-center text-sm font-semibold text-emerald-800 transition hover:text-emerald-900"
        >
          Cancel and go back
        </Link>
      </div>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700 shadow-inner">
          {error}
        </div>
      )}
    </div>
  );
}
