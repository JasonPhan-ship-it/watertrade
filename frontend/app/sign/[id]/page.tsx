// app/sign/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import SignClient from "./SignClient";

type SignState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; url: string; testMode: boolean }
  | { kind: "error"; message: string };

export default function SignPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const id = useMemo(() => {
    const raw = params?.id as unknown;
    return Array.isArray(raw) ? (raw[0] ?? "") : ((raw as string) ?? "");
  }, [params]);

  const role  = (searchParams?.get("role")  ?? "").trim();
  const token = (searchParams?.get("token") ?? "").trim();

  const [state, setState] = useState<SignState>({ kind: "idle" });

  const start = useCallback(async () => {
    if (!id) return setState({ kind: "error", message: "Missing signing ID in the URL." });
    setState({ kind: "loading" });

    try {
      const qs = new URLSearchParams({ id });
      if (role)  qs.set("role", role);
      if (token) qs.set("token", token);

      const res = await fetch(`/api/sign-url?${qs}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error || `Failed to get sign URL (${res.status})`);
      setState({ kind: "ready", url: data.url, testMode: !!data.testMode });
    } catch (e: any) {
      setState({ kind: "error", message: e?.message || "Failed to start signing session." });
    }
  }, [id, role, token]);

  useEffect(() => { start(); }, [start]);

  if (state.kind === "error") {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center p-6 text-center">
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Can’t open signing session</h1>
          <p className="mt-2 text-sm text-slate-600">{state.message}</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button onClick={start} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Retry</button>
            <button onClick={() => router.back()} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Go Back</button>
          </div>
          <p className="mt-4 text-xs text-slate-500">Trade ID <span className="font-mono">{id || "?"}</span></p>
        </div>
      </div>
    );
  }

  if (state.kind !== "ready") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
          <h2 className="mt-4 text-base font-semibold text-slate-900">Preparing your signing session…</h2>
          <p className="mt-2 text-sm text-slate-600">Verifying access and creating the embedded request.</p>
        </div>
      </div>
    );
  }

  // No iframe here — the embed opens via SignClient (modal)
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white/70 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          <h1 className="truncate text-sm font-medium text-slate-800">Water Traders — Embedded Signing</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => history.back()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Back</button>
          <button onClick={start} className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">Reload</button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 text-sm text-slate-600">
        Opening signer…
      </div>

      <SignClient key={state.url} signUrl={state.url} isTestMode={state.testMode} />
    </div>
  );
}
