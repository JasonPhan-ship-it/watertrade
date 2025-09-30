"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptOffer, declineOffer } from "./actions";

type ActionResult = { ok: true } | { ok: false; error: string };

export default function OfferDecisionButtons({
  offerId,
  listingId,
}: {
  offerId: string;
  listingId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Prevent rapid double-clicks across both buttons
  const inFlight = useRef(false);

  const run = useCallback(
    (fn: (a: { offerId: string; listingId: string }) => Promise<ActionResult>, which: "accept" | "decline") => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(which);
      setError(null);

      startTransition(async () => {
        try {
          const res = await fn({ offerId, listingId });
          if (!res.ok) {
            setError(res.error || "Something went wrong");
            return;
          }
          // Stay on the same page and refetch fresh data
          router.refresh();
        } catch (e) {
          setError("Network or server error");
          // optional: console.error(e);
        } finally {
          inFlight.current = false;
          setBusy(null);
        }
      });
    },
    [offerId, listingId, router]
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => run(acceptOffer, "accept")}
          disabled={isPending || busy !== null}
          aria-busy={busy === "accept"}
          className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-white disabled:opacity-50"
          title="Accept this offer"
        >
          {busy === "accept" ? "Saving..." : "Accept"}
        </button>

        <button
          type="button"
          onClick={() => run(declineOffer, "decline")}
          disabled={isPending || busy !== null}
          aria-busy={busy === "decline"}
          className="inline-flex items-center rounded-md bg-slate-200 px-3 py-2 text-slate-900 disabled:opacity-50"
          title="Decline this offer"
        >
          {busy === "decline" ? "Saving..." : "Decline"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
