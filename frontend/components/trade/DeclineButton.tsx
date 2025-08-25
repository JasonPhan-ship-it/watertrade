// components/trades/DeclineButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button"; // shadcn button already in your project (optional)

type Props = {
  /** Pass the *transaction* id that your /api/trades/[id]/seller/decline route expects */
  transactionId: string;
  /** Optional: run instead of router.refresh() (e.g., to redirect or revalidate parent state) */
  onSuccess?: () => void;
  /** Optional: customize button label */
  label?: string;
  /** Optional: add className for layout control */
  className?: string;
};

export default function DeclineButton({
  transactionId,
  onSuccess,
  label = "Decline",
  className,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function handleDecline() {
    if (!transactionId) return;
    const confirmed = window.confirm(
      "Are you sure you want to decline this trade? This cannot be undone."
    );
    if (!confirmed) return;

    try {
      setBusy(true);
      setErr(null);

      const res = await fetch(`/api/trades/${transactionId}/seller/decline`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        // Try to read a structured error
        let message = "Decline failed.";
        try {
          const j = await res.json();
          message = j?.error || message;
        } catch {
          message = (await res.text()) || message;
        }
        throw new Error(message);
      }

      // Success: either call back to parent or refresh the current page
      if (onSuccess) onSuccess();
      else router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Something went wrong declining the trade.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button
        variant="destructive" // If your Button supports variants; otherwise style via className below
        onClick={handleDecline}
        disabled={busy}
        className="inline-flex h-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
        title="Decline this trade"
      >
        {busy ? "Declining…" : label}
      </Button>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  );
}
