// app/sign/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";

export default function SignPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>(); // can be null in types
  const searchParams = useSearchParams();

  // Normalize id to a plain string ('' if unavailable)
  const id = useMemo(() => {
    const raw = params?.id as unknown;
    if (Array.isArray(raw)) return raw[0] ?? "";
    return (raw as string) ?? "";
  }, [params]);

  const role = searchParams.get("role") ?? "";
  const token = searchParams.get("token") ?? "";

  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setErr("Missing signing ID in the URL.");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/sign-url?id=${encodeURIComponent(id)}&role=${encodeURIComponent(role)}&token=${encodeURIComponent(token)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`Failed to get sign URL (${res.status})`);
        const data = await res.json();
        if (!data?.url) throw new Error("No signing URL returned.");
        setUrl(data.url);
      } catch (e: any) {
        setErr(e?.message || "Failed to start signing session.");
      }
    })();
  }, [id, role, token]);

  if (err) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <h1 className="text-lg font-semibold">Can’t open signing session</h1>
        <p className="mt-2 text-sm text-slate-600">{err}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-white"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <p className="text-sm text-slate-600">Loading signing session…</p>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full">
      <iframe
        src={url}
        className="h-full w-full border-0"
        allow="camera; microphone; autoplay; clipboard-read; clipboard-write"
        title="Dropbox Sign"
      />
    </div>
  );
}
