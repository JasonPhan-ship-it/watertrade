"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [popupStatus, setPopupStatus] = useState<"pending" | "opened" | "blocked">("pending");

  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") return null;
    const callback = new URL("/westlands/callback", window.location.origin);
    callback.searchParams.set("next", next);
    return callback.toString();
  }, [next]);

  useEffect(() => {
    if (!callbackUrl) return;

    const westlandsUrl = buildWestlandsLoginUrl(callbackUrl);
    const openPopup = () => {
      const popup = window.open(westlandsUrl, "_blank", "noopener,noreferrer");
      if (popup) {
        setPopupStatus("opened");
        popup.focus();
      } else {
        setPopupStatus("blocked");
      }
    };
    
    const timer = window.setTimeout(openPopup, 300);
    return () => window.clearTimeout(timer);
  }, [callbackUrl]);

  if (!callbackUrl) {
    return null;
  }

  const westlandsUrl = buildWestlandsLoginUrl(callbackUrl);

  return (
    <main className="flex min-h-screen items-center justify-center bg-emerald-50 px-6">
      <div className="max-w-lg space-y-4 rounded-2xl bg-white p-6 text-center shadow-lg">
        <p className="text-lg font-semibold text-emerald-900">Opening Westlands in a new tab…</p>
        <p className="text-sm text-slate-600">
          We&apos;re launching the Westlands Water District login in a separate tab so you can return here once you&apos;re done. If the
          pop-up is blocked, use the buttons below.
        </p>
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <a
            href={westlandsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Open Westlands login
          </a>
          <a
            href={callbackUrl}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200 transition hover:bg-emerald-100"
          >
            Finish connection
          </a>
        </div>
        <div className="rounded-lg bg-emerald-50 p-4 text-left text-sm text-emerald-900">
          <p className="font-semibold">Stuck on the Westlands welcome page?</p>
          <p className="text-emerald-800">
            If Westlands leaves you on <code>LoginWelcome.asp</code> after signing in, return here and click <strong>Finish connection</strong> to
            sync your account.
          </p>
          <p className="mt-3 text-emerald-800">
            You can also paste the callback link below directly into the browser bar of the Westlands tab to force the return to our app:
          </p>
          <code className="mt-2 block break-all rounded-md bg-white px-3 py-2 font-mono text-xs text-emerald-900 shadow-inner">
            {callbackUrl}
          </code>
          {popupStatus === "blocked" && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-amber-900">
              Your browser blocked the pop-up. Use <span className="font-semibold">Open Westlands login</span> above to launch the page manually.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
