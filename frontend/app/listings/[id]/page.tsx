// app/listings/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { Info } from "lucide-react";

export const revalidate = 0; // always fresh
// export const runtime = "nodejs"; // uncomment if anything accidentally pushed you to edge

type PageProps = { params: { id: string } };

export default async function ListingDetailPage({ params }: PageProps) {
  // Identify viewer (non-fatal if this fails)
  let viewerDbUserId: string | null = null;
  try {
    const { userId: clerkId } = auth();
    if (clerkId) {
      const viewer = await prisma.user.findUnique({
        where: { clerkId },
        select: { id: true },
      });
      viewerDbUserId = viewer?.id ?? null;
    }
  } catch (e) {
    console.error("[listing page] auth/prisma user lookup failed", e);
  }

  // --- Listing core details ---
  let row:
    | {
        id: string;
        title: string | null;
        description: string | null;
        district: string | null;
        waterType: string | null;
        acreFeet: number;
        pricePerAF: number | null; // cents
        kind: "SELL" | "BUY";
        status: string;
        createdAt: Date;
        updatedAt: Date;
        sellerId: string | null;
      }
    | null = null;

  try {
    row = await prisma.listing.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        title: true,
        description: true,
        district: true,
        waterType: true,
        acreFeet: true,
        pricePerAF: true, // cents
        kind: true, // SELL | BUY
        status: true,
        createdAt: true,
        updatedAt: true,
        sellerId: true,
      },
    });
  } catch (e) {
    console.error("[listing page] prisma.listing.findUnique failed", e);
    return <ServerError where="listing" />;
  }

  if (!row) return notFound();

  const isOwner = !!viewerDbUserId && row.sellerId === viewerDbUserId;
  const pricePerAfDollars = (row.pricePerAF ?? 0) / 100;

  const title = (row.title || "").trim() || "Untitled Listing";
  const description = (row.description || "").trim() || "No description provided.";

  // --- Fetch trades/offers for the Offers & Activity Panel ---
  let trades: any[] = [];
  try {
    trades = await prisma.trade.findMany({
      where: { listingId: row.id },
      orderBy: { createdAt: "desc" },
      include: { buyer: true, seller: true },
    });
  } catch (e) {
    console.error("[listing page] prisma.trade.findMany failed", e);
    // Non-fatal: panel will just show empty state
  }

  // Map trades -> panel Offer[] shape
  type Offer = import("@/components/listings/ListingOffersPanel").Offer;
  const offers: Offer[] = trades.map((t: any) => {
    const price = Number(t.pricePerAf ?? t.pricePerAF ?? t.totalAmount ?? 0);
    const createdAt: string = (t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt)).toISOString();

    const expiresAt: string | undefined = t.expiresAt
      ? (t.expiresAt instanceof Date ? t.expiresAt : new Date(t.expiresAt)).toISOString()
      : undefined;

    // From the current viewer's perspective
    const side =
      t.sellerUserId && viewerDbUserId ? (t.sellerUserId === viewerDbUserId ? "received" : "sent") : "received";

    // Status mapping (tweak to your enums)
    const status =
      t.status === "ACCEPTED" ? "accepted" :
      t.status === "DECLINED" ? "declined" :
      t.status === "COUNTERED" ? "countered" :
      "pending";

    return {
      id: String(t.id),
      side,
      fromParty:
        side === "received"
          ? (t.buyer?.name ?? t.buyerName ?? "Buyer")
          : (t.seller?.name ?? t.sellerName ?? "Seller"),
      amount: Math.round(price),
      terms: t.terms ?? undefined,
      createdAt,
      expiresAt,
      status,
      unread: Boolean(t.viewerHasSeen === false),
      notes: t.note ?? undefined,
    } as Offer;
  });

  // Progress bar: temporarily disabled (no transactionStatus on Listing)
  type DealStage = import("@/components/listings/ListingOffersPanel").DealStage;
  const currentStage: DealStage | null = null;

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#0A6B58] px-3 py-1 text-xs font-medium text-white">
            {row.kind === "BUY" ? "Buyer Looking" : "For Sale"}
          </span>
          {row.sellerId && isOwner && (
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
              Your listing
            </span>
          )}
        </div>
      </div>

      {/* Details + Action panel */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr,380px]">
        {/* Left: Facts + Offers & Activity */}
        <section className="space-y-6">
          {/* Facts */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Detail label="District" value={row.district ?? "—"} />
            <Detail label="Water Type" value={row.waterType ?? "—"} />
            <Detail label="Acre-Feet" value={formatInt(row.acreFeet)} />
            <Detail label="Price $/AF" value={`$${format2(pricePerAfDollars)}`} />
            <Detail label="Status" value={row.status} />
            <Detail label="Created" value={new Date(row.createdAt).toLocaleString()} />
            <Detail label="Updated" value={new Date(row.updatedAt).toLocaleString()} />
          </div>

          {/* Offers & Activity Panel */}
          <OffersPanelWithActions
            listingId={row.id}
            listingTitle={title}
            unitLabel="Total ($)"
            offers={offers}
            currentStage={currentStage}
            // handlers are provided by the client shim
          />
        </section>

        {/* Right: Buyer-side Actions — hide for owner, only for SELL listings */}
        {!isOwner && row.kind === "SELL" && (
          <aside className="sticky top-4 h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3">
              <div className="text-sm font-semibold text-slate-900">Buy Now / Offer</div>
              <div className="mt-1 text-xs text-slate-500">
                Buy it now or send an offer to the seller.
              </div>
            </div>

            <ListingActions
              listingId={row.id}
              kind="SELL"
              pricePerAf={pricePerAfDollars}
              isAuction={false}
              reservePrice={null}
            />

            {/* Optional helper note */}
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <Info aria-hidden className="mt-0.5 h-5 w-5 text-emerald-600" />
                <p>Prices shown are dollars per acre-foot. Final settlement may vary with conveyance and district fees.</p>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Back link + manage for owner */}
      <div className="mt-8 flex items-center gap-3">
        <Link href="/dashboard" className="rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
          Back to Listings
        </Link>
        {isOwner && (
          <Link href={`/listings/${row.id}/edit`} className="rounded-xl bg-[#004434] px-4 py-2 text-sm font-semibold text-white hover:bg-[#00392f] ">
            Edit Listing
          </Link>
        )}
      </div>
    </div>
  );
}

/* ---------- UI bits ---------- */
function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

/* ---------- format helpers ---------- */
function formatInt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
function format2(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ---------- Lazy imports so this file stays a Server Component ---------- */
import ListingActions from "@/components/ListingActions";
import OffersPanelWithActions from "@/components/listings/OffersPanelWithActions";

/* ---------- Inline server error helper ---------- */
function ServerError({ where }: { where: string }) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Something went wrong loading the {where}. Check server logs for details.
      </div>
    </div>
  );
}
