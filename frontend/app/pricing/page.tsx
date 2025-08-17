// app/pricing/page.tsx - Improved version
"use client";

import * as React from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function PricingPage() {
  const { user, isSignedIn } = useUser();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const isPremium = Boolean(user?.publicMetadata?.premium);

  const handleFreePlan = async () => {
    if (!isSignedIn) {
      router.push("/sign-in?redirect_url=" + encodeURIComponent("/pricing"));
      return;
    }

    try {
      setBusy(true);
      const res = await fetch("/api/membership/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "free" }),
      });
      
      if (!res.ok) throw new Error("Failed to activate free plan");
      
      router.push("/dashboard");
    } catch (error) {
      console.error("Free plan activation error:", error);
      alert("Could not activate free plan. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handlePremiumUpgrade = () => {
    if (!isSignedIn) {
      router.push("/sign-in?redirect_url=" + encodeURIComponent("/pricing"));
      return;
    }
    
    // Use your existing checkout flow
    router.push("/pricing/checkout");
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">Choose Your Plan</h1>
        <p className="text-xl text-slate-600">Start free. Upgrade when you're ready for more features.</p>
        
        {isPremium && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg max-w-md mx-auto">
            <p className="text-green-800 text-sm">✓ You already have Premium access!</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {/* Free Plan */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Free</h2>
              <p className="mt-1 text-sm text-slate-600">Perfect for getting started</p>
            </div>
            <div className="text-right">
              <div className="text-xl font-semibold text-slate-900 sm:text-2xl">
                $0<span className="text-base font-normal text-slate-500">/mo</span>
              </div>
            </div>
          </div>

          <ul className="mt-6 space-y-3 text-slate-800">
            <Feature>Browse public listings</Feature>
            <Feature>Basic search & filters</Feature>
            <Feature>Create 1 active listing</Feature>
            <Feature>Email support</Feature>
            <Feature>Access to marketplace</Feature>
          </ul>

          <div className="mt-8">
            {!isPremium ? (
              <button
                onClick={handleFreePlan}
                disabled={busy}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl border-2 border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {busy ? "Activating..." : isSignedIn ? "Start Free" : "Get Started"}
              </button>
            ) : (
              <div className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-slate-100 px-6 text-sm font-medium text-slate-500">
                Your current plan
              </div>
            )}
          </div>
        </div>

        {/* Premium Plan */}
        <div className="relative">
          {/* MOST POPULAR badge */}
          <div className="absolute -top-4 left-6 z-10">
            <span className="inline-flex items-center rounded-full bg-[#0A6B58] px-3 py-1 text-xs font-semibold text-white shadow-sm ring-1 ring-white/10">
              MOST POPULAR
            </span>
          </div>

          <div className="rounded-2xl border-2 border-[#0A6B58] bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Premium</h2>
                <p className="mt-1 text-sm text-slate-600">For active buyers & sellers</p>
              </div>
              <div className="text-right">
                <div className="text-xl font-semibold text-slate-900 sm:text-2xl">
                  $20<span className="text-base font-normal text-slate-500">/mo</span>
                </div>
              </div>
            </div>

            <ul className="mt-6 space-y-3 text-slate-800">
              <Feature>Early access to new listings</Feature>
              <Feature>Advanced analytics & historical $/AF</Feature>
              <Feature>District window alerts (email/SMS)</Feature>
              <Feature>Saved searches & instant notifications</Feature>
              <Feature>Bulk bid tools & offer history</Feature>
              <Feature>Priority support</Feature>
              <Feature>Custom reporting & market insights</Feature>
            </ul>

            <div className="mt-8">
              {isPremium ? (
                <div className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#0A6B58] px-6 text-sm font-semibold text-white">
                  ✓ Currently Active
                </div>
              ) : (
                <button
                  onClick={handlePremiumUpgrade}
                  disabled={busy}
                  className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#0A6B58] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#085748] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A6B58] disabled:opacity-50"
                >
                  {isSignedIn ? "Upgrade to Premium" : "Get Started"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="mt-16 text-center">
        <h3 className="text-2xl font-semibold text-slate-900 mb-8">Frequently Asked Questions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto text-left">
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">Can I upgrade or downgrade anytime?</h4>
            <p className="text-slate-600 text-sm">Yes, you can change your plan at any time. Changes take effect immediately.</p>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">What payment methods do you accept?</h4>
            <p className="text-slate-600 text-sm">We accept all major credit cards and ACH transfers for enterprise accounts.</p>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">Is there a free trial for Premium?</h4>
            <p className="text-slate-600 text-sm">Contact us to discuss trial options for your specific needs.</p>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">Do you offer custom enterprise plans?</h4>
            <p className="text-slate-600 text-sm">Yes, we offer custom solutions for large districts and enterprise customers.</p>
          </div>
        </div>
      </div>

      {!isSignedIn && (
        <div className="mt-12 text-center">
          <p className="text-slate-600 mb-4">Ready to get started?</p>
          <Link
            href="/sign-up"
            className="rounded-xl bg-[#004434] px-8 py-3 text-white hover:bg-[#003a2f] font-medium inline-block"
          >
            Create Your Account
          </Link>
        </div>
      )}
    </main>
  );
}

/* Helper component for features */
function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E6F2EF] ring-1 ring-[#0A6B58]/20">
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          className="h-3.5 w-3.5"
        >
          <path
            d="M5 10.5l3 3 7-7"
            stroke="#0A6B58"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-sm text-slate-800">{children}</span>
    </li>
  );
}
