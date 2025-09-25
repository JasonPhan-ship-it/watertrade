"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  unitLabel,
  offers,
  currentStage,
  onAccept,
  onDecline,
  onCounter,
}: OffersPanelWithActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  /** Role/token surfaced by URL for magic-link flows */
  const urlRole = (searchParams.get("role") || "").toLowerCase() as "seller" | "buyer" | "";
  const urlToken = searchParams.get("token") || "";

  /** Local, optimistically updated copy of offers */
  const [items, setItems] = useState<Offer[]>(offers);
  useEffect(() => {
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

  /** Build headers/body auth hints consistent with your API routes */
  function buildAuthBits(roleForAction: "seller" | "buyer") {
    // prefer explicit viewerRole, but allow URL role (“magic link”) to drive body too
    const role = roleForAction;
    const token = urlToken || undefined;

    const headers: HeadersInit = token
      ? {
          "Content-Type": "application/json",
          "x-trade-token": token, // server also reads header tokens
        }
      : {
          "Content-Type": "application/json",
        };

    const bodyAuth: Record<string, string> = { role };
    if (token) bodyAuth.token = token;

    return { headers, bodyAuth };
  }

  async function postJSON(url: string, body?: unknown, extraHeaders?: HeadersInit) {
    const res = await fetch(url, {
      method: "POST",
      headers: extraHeaders ?? (body ? { "Content-Type": "application/json" } : undefined),
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
    try {
      return await res.json();
    } catch {
      return {};
    }
  }

  /* -------- Role-aware endpoints (paths) -------- */

  function acceptRoute(offerId: string) {
    if (viewerRole === "seller" || viewerRole === "admin" || urlRole === "seller")
      return `/api/trades/${offerId}/seller/accept`;
    if (viewerRole === "buyer" || urlRole === "buyer") return `/api/trades/${offerId}/buyer/accept`;
    // default to seller path; server will auth-check
    return `/api/trades/${offerId}/seller/accept`;
  }
  function declineRoute(offerId: string) {
    if (viewerRole === "seller" || viewerRole === "admin" || urlRole === "seller")
      return `/api/trades/${offerId}/seller/decline`;
    if (viewerRole === "buyer" || urlRole === "buyer") return `/api/trades/${offerId}/buyer/decline`;
    return `/api/trades/${offerId}/seller/decline`;
  }
  function counterRoute(offerId: string) {
    if (viewerRole === "seller" || viewerRole === "admin" || urlRole === "seller")
      return `/api/trades/${offerId}/seller/counter`;
    if (viewerRole === "buyer" || urlRole === "buyer") return `/api/trades/${offerId}/buyer/counter`;
    return `/api/trades/${offerId}/seller/counter`;
  }

  /* ------------------- Button handlers ------------------- */

  const internalAccept = useCallback(
    (id: string) =>
      withBusy(id, async () => {
        const prev = items.find((o) => o.id === id);
        // optimistic
        patchOffer(id, { status: "accepted", unread: false });

        // align with API: include role/token in body & header
        const roleForAction: "seller" | "buyer" =
          (viewerRole === "buyer" || urlRole === "buyer") ? "buyer" : "seller";
        const { headers, bodyAuth } = buildAuthBits(roleForAction);

        try {
          const resp = await postJSON(acceptRoute(id), bodyAuth, headers);
          // If server returns redirectUrl/signLink, prefer redirect (matches accept route)
          if (resp?.redirectUrl) {
            router.replace(resp.redirectUrl);
          } else {
            router.refresh();
          }
        } catch (e: any) {
          // rollback
          if (prev) patchOffer(id, { status: prev.status, unread: prev.unread });
          alert(`Accept failed: ${e?.message || e}`);
        }
      }),
    [items, patchOffer, withBusy, router, viewerRole, urlRole]
  );

  const internalDecline = useCallback(
    (id: string) =>
      withBusy(id, async () => {
        const prev = items.find((o) => o.id === id);
        // optimistic
        patchOffer(id, { status: "declined", unread: false });

        const roleForAction: "seller" | "buyer" =
          (viewerRole === "buyer" || urlRole === "buyer") ? "buyer" : "seller";
        const { headers, bodyAuth } = buildAuthBits(roleForAction);

        try {
          await postJSON(declineRoute(id), bodyAuth, headers);
          router.refresh();
        } catch (e: any) {
          if (prev) patchOffer(id, { status: prev.status, unread: prev.unread });
          alert(`Decline failed: ${e?.message || e}`);
        }
      }),
    [items, patchOffer, withBusy, router, viewerRole, urlRole]
  );

  const internalCounter = useCallback(
    (id: string) =>
      withBusy(id, async () => {
        const offer = items.find((o) => o.id === id);
        if (!offer) return;

        // Prompt for USD/AF and AF (volume). Route expects cents and AF numbers.
        const usdPrompt = window.prompt(
          "Counter price (USD per AF, e.g. 650.00):",
          offer.amount ? String(Math.max(0, Math.round(Number(offer.amount)))) : ""
        );
        if (usdPrompt == null) return;

        const volumePrompt = window.prompt("Counter volume (AF, whole number):", "");
        if (volumePrompt == null) return;

        const usdPerAf = Number(usdPrompt);
        const volumeAf = Number(volumePrompt);

        if (!Number.isFinite(usdPerAf) || !Number.isFinite(volumeAf)) {
          alert("Please enter valid numeric values for USD/AF and AF.");
          return;
        }
        if (usdPerAf <= 0 || volumeAf <= 0) {
          alert("USD/AF and AF must be greater than 0.");
          return;
        }

        // Convert dollars -> cents for API contract
        const pricePerAf = Math.round(usdPerAf * 100);

        const prev = { ...offer };
        // optimistic: mark as countered; we don’t have per-AF/volume on Offer type, so leave amount unchanged
        patchOffer(id, { status: "countered", unread: false });

        const roleForAction: "seller" | "buyer" =
          (viewerRole === "buyer" || urlRole === "buyer") ? "buyer" : "seller";
        const { headers, bodyAuth } = buildAuthBits(roleForAction);

        try {
          await postJSON(counterRoute(id), { ...bodyAuth, pricePerAf, volumeAf }, headers);
          router.refresh();
        } catch (e: any) {
          patchOffer(id, prev);
          alert(`Counter failed: ${e?.message || e}`);
        }
      }),
    [items, patchOffer, withBusy, router, viewerRole, urlRole]
  );

  /* --------------------------- Merge handlers --------------------------- */

  const mergedOnAccept = onAccept ?? internalAccept;
  const mergedOnDecline = onDecline ?? internalDecline;
  const mergedOnCounter = onCounter ?? internalCounter;

  /* --------------------------- Render --------------------------- */

  return (
    <ListingOffersPanel
      listingId={listingId}
      unitLabel={unitLabel}
      offers={items}
      currentStage={currentStage}
      onAccept={mergedOnAccept}
      onDecline={mergedOnDecline}
      onCounter={mergedOnCounter}
    />
  );
}
