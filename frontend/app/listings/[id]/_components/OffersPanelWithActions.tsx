"use client";

import { useRouter } from "next/navigation";
import ListingOffersPanel, {
  type ListingOffersPanelProps,
} from "./ListingOffersPanel";

/** Tiny client shim to wire panel buttons to your existing API routes. */
export default function OffersPanelWithActions(props: ListingOffersPanelProps) {
  const router = useRouter();

  async function call(url: string, method: "POST" = "POST") {
    const res = await fetch(url, { method });
    if (!res.ok) {
      const msg = await res.text().catch(() => "Request failed");
      throw new Error(msg);
    }
    router.refresh();
  }

  // NOTE: choose buyer/seller endpoints based on who the viewer is.
  // If you want to branch by role, pass a viewerRole prop and switch below.
  return (
    <ListingOffersPanel
      {...props}
      onAccept={(offerId) =>
        call(`/api/trades/${offerId}/seller/accept`)
      }
      onDecline={(offerId) =>
        call(`/api/trades/${offerId}/buyer/decline`) // or /seller/decline if appropriate
      }
      onCounter={(offerId) =>
        call(`/api/trades/${offerId}/buyer/counter`) // usually you'd show a modal to collect terms/price
      }
    />
  );
}
