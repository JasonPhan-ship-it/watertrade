"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import ListingOffersPanel, { type ListingOffersPanelProps } from "./ListingOffersPanel";
import type { Offer } from "@/components/listings/types";

export type ViewerRole = "buyer" | "seller" | "admin" | "unknown";

export type OffersPanelWithActionsProps = ListingOffersPanelProps & {
  viewerRole?: ViewerRole;
};

export default function OffersPanelWithActions({
  viewerRole = "unknown",
  // ListingOffersPanelProps (explicit, no spread)
  listingId,
  listingTitle,
  unitLabel,
  offers,
  currentStage,
  onAccept,
  onDecline,
  onCounter,
}: OffersPanelWithActionsProps) {
  const router = useRouter();

  /** Local, optimistically updated copy of offers */
  const [items, setItems] = useState<Offer[]>(offers);
  useEffect(() => {
    // If parent revalidated and provided a new array identity, adopt it.
    if (offers !== items) setItems(offers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers]);

  /** Track in-flight mutations per offer to avoid double clicks */
  const busy = useRef<Set<string>>(new Set());

  const patchOffer = useCallback((id: string, patch: Partial<Offer>) => {
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, []);

  const withBusy = useCallback(async (id: string, fn: () => Promise<void>) => {
    if (busy.current.has(id)) return;
    busy.current.add(id);
    try {
      await fn();
    } finally {
      busy.current.delete(id);
    }
  }, []);

  async function postJSON(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const data = await res.json();
        if ((data as any)?.error) message = (data as any).error;
      } catch {
        // ignore JSON parse error
      }
      throw new Error(message);
    }
    // Try to parse JSON; if none, return {}
    try {
      return await res.json();
    } catch {
      return {};
    }
  }

  /* -------- Role-aware endpoints (kept) -------- */

  function acceptRoute(offerId: string) {
    if (viewerRole === "seller" || viewerRole === "admin") return `/api/trades/${offerId}/seller/accept`;
    if (viewerRole === "buyer") return `/api/trades/${offerId}/buyer/accept`;
    return `/api/trades/${offerId}/seller/accept`;
  }
  function declineRoute(offerId: string) {
    if (viewerRole === "seller" || viewerRole === "admin") return `/api/trades/${offerId}/seller/decline`;
    if (viewerRole === "buyer") return `/api/trades/${offerId}/buyer/decline`;
    return `/api/trades/${offerId}/seller/decline`;
  }
  function counterRoute(offerId: string) {
    if (viewerRole === "seller" || viewerRole === "admin") return `/api/trades/${offerId}/seller/counter`;
    if (viewerRole === "buyer") return `/api/trades/${offerId}/buyer/counter`;
    return `/api/trades/${offerId}/seller/counter`;
  }

  /* ------------------- Button handlers (wired) ------------------- */

  const internalAccept = useCallback(
    (id: string) =>
      withBusy(id, async () => {
        const prev = items.find((o) => o.id === id);
        patchOffer(id, { status: "accepted", unread: false });
        try {
          await postJSON(acceptRoute(id));
          router.refresh();
        } catch (e: any) {
          if (prev) patchOffer(id, { status: prev.status, unread: prev.unread });
          alert(`Accept failed: ${e?.message || e}`);
        }
      }),
    [items, patchOffer, withBusy, router]
  );

  const internalDecline = useCallback(
    (id: string) =>
      withBusy(id, async () => {
        const prev = items.find((o) => o.id === id);
        patchOffer(id, { status: "declined", unread: false });
        try {
          await postJSON(declineRoute(id));
          router.refresh();
        } catch (e: any) {
          if (prev) patchOffer(id, { status: prev.status, unread: prev.unread });
          alert(`Decline failed: ${e?.message || e}`);
        }
      }),
    [items, patchOffer, withBusy, router]
  );

  const internalCounter = useCallback(
    (id: string) =>
      withBusy(id, async () => {
        const offer = items.find((o) => o.id === id);
        if (!offer) return;

        const fmt = (n: number) =>
          new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

        const rawAmount = window.prompt(`Counter amount (whole USD). Current: ${fmt(offer.amount)}`, String(offer.amount));
        if (rawAmount == null) return; // user canceled

        const amount = Math.max(0, Math.round(Number(rawAmount)));
        if (!Number.isFinite(amount)) {
          alert("Please enter a valid number.");
          return;
        }
        const terms = window.prompt("Optional terms/notes:", offer.terms ?? "") ?? undefined;

        const prev = { ...offer };
        patchOffer(id, { status: "countered", amount, terms, unread: false });

        try {
          await postJSON(counterRoute(id), { amount, terms });
          router.refresh();
        } catch (e: any) {
          patchOffer(id, prev); // rollback
          alert(`Counter failed: ${e?.message || e}`);
        }
      }),
    [items, patchOffer, withBusy, router]
  );

  /* --------------------------- Merge handlers --------------------------- */

  const mergedOnAccept = onAccept ?? internalAccept;
  const mergedOnDecline = onDecline ?? internalDecline;
  const mergedOnCounter = onCounter ?? internalCounter;

  /* --------------------------- Render --------------------------- */

  return (
    <ListingOffersPanel
      listingId={listingId}
      listingTitle={listingTitle}
      unitLabel={unitLabel}
      offers={items}
      currentStage={currentStage}
      onAccept={mergedOnAccept}
      onDecline={mergedOnDecline}
      onCounter={mergedOnCounter}
    />
  );
}
