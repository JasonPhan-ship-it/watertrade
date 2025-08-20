// components/trade/TradeRunner.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  tradeId: string;
  role: string; // "seller" | "buyer"
  token: string;
  action: string; // optional: "accept" | "counter" | "decline" | "sign"
  defaultPricePerAf: number;
  defaultVolumeAf: number;
  defaultWindowLabel: string;
  disabled?: boolean;
};

function endpointFor(role: string, action: string, tradeId: string, token: string) {
  const base = `/api/trades/${tradeId}`;
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  if (role === "seller" && action === "accept") return `${base}/seller/accept${qs}`;
  if (role === "seller" && action === "counter") return `${base}/seller/counter${qs}`;
  if (role === "buyer" && action === "counter") return `${base}/buyer/counter${qs}`;
  if (role === "buyer" && action === "decline") return `${base}/buyer/decline${qs}`;
  return "";
}

export default function TradeActionRunner(props: Props) {
  const {
    tradeId,
    role,
    token,
    action,
    defaultPricePerAf,
    defaultVolumeAf,
    defaultWindowLabel,
    disabled,
  } = props;

  const [pricePerAf, setPricePerAf] = useState(defaultPricePerAf);
  const [volumeAf, setVolumeAf] = useState(defaultVolumeAf);
  const [windowLabel, setWindowLabel] = useState(defaultWindowLabel);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<null | { kind: "ok" | "err"; text: string }>(null);

  const supportsAccept = role === "seller";
  const supportsCounter = role === "seller" || role === "buyer";
  const supportsDecline = role === "buyer";

  const canAuto = useMemo(() => {
    if (!action) return false;
    if (action === "accept" && supportsAccept) return true;
    if (action === "counter" && supportsCounter) return true;
    if (action === "decline" && supportsDecline) return true;
    return false;
  }, [action, supportsAccept, supportsCounter, supportsDecline]);

  useEffect(() => {
    const run = async () => {
      if (!canAuto || disabled) return;
      if (action === "counter") await onCounter();
      else if (action === "accept") await onAccept();
      else if (action === "decline") await onDecline();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    run();
  }, [canAuto, disabled]);

  const onAccept = async () => {
    const url = endpointFor(role, "accept", tradeId, token);
    if (!url) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const r = await fetch(url, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Failed to accept.");
      setMessage({ kind: "ok", text: "Accepted — the buyer has been emailed to sign." });
    } catch (e: any) {
      setMessage({ kind: "err", text: e?.message || "Something went wrong." });
    } finally {
      setSubmitting(false);
    }
  };

  const onCounter = async () => {
    const url = endpointFor(role, "counter", tradeId, token);
    if (!url) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricePerAf, volumeAf, windowLabel }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Failed to send counter.");
      setMessage({ kind: "ok", text: "Counter sent — the other party has been emailed." });
    } catch (e: any) {
      setMessage({ kind: "err", text: e?.message || "Something went wrong." });
    } finally {
      setSubmitting(false);
    }
  };

  const onDecline = async () => {
    const url = endpointFor(role, "decline", tradeId, token);
    if (!url) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const r = await fetch(url, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Failed to decline.");
      setMessage({ kind: "ok", text: "Declined — the seller has been notified." });
    } catch (e: any) {
      setMessage({ kind: "err", text: e?.message || "Something went wrong." });
    } finally {
      setSubmitting(false);
    }
  };

  if (disabled) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-600">
        This secure link can’t be used. Please open the newest email or{" "}
        <a href="/sign-in" className="underline">sign in</a>.
      </div>
    );
  }

  return (
    <div>
      {message && (
        <div
          className={`mb-4 rounded-xl border p-3 text-sm ${
            message.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {supportsAccept && (
          <button
            onClick={onAccept}
            disabled={submitting}
            className="rounded-xl bg-[#004434] px-4 py-2 text-white hover:bg-[#003a2f] disabled:opacity-50"
          >
            {submitting ? "Working…" : "Accept"}
          </button>
        )}

        {supportsCounter && (
          <details className="group rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer select-none text-sm font-medium text-slate-800">
              Make a Counter
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs text-slate-600">
                Price per AF (cents)
                <input
                  value={pricePerAf}
                  onChange={(e) => setPricePerAf(parseInt(e.target.value || "0", 10))}
                  inputMode="numeric"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600">
                Volume (AF)
                <input
                  value={volumeAf}
                  onChange={(e) => setVolumeAf(parseInt(e.target.value || "0", 10))}
                  inputMode="numeric"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600 sm:col-span-3">
                Window Label (optional)
                <input
                  value={windowLabel}
                  onChange={(e) => setWindowLabel(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-3">
              <button
                onClick={onCounter}
                disabled={submitting}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Send Counter"}
              </button>
            </div>
          </details>
        )}

        {supportsDecline && (
          <button
            onClick={onDecline}
            disabled={submitting}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            {submitting ? "Working…" : "Decline"}
          </button>
        )}
      </div>
    </div>
  );
}
