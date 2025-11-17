"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  transactionId: string;
  disabled?: boolean;
  currentStatus: string;
};

export default function DecisionPanel({ transactionId, disabled, currentStatus }: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"accept" | "decline" | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  async function submit(decision: "accept" | "decline") {
    setPending(decision);
    setMessage(null);
    try {
      const res = await fetch(`/api/district/transactions/${transactionId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(typeof data?.error === "string" ? data.error : "We couldn’t save your decision.");
        return;
      }

      setMessage(decision === "accept" ? "Trade approved." : "Trade declined.");
      router.refresh();
    } catch (err) {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setPending(null);
    }
  }

  const actionDisabled = disabled || pending !== null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">District decision</p>
          <p className="text-sm text-slate-700">Current status: {currentStatus}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => submit("decline")}
            disabled={actionDisabled}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending === "decline" ? "Declining…" : "Decline"}
          </button>
          <button
            type="button"
            onClick={() => submit("accept")}
            disabled={actionDisabled}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pending === "accept" ? "Approving…" : "Accept"}
          </button>
        </div>
      </div>
      {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
    </div>
  );
}
