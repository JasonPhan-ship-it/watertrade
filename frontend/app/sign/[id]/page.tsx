// app/sign/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import SignClient from "./SignClient";

type SignState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; url: string; testMode: boolean }
  | { kind: "error"; message: string; details?: unknown };

function isProdHost(host: string) {
  return host === "watertraders.com" || host.endsWith(".watertraders.com");
}

export default function SignPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  // Route/query params
  const id = useMemo(() => {
    const raw = params?.id as unknown;
    return Array.isArray(raw) ? (raw[0] ?? "") : ((raw as string) ?? "");
  }, [params]);

  const role = (searchParams?.get("role") ?? "").trim();
  const token = (searchParams?.get("token") ?? "").trim();

  const [state, setState] = useState<SignState>({ kind: "idle" });

  // Centralized loader so Retry/Reload can reuse it
  const start = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) {
        setState({ kind: "error", message: "Missing signing ID in the URL." });
        return;
      }
      setState({ kind: "loading" });

      try {
        const qs = new URLSearchParams({ id });
        if (role) qs.set("role", role);
        if (token) qs.set("token", token);

        const res = await fetch(`/api/sign-url?${qs.toString()}`, {
          cache: "no-store",
          signal,
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.url) {
          // Special handling for 403s so the user gets a clear next step
          if (res.status === 403) {
            const reason = data?.reason || data?.error || "Forbidden";
            throw new Error(`Forbidden – ${reason}`);
          }
          throw new Error(data?.error || `Failed to get sign URL (${res.status})`);
        }

        setState({ kind: "ready", url: data.url, testMode: !!data.testMode });
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setState({
          kind: "error",
          message: e?.message || "Failed to start signing session.",
          details: e,
        });
      }
    },
    [id, role, token]
  );

  // Kick off on mount/param changes
  useEffect(() => {
    const ac = new AbortController();
    start(ac.signal);
    return () => ac.abort();
  }, [start]);

  // Soft guard: warn if this page somehow loads inside a non-WT iframe
  useEffect(() => {
    try {
      if (window.self !== window.top) {
        const parent = document.referrer ? new URL(document.referrer).hostname : "";
        if (parent && !isProdHost(parent)) {
          // eslint-disable-next-line no-console
          console.warn("[sign] Page is running inside an iframe from:", parent);
        }
      }
    } catch {
      // cross-origin access may throw; ignore
    }
  }, []);

  if (state.kind === "error") {
    // Build redirect back to this page after auth
    const redirectUrl =
      typeof window !== "undefined"
        ? encodeURIComponent(window.location.pathname + window.location.search)
        : encodeURIComponent(`/sign/${id}${role ? `?role=${role}` : ""}`);

    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center p-6 text-center">
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Can’t open signing session</h1>
          <p className="mt-2 text-sm text-slate-600">{state.message}</p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => start()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Retry
            </button>
            <a
              href={`/sign-in?redirect_url=${redirectUrl}`}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign in
            </a>
            <button
              onClick={() => router.back()}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Go Back
            </button>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Trade ID <span className="font-mono">{id || "?"}</span>
            {role && (
              <>
                {" "}
                · Role <span className="font-mono">{role}</span>
              </>
            )}
            {token && (
              <>
                {" "}
                · Token <span className="font-mono">present</span>
              </>
            )}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Tip: You must be the {role || "seller/buyer"} on this trade. If you received a secure
            link, ensure it includes a valid <span className="font-mono">token</span>.
          </p>
        </div>
      </div>
    );
  }

  if (state.kind !== "ready") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
          <h2 className="mt-4 text-base font-semibold text-slate-900">
            Preparing your signing session…
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Verifying access and creating the embedded request.
          </p>
        </div>
      </div>
    );
  }

  // Ready: DO NOT iframe the URL; SignClient opens the HelloSign modal with clientId.
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white/70 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          <h1 className="truncate text-sm font-medium text-slate-800">
            Water Traders — Embedded Signing
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            aria-label="Go back"
          >
            Back
          </button>
          <button
            onClick={() => start()}
            className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            aria-label="Reload signing session"
          >
            Reload
          </button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 text-sm text-slate-600">
        Opening signer…
      </div>

      {/* Mounting this opens the modal; key ensures a clean re-open on Reload */}
      <SignClient key={state.url} signUrl={state.url} isTestMode={state.testMode} />
    </div>
  );
}
