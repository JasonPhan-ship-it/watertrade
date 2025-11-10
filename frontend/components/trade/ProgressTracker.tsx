import * as React from "react";

import type { TradeProgressStep } from "@/lib/trade-progress";

function Indicator({ status }: { status: TradeProgressStep["status"] }) {
  if (status === "complete") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        ✓
      </span>
    );
  }
  if (status === "current") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-emerald-500 text-emerald-600">
        •
      </span>
    );
  }
  return <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-slate-400">•</span>;
}

export default function TradeProgressTracker({ steps }: { steps: TradeProgressStep[] }) {
  if (!steps.length) return null;

  return (
    <ol className="space-y-3">
      {steps.map((step) => (
        <li
          key={step.id}
          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 shadow-sm"
        >
          <Indicator status={step.status} />
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800">{step.title}</div>
            {step.description ? <p className="mt-1 text-xs text-slate-600">{step.description}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
