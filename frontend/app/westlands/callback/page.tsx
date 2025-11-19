"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const DEFAULT_RETURN_PATH = "/onboarding?next=/dashboard";

export default function WestlandsCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams?.get("next") ?? DEFAULT_RETURN_PATH;
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"syncing" | "success" | "error">("syncing");
  const [balanceAf, setBalanceAf] = useState<number | null>(null);
  const [balanceUpdatedAt, setBalanceUpdatedAt] = useState<string | null>(null);

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
      setSyncStatus("syncing");
      setError(null);
      try {
        const stored = sessionStorage.getItem("westlandsCredentials");
        let credentials: { username?: string; password?: string } | null = null;
        try {
          credentials = stored ? JSON.parse(stored) : null;
        } catch (parseError) {
          console.warn("Unable to parse saved Westlands credentials", parseError);
        }

        if (!credentials?.username || !credentials?.password) {
          throw new Error(
            "Enter your Westlands username and password on the previous screen to continue."
          );
        }
        
        const res = await fetch("/api/integrations/westlands", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            consent: true,
            username: credentials.username,
            password: credentials.password,
          }),
        });

        if (!res.ok) {
          const message = await res.text();
          throw new Error(message || "Failed to sync Westlands balance");
        }

        const data = await res.json().catch(() => ({}));
        const integration = data?.integration;
        if (integration) {
          setBalanceAf(typeof integration.balanceAf === "number" ? integration.balanceAf : null);
          setBalanceUpdatedAt(
            integration.balanceUpdatedAt || integration.lastSyncedAt || integration.consentedAt || null
          );
        }

        sessionStorage.removeItem("westlandsCredentials");

        if (cancelled) return;
        setSyncStatus("success");
        window.setTimeout(() => {
          if (!cancelled) notifyAndRedirect();
        }, 600);
      } catch (syncError: any) {
        if (cancelled) return;
        setError(syncError?.message || "Unable to sync Westlands balance");
        setSyncStatus("error");
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
        <p className="text-lg font-semibold text-emerald-900">
          {syncStatus === "syncing"
            ? "Syncing your balance…"
            : syncStatus === "success"
              ? "Balance synced"
              : "Sync failed"}
        </p>
        <p className="text-sm text-slate-600">
          {syncStatus === "syncing"
            ? "We&apos;re updating your Westlands Water District balance now. This should only take a moment."
            : syncStatus === "success"
              ? "Successfully retrieved your latest balance from Westlands."
              : error || "We couldn&apos;t refresh your balance automatically."}
        </p>
        {syncStatus === "syncing" && (
          <div className="flex items-center justify-center gap-2 text-sm text-emerald-800">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-transparent" aria-hidden />
            Syncing Westlands balance…
          </div>
        )}
        {syncStatus === "success" && (
          <div className="space-y-2 rounded-lg bg-emerald-50 p-4 text-left text-sm text-emerald-900">
            {typeof balanceAf === "number" && (
              <p>
                Current balance: <span className="font-semibold">{balanceAf.toLocaleString()} AF</span>
              </p>
            )}
            {balanceUpdatedAt && (
              <p className="text-emerald-800">Updated {new Date(balanceUpdatedAt).toLocaleString()}</p>
            )}
            <p className="text-emerald-800">Redirecting you back to the app…</p>
          </div>
        )}
        {syncStatus === "error" && (
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
      </div>
    </main>
  );
}
