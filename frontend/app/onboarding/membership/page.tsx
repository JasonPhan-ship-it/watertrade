"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import MembershipCard from "@/components/MembershipCard";

export default function OnboardingMembership() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const setBusyFor = (k: string | null) => setBusy(k);

  const chooseFree = async () => {
    try {
      setBusyFor("free");
      const res = await fetch("/api/membership/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "free" }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/dashboard");
    } catch (e) {
      alert("Could not activate Free plan. Please try again.");
    } finally {
      setBusyFor(null);
    }
  };

  const choosePremium = async () => {
    try {
      setBusyFor("premium");
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "premium" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      // Redirect to Stripe (or pricing) URL
      window.location.href = url;
    } catch (e) {
      alert("Could not start Premium billing. Please try again.");
      setBusyFor(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Choose your plan</h1>
      <p className="mt-1 text-sm text-slate-600">Start free. Upgrade any time.</p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <MembershipCard
          name="Free"
          subtitle="For getting started"
          priceLabel="$0"
          ctaLabel={busy === "free" ? "Activating…" : "Continue with Free"}
          onCta={busy ? undefined : chooseFree}
          highlights={[
            "Browse public listings",
            "Basic search & filters",
            "Create 1 active listing",
            "Email support",
          ]}
          disabled={!!busy}
        />

        <MembershipCard
          featured
          name="Premium"
          subtitle="For active buyers & sellers"
          priceLabel="Contact for pricing"
          ctaLabel={busy === "premium" ? "Starting checkout…" : "Upgrade to Premium"}
          onCta={busy ? undefined : choosePremium}
          highlights={[
            "Early access to new listings",
            "Advanced analytics & historical $/AF",
            "District window alerts (email/SMS)",
            "Saved searches & instant notifications",
            "Bulk bid tools & offer history",
            "Priority support",
          ]}
          disabled={!!busy}
        />
      </div>
    </div>
  );
}
