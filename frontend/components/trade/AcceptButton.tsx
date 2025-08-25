// components/trade/AcceptButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  postUrl: string;
  label?: string;
  className?: string;
  confirm?: boolean;
  confirmMessage?: string;
  onSuccess?: () => void;
};

export default function AcceptButton({
  postUrl,
  label = "Accept",
  className,
  confirm = true,
  confirmMessage = "Accept this offer?",
  onSuccess,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setErr(null);
    if (confirm && !window.confirm(confirmMessage)) return;

    try {
      setBusy(true);

      const res = await fetch(postUrl, {
        method: "POST",
        credentials: "include",
        headers: {
          // Tell the server we want JSON so it returns { redirect }
          "Accept": "application/json",
          "X-Requested-With": "fetch",
        },
      });

      const ct = res.headers.get("content-type") || "";
      const isJson = ct.includes("application/json");

      if (!res.ok) {
        const message = isJson
          ? ((await res.json()).error || "Accept failed.")
          : ((await res.text().catch(() => "")) || "Accept failed.");
        throw new Error(message);
      }

      // Expect JSON with a redirect URL
      const body = isJson ? await res.json().catch(() => null) : null;
      const redirect = body?.redirect as string | undefined;

      if (redirect) {
        window.location.href = redirect;
        return;
      }

      // Fallback: refresh if no redirect provided
      if (onSuccess) onSuccess();
      alert("Offer accepted!");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Something went wrong while accepting.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={
          className ??
          "inline-flex h-9 items-center justify-center rounded-xl bg-[#004434] px-4 text-sm font-semibold text-white hover:bg-[#003a2f] disabled:opacity-60"
        }
        title="Accept this offer"
      >
        {busy ? "Accepting…" : label}
      </button>

      {err && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}
    </div>
  );
}
