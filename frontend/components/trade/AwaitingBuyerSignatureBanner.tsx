// components/trade/AwaitingBuyerSignatureBanner.tsx
"use client";

export default function AwaitingBuyerSignatureBanner() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
      <div className="font-semibold">Awaiting buyer signature</div>
      <div className="text-sm">
        We’ve emailed the buyer a link to review and sign the transfer document.
      </div>
    </div>
  );
}
