"use client";

import * as React from "react";

export function WaterTraderFeeForm({ initialRate }: { initialRate: number }) {
  const [percent, setPercent] = React.useState<string>(() => formatPercent(initialRate));
  const [status, setStatus] = React.useState<"idle" | "saving">("idle");
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [lastSavedRate, setLastSavedRate] = React.useState<number>(initialRate);

  React.useEffect(() => {
    setPercent(formatPercent(initialRate));
    setLastSavedRate(initialRate);
  }, [initialRate]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "saving") return;

    const nextPercent = Number(percent);
    if (!Number.isFinite(nextPercent) || nextPercent < 0 || nextPercent > 100) {
      setError("Enter a percentage between 0 and 100.");
      return;
    }

    const rate = nextPercent / 100;
    const formatted = formatPercent(rate);
    const formattedDisplay = `${formatted}%`;

    if (Math.abs(rate - lastSavedRate) < 0.000001) {
      setMessage(`Water Trader Fee is already set to ${formattedDisplay}.`);
      setError(null);
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Update the Water Trader Fee to ${formattedDisplay}?`);
      if (!confirmed) {
        return;
      }
    }

    setStatus("saving");
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/site-settings/water-trader-fee", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Failed to update fee");
      }

      setLastSavedRate(rate);
      setPercent(formatted);
      setMessage(`Water Trader Fee updated to ${formattedDisplay}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      setError(message);
    } finally {
      setStatus("idle");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="feePercent">
          Water Trader Fee (%)
        </label>
        <div className="mt-2 flex max-w-xs items-center gap-2">
          <input
            id="feePercent"
            name="feePercent"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          <button
            type="submit"
            disabled={status === "saving"}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">Applies to listing previews and checkout estimates.</p>
      </div>

      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : null}
    </form>
  );
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0";
  return (value * 100).toFixed(2);
}
