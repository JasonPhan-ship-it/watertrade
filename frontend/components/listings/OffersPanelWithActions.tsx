"use client";

import { useRouter } from "next/navigation";
import ListingOffersPanel, {
  type ListingOffersPanelProps,
} from "./ListingOffersPanel";

export type ViewerRole = "buyer" | "seller" | "admin" | "unknown";

export type OffersPanelWithActionsProps = ListingOffersPanelProps & {
  viewerRole?: ViewerRole;
};

export default function OffersPanelWithActions({
  viewerRole = "unknown",
  ...props
}: OffersPanelWithActionsProps) {
  const router = useRouter();

  async function call(url: string, method: "POST" = "POST", body?: any) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "Request failed");
      throw new Error(msg);
    }
    router.refresh();
  }

  function acceptRoute(offerId: string) {
    if (viewerRole === "seller" || viewerRole === "admin")
      return `/api/trades/${offerId}/seller/accept`;
    if (viewerRole === "buyer")
      return `/api/trades/${offerId}/buyer/accept`;
    return `/api/trades/${offerId}/seller/accept`;
  }
  function declineRoute(offerId: string) {
    if (viewerRole === "seller" || viewerRole === "admin")
      return `/api/trades/${offerId}/seller/decline`;
    if (viewerRole === "buyer")
      return `/api/trades/${offerId}/buyer/decline`;
    return `/api/trades/${offerId}/seller/decline`;
  }
  function counterRoute(offerId: string) {
    if (viewerRole === "seller" || viewerRole === "admin")
      return `/api/trades/${offerId}/seller/counter`;
    if (viewerRole === "buyer")
      return `/api/trades/${offerId}/buyer/counter`;
    return `/api/trades/${offerId}/seller/counter`;
  }

  return (
    <ListingOffersPanel
      {...props}
      onAccept={props.onAccept ?? ((offerId) => call(acceptRoute(offerId)))}
      onDecline={props.onDecline ?? ((offerId) => call(declineRoute(offerId)))}
      onCounter={props.onCounter ?? ((offerId) => call(counterRoute(offerId)))}
    />
  );
}
