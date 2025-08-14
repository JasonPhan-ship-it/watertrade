// app/pricing/success/page.tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function PricingSuccessPage() {
  useEffect(() => {
    // If Stripe redirected to the wrong origin (like localhost), fix it using NEXT_PUBLIC_APP_URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) {
      try {
        const targetOrigin = new URL(appUrl).origin;
        if (window.location.origin !== targetOrigin) {
          // Preserve query/hash if Stripe appended any
          const suffix = `/pricing/success${window.location.search}${window.location.hash}`;
          window.location.replace(`${targetOrigin}${suffix}`);
          return; // stop here; browser will navigate
        }
      } catch {
        // ignore malformed env and proceed to timed redirect
      }
    }

    // Otherwise, show success then send to dashboard
    const t = setTimeout(() => {
      window.location.replace("/dashboard");
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        You&apos;re all set!
      </h1>
      <p className="mt-2 text-slate-600">
        We’ve sent a confirmation to your email. You’ll be redirected to your dashboard shortly.
      </p>

      <div className="mt-6">
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-xl bg-[#0A6B58] px-4 text-sm font-medium text-white hover:bg-[#095a49]"
        >
          Go to Dashboard now
        </Link>
      </div>
    </main>
  );
}
