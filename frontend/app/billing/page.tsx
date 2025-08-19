// frontend/app/billing/page.tsx
"use client";

import * as React from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

type StatusResponse = {
  isPremium: boolean;
  plan?: string | null;        // e.g., "premium", "free", "premium_plus"
  renewsAt?: string | null;    // ISO date of next renewal (if any)
  cancelAt?: string | null;    // ISO date if already set to cancel at period end
};

export default function BillingPage() {
  const { isSignedIn, user, isLoaded } = useUser();
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<null | "portal" | "downgrade" | "cancel">(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<StatusResponse | null>(null);

  const fetchStatus = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/subscription/status", { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as StatusResponse;
      setStatus(data);
    } catch (e: any) {
      setErr(e?.message || "Failed to load subscription status.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) return; // Next.js middleware should redirect, but guard anyway
    fetchStatus();
  }, [isLoaded, isSignedIn, fetchStatus]);

  async function openPortal() {
    try {
      setBusy("portal");
      setErr(null);
      const r = await fetch("/api/billing/portal", { method: "POST", credentials: "include" });
      if (r.redirected) {
        window.location.href = r.url;
        return;
      }
      if (!r.ok) {
        // Try to parse JSON first
        let url = "";
        try {
          const j = await r.json();
          url = j?.url || "";
        } catch {}
        if (url) {
          window.location.href = url;
          return;
        }
        // Fallback: local billing page (this page)
        throw new Error((await r.text()) || "Could not open billing portal.");
      }
      const { url } = await r.json();
      if (!url) throw new Error("No portal URL returned.");
      window.location.href = url;
    } catch (e: any) {
      setErr(e?.message || "Failed to open billing portal.");
    } finally {
      setBusy(null);
    }
  }

  async function downgradeToFree() {
    // Confirm intent
    if (!window.confirm("Downgrade to the Free plan now? Some premium features will be disabled.")) return;
    try {
      setBusy("downgrade");
      setErr(null);
      const r = await fetch("/api/subscription/downgrade", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) {
        // If the endpoint isn't implemented, fall back to opening the Stripe portal
        await openPortal();
        return;
      }
      await fetchStatus();
    } catch (e: any) {
      setErr(e?.message || "Failed to downgrade. You can also manage this in the billing portal.");
    } finally {
      setBusy(null);
    }
  }

  async function cancelMembership() {
    const atPeriodEnd = window.confirm(
      "Click OK to cancel at the end of the current billing period (recommended). Click Cancel to cancel immediately."
    );
    try {
      setBusy("cancel");
      setErr(null);
      const r = await fetch("/api/subscription/cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atPeriodEnd: atPeriodEnd ? true : false }),
      });
      if (!r.ok) {
        // Fall back to portal if API not available
        await openPortal();
        return;
      }
      await fetchStatus();
    } catch (e: any) {
      setErr(e?.message || "Cancellation failed. You can also manage this in the billing portal.");
    } finally {
      setBusy(null);
    }
  }

  if (!isLoaded || loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="mt-2 text-sm text-slate-600">
          Please <Link href="/sign-in" className="underline">sign in</Link> to manage billing.
        </p>
      </div>
    );
  }

  const isPremium = Boolean(status?.isPremium);
  const planLabel =
    status?.plan?.toString?.().replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) ||
    (isPremium ? "Premium" : "Free");

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
      <p className="mt-1 text-sm text-slate-600">Manage your subscription and invoices.</p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">Current Plan</div>
            <div className="mt-1 text-sm text-slate-700">
              {planLabel}
              {status?.renewsAt && !status?.cancelAt && (
                <span className="ml-2 text-slate-500">
                  • Renews on {new Date(status.renewsAt).toLocaleDateString()}
                </span>
              )}
              {status?.cancelAt && (
                <span className="ml-2 text-amber-600">
                  • Cancels on {new Date(status.cancelAt).toLocaleDateString()}
                </span>
              )}
            </div>
            {isPremium ? (
              <p className="mt-2 text-xs text-slate-500">
                You have access to premium features and early listings.
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                You’re currently on the Free plan. Upgrade to unlock premium analytics and listings.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={openPortal}
              disabled={busy !== null}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-[#004434] px-4 text-sm font-medium text-white hover:bg-[#003a2f] disabled:opacity-60"
            >
              {busy === "portal" ? "Opening…" : "Manage Billing"}
            </button>

            {isPremium ? (
              <>
                <button
                  onClick={downgradeToFree}
                  disabled={busy !== null}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  title="Switch to the Free plan immediately"
                >
                  {busy === "downgrade" ? "Downgrading…" : "Downgrade to Free"}
                </button>
                <button
                  onClick={cancelMembership}
                  disabled={busy !== null}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                  title="Cancel your subscription"
                >
                  {busy === "cancel" ? "Canceling…" : "Cancel Membership"}
                </button>
              </>
            ) : (
              <Link
                href="/pricing/checkout"
                className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Upgrade to Premium
              </Link>
            )}
          </div>
        </div>

        {/* Helpful links */}
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/pricing" className="text-slate-600 underline">View plans & pricing</Link>
          <Link href="/faq/billing" className="text-slate-600 underline">Billing FAQ</Link>
        </div>

        {err && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}
      </section>

      {/* Invoices preview could be added here in the future by calling /api/billing/invoices */}
    </div>
  );
}
