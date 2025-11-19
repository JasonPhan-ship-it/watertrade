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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

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

  const persistCredentials = () => {
    if (!username || !password) {
      setFormError("Enter your Westlands username and password to continue.");
      return false;
    }

    try {
      const payload = { username, password, savedAt: Date.now() };
      sessionStorage.setItem("westlandsCredentials", JSON.stringify(payload));
      setFormError(null);
      return true;
    } catch (error) {
      console.error("Unable to store Westlands credentials", error);
      setFormError("We couldn't save your credentials locally. Try again.");
      return false;
    }
  };

  const handleFinish = () => {
    const ok = persistCredentials();
    if (!ok) return;
    window.location.href = callbackUrl;
  };

  const handleFinish = () => {
    const ok = persistCredentials();
    if (!ok) return;
    window.location.href = callbackUrl;
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-emerald-50 px-6">
      <div className="max-w-lg space-y-4 rounded-2xl bg-white p-6 text-center shadow-lg">
        <p className="text-lg font-semibold text-emerald-900">Open Westlands and prep your credentials</p>
        <p className="text-sm text-slate-600">
          We&apos;re launching the Westlands Water District login in a separate tab so you can return here once you&apos;re done. Enter your
          Westlands username and password so we can securely finish syncing after you complete the login.
        </p>
        <form
          className="space-y-3 text-left"
          onSubmit={(event) => {
            event.preventDefault();
            handleFinish();
          }}
        >
          <label className="block text-sm font-semibold text-emerald-900" htmlFor="westlands-username">
            Westlands username
          </label>
          <input
            id="westlands-username"
            name="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm text-emerald-900 shadow-inner focus:border-emerald-300 focus:outline-none focus:ring"
            autoComplete="username"
            placeholder="Example: jsmith"
            required
          />
          <label className="block text-sm font-semibold text-emerald-900" htmlFor="westlands-password">
            Password
          </label>
          <input
            id="westlands-password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm text-emerald-900 shadow-inner focus:border-emerald-300 focus:outline-none focus:ring"
            autoComplete="current-password"
            placeholder="Enter your password"
            required
          />
          <p className="text-xs text-emerald-700">
            We only keep these credentials in your browser until the sync finishes and never store them on the page.
          </p>
          {formError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
        <form
          className="space-y-3 text-left"
          onSubmit={(event) => {
            event.preventDefault();
            handleFinish();
          }}
        >
          <label className="block text-sm font-semibold text-emerald-900" htmlFor="westlands-username">
            Westlands username
          </label>
          <input
            id="westlands-username"
            name="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm text-emerald-900 shadow-inner focus:border-emerald-300 focus:outline-none focus:ring"
            autoComplete="username"
            placeholder="Example: jsmith"
            required
          />
          <label className="block text-sm font-semibold text-emerald-900" htmlFor="westlands-password">
            Password
          </label>
          <input
            id="westlands-password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm text-emerald-900 shadow-inner focus:border-emerald-300 focus:outline-none focus:ring"
            autoComplete="current-password"
            placeholder="Enter your password"
            required
          />
          <p className="text-xs text-emerald-700">
            We only keep these credentials in your browser until the sync finishes and never store them on the page.
          </p>
          {formError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <a
              href={westlandsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
              onClick={persistCredentials}
            >
              Open Westlands login
            </a>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200 transition hover:bg-emerald-100"
            >
              Finish connection
            </button>
          </div>
        </form>
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
