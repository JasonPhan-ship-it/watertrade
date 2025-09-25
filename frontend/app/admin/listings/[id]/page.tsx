// frontend/app/admin/listings/[id]/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import OffersPanelWithActions from "@/components/listings/OffersPanelWithActions";
import type { ReactNode } from "react";
import type { Offer, DealStage } from "@/components/listings/types";

export const revalidate = 0;

export default async function AdminListingDetailPage({ params }: { params: { id: string } }) {
  // --- Fetch listing ---
  const listing = await prisma.listing.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      description: true,
      district: true,
      waterType: true,
      acreFeet: true,
      pricePerAF: true,
      status: true,
      // Include only if it exists in your schema; safe-cast below
      // @ts-ignore
      transactionStatus: true,
    },
  });
  if (!listing) return notFound();

  // --- Fetch trades/offers for this listing ---
  const trades = await prisma.trade.findMany({
    where: { listingId: listing.id },
    orderBy: { createdAt: "desc" },
    include: { buyer: true, seller: true },
  });

  // Map DB trade rows -> UI Offer[]
  const offers: Offer[] = trades.map((t: any) => ({
    id: String(t.id),
    // Admin view: treat all as "received" (you can change to role-aware if desired)
    side: "received",
    fromParty: t.buyer?.name ?? t.buyerName ?? t.seller?.name ?? t.sellerName ?? "Counterparty",
    amount: Math.round(Number(t.pricePerAf ?? t.pricePerAF ?? t.totalAmount ?? 0)),
    terms: t.terms ?? undefined,
    createdAt: (t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt)).toISOString(),
    expiresAt: t.expiresAt ? (t.expiresAt instanceof Date ? t.expiresAt : new Date(t.expiresAt)).toISOString() : undefined,
    status:
      t.status === "ACCEPTED" ? "accepted" :
      t.status === "DECLINED" ? "declined" :
      t.status === "COUNTERED" ? "countered" : "pending",
    unread: Boolean(t.viewerHasSeen === false),
    notes: t.note ?? undefined,
  }));

  // Map optional transactionStatus -> DealStage (if you track it)
  const currentStage: DealStage | null = (() => {
    const s = (listing as any)?.transactionStatus as string | undefined;
    switch (s) {
      case "SIGNING_IN_PROGRESS": return "SIGNING_IN_PROGRESS";
      case "ESCROW_OPENED": return "ESCROW_OPENED";
      case "DUE_DILIGENCE": return "DUE_DILIGENCE";
      case "CLOSING_SCHEDULED": return "CLOSING_SCHEDULED";
      case "CLOSED": return "CLOSED";
      case "OFFER_ACCEPTED": return "OFFER_ACCEPTED";
      case "CONTRACTS_DRAFTED": return "CONTRACTS_DRAFTED";
      case "OFFER_SENT": return "OFFER_SENT";
      default: return null;
    }
  })();

  const pricePerAfDollars = (listing.pricePerAF ?? 0) / 100;

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{listing.title ?? "Untitled Listing"}</h1>
        <p className="mt-1 text-sm text-slate-600">{listing.description ?? "No description provided."}</p>
      </header>

      {/* Basic facts (optional; mirror your public page as needed) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Detail label="District" value={listing.district} />
        <Detail label="Water Type" value={listing.waterType} />
        <Detail label="Acre-Feet" value={formatInt(listing.acreFeet)} />
        <Detail label="Price $/AF" value={`$${format2(pricePerAfDollars)}`} />
        <Detail label="Status" value={listing.status} />
      </div>

      {/* Offers & Activity for Admin */}
      <OffersPanelWithActions
        listingId={listing.id}
        unitLabel="Total ($)"
        offers={offers}
        currentStage={currentStage}
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function formatInt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
function format2(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
