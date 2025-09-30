"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptOffer, declineOffer } from "./actions";

export default function OfferDecisionButtons({
  offerId,
  listingId,
}: { offerId: string; listingId: string }) {
  const [isPending, start] = useTransition();
  const router = useRouter();

  const run = (fn: (a: {offerId: string; listingId: string}) => Promise<{ok:boolean; error?:string}>) =>
    start(async () => {
      const res = await fn({ offerId, listingId });
      if (!res.ok) { console.error(res.error); return; }
      router.refresh(); // stay on the same page
    });

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => run(acceptOffer)}
        disabled={isPending}
        className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-white disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Accept"}
      </button>
      <button
        type="button"
        onClick={() => run(declineOffer)}
        disabled={isPending}
        className="inline-flex items-center rounded-md bg-slate-200 px-3 py-2 text-slate-900 disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Decline"}
      </button>
    </div>
  );
}
