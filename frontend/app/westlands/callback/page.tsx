"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function WestlandsCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams?.get("next") ?? "/dashboard";
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(true);

  const nextPath = useMemo(() => {
    try {
      return decodeURIComponent(next);
    } catch {
      return next;
    }
  }, [next]);

  useEffect(() => {
    let cancelled = false;

    const notifyAndRedirect = () => {
      try {
        window.dispatchEvent(new CustomEvent("westlands-integration-updated"));
        if (window.opener && !window.opener.closed) {
          window.opener.dispatchEvent(new CustomEvent("westlands-integration-updated"));
        }
      } catch (eventError) {
        console.warn("Unable to notify about Westlands sync", eventError);
      }

      router.replace(nextPath);
    };

    const syncBalance = async () => {
      setIsSyncing(true);
      setError(null);
      try {
        const res = await fetch("/api/integrations/westlands", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consent: true }),
        });

        if (!res.ok) {
          const message = await res.text();
          throw new Error(message || "Failed to sync Westlands balance");
        }

        if (cancelled) return;
        notifyAndRedirect();
      } catch (syncError: any) {
        if (cancelled) return;
        setError(syncError?.message || "Unable to sync Westlands balance");
        setIsSyncing(false);
      }
    };

    syncBalance();
    return () => {
      cancelled = true;
    };
  }, [nextPath, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-emerald-50 px-6">
      <div className="max-w-lg space-y-4 rounded-2xl bg-white p-6 text-center shadow-lg">
        <p className="text-lg font-semibold text-emerald-900">{isSyncing ? "Syncing your balance…" : "Sync failed"}</p>
        <p className="text-sm text-slate-600">
          {isSyncing
            ? "We&apos;re updating your Westlands Water District balance now. This should only take a moment."
            : error || "We couldn&apos;t refresh your balance automatically."}
        </p>
        {!isSyncing && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => router.replace(nextPath)}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Return to the app
            </button>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="block w-full text-sm font-semibold text-emerald-900 underline transition hover:text-emerald-700"
            >
              Try syncing again
            </button>
          </div>
        )}
        {isSyncing && (
          <div className="flex items-center justify-center gap-2 text-sm text-emerald-800">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-transparent" aria-hidden />
            Syncing Westlands balance…
          </div>
        )}
      </div>
    </main>
  );
}
