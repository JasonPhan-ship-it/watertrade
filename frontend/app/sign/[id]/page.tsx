// app/sign/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";

type SignState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; url: string }
  | { kind: "error"; message: string };

export default function SignPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  // --- Derive route/query params safely (avoid TS “possibly null”) ---
  const id = useMemo(() => {
    const raw = params?.id as unknown;
    if (Array.isArray(raw)) return raw[0] ?? "";
    return (raw as string) ?? "";
  }, [params]);

  const role = (searchParams ? searchParams.get("role") : null) ?? "";
  const token = (searchParams ? searchParams.get("token") : null) ?? "";

  const [state, setState] = useState<SignState>({ kind: "idle" });
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const startSigning = useCallback(async () => {
    if (!id) {
      setState({ kind: "error", message: "Missing signing ID in the URL." });
      return;
    }
    setState({ kind: "loading" });

    const ac = new AbortController();
    try {
      const res = await fetch(
        `/api/sign-url?id=${encodeURIComponent(id)}&role=${encodeURIComponent(role)}&token=${encodeURIComponent(token)}`,
        { cache: "no-store", signal: ac.signal }
      );
      if (!res.ok) {
        const errBody = await safeJson(res);
        const msg = errBody?.error || `Failed to get sign URL (${res.status})`;
        throw new Error(msg);
      }
      const data = (await res.json()) as { url?: string };
      if (!data?.url) throw new Error("No signing URL was returned by the server.");
      setState({ kind: "ready", url: data.url });
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setState({ kind: "error", message: e?.message || "Failed to start signing session." });
    }
    return () => ac.abort();
  }, [id, role, token]);

  useEffect(() => {
    startSigning();
  }, [startSigning]);

  // Optional: handle messages from embedded signer (e.g., completion)
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      // Some embedded providers post messages you can listen for
      // For Dropbox Sign, you can also rely on your webhook to finalize state.
      // Keep this as a placeholder in case you want to handle close/complete events.
      // console.debug("[sign iframe message]", ev.data);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // --- UI ---

  if (state.kind === "error") {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center p-6 text-center">
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Can’t open signing session</h1>
          <p className="mt-2 text-sm text-slate-600">
            {state.message}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => startSigning()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Retry
            </button>
            <button
              onClick={() => router.back()}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Go Back
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            If this keeps happening, contact support and include Trade ID <span className="font-mono">{id || "?"}</span>.
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === "loading" || state.kind === "idle") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
          <h2 className="mt-4 text-base font-semibold text-slate-900">Preparing your signing session…</h2>
          <p className="mt-2 text-sm text-slate-600">
            Verifying access and creating the embedded signature request.
          </p>
        </div>
      </div>
    );
  }

  // Ready: render iframe full-bleed
  return (
    <div className="flex h-[100dvh] w-full flex-col">
      {/* Top bar (optional) */}
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
            onClick={() => startSigning()}
            className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            aria-label="Reload signing session"
          >
            Reload
          </button>
        </div>
      </div>

      {/* Signing frame */}
      <div className="relative flex-1">
        <iframe
          ref={iframeRef}
          src={state.url}
          className="h-full w-full border-0"
          allow="camera; microphone; autoplay; clipboard-read; clipboard-write"
          title="Dropbox Sign"
        />
      </div>

      {/* Footer hint (optional) */}
      <div className="border-t border-slate-200 bg-white/70 px-4 py-2 text-center text-xs text-slate-500">
        Trouble loading? Click <button onClick={() => startSigning()} className="underline hover:text-slate-700">reload</button>. Trade ID: <span className="font-mono">{id}</span> {role && <>· Role: <span className="font-mono">{role}</span></>}
      </div>
    </div>
  );
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
