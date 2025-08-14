// app/pricing/success/page.tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function PricingSuccessPage() {
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.replace("/dashboard");
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">You're all set!</h1>
      <p className="mt-2 text-slate-600">
        We’ve sent a confirmation to your email. You’ll be redirected to your dashboard shortly.
      </p>
      <div className="mt-6">
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-xl bg-black px-4 text-sm text-white"
        >
          Go to Dashboard now
        </Link>
      </div>
    </main>
  );
}
