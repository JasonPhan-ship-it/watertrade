// app/pricing/success/page.tsx
"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

const SESSION_FLAG = "pricing_success_redirected";

export default function PricingSuccessPage() {
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // 1) Cross-origin correction (once per session)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) {
      try {
        const targetOrigin = new URL(appUrl).origin;
        const currentOrigin = window.location.origin;

        const suffix = `/pricing/success${window.location.search}${window.location.hash}`;
        const targetUrl = `${targetOrigin}${suffix}`;

        const alreadyTried =
          typeof window !== "undefined" &&
          sessionStorage.getItem(SESSION_FLAG) === "1";

        if (currentOrigin !== targetOrigin && window.location.href !== targetUrl && !alreadyTried) {
          sessionStorage.setItem(SESSION_FLAG, "1");
          window.location.replace(targetUrl);
          return; // stop; browser will navigate
        }
      } catch {
        // ignore malformed env
      }
    }

    // 2) Timed in-app redirect to dashboard
    timeoutRef.current = window.setTimeout(() => {
      if (window.location.pathname !== "/dashboard") {
        window.location.replace("/dashboard");
      }
    }, 4000);

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        You&apos;re all set!
      </h1>
      <p className="mt-2 text-slate-600">
        We’ve sent a confirmation to your email. You’ll be redirected to your dashboard shortly.
      </p>

      <div className="mt-6 flex items-center justify-center">
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-xl bg-[#0A6B58] px-4 text-sm font-medium text-white hover:bg-[#095a49]"
        >
          Go to Dashboard
        </Link>
      </div>
    </main>
  );
}
