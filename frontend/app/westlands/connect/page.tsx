"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";

const WESTLANDS_LOGIN_URL = "https://cs.westlandswater.org/cacct/login.asp";
const DEFAULT_RETURN_PATH = "/onboarding?next=/dashboard";

function buildWestlandsLoginUrl(callbackUrl: string) {
  const westlandsUrl = new URL(WESTLANDS_LOGIN_URL);
  westlandsUrl.searchParams.set("ReturnUrl", callbackUrl);
  westlandsUrl.searchParams.set("ReturnURL", callbackUrl);
  return westlandsUrl.toString();
}

export default function WestlandsConnectPage() {
  const searchParams = useSearchParams();
  const next = searchParams?.get("next") ?? DEFAULT_RETURN_PATH;

  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") return null;
    const callback = new URL("/westlands/callback", window.location.origin);
    callback.searchParams.set("next", next);
    return callback.toString();
  }, [next]);

  useEffect(() => {
    if (!callbackUrl) return;

    const westlandsUrl = buildWestlandsLoginUrl(callbackUrl);
    window.location.replace(westlandsUrl);
  }, [callbackUrl]);

  if (!callbackUrl) {
    return null;
  }

  const westlandsUrl = buildWestlandsLoginUrl(callbackUrl);

  return (
    <main className="flex min-h-screen items-center justify-center bg-emerald-50 px-6">
      <div className="max-w-lg space-y-3 rounded-2xl bg-white p-6 text-center shadow-lg">
        <p className="text-lg font-semibold text-emerald-900">Redirecting to Westlands…</p>
        <p className="text-sm text-slate-600">
          If you&apos;re not redirected automatically, use the link below to continue to the official
          Westlands Water District login page.
        </p>
        <a
          href={westlandsUrl}
          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Continue to Westlands
        </a>
      </div>
    </main>
  );
}
