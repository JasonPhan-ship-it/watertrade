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
  /** Identify viewer (non-fatal if this fails) */
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

  /** Listing core details */
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
        status: "ACTIVE" | "UNDER_CONTRACT" | "SOLD" | "ARCHIVED" | string;
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

  const rawTitle = (row.title || "").trim();
  const description = (row.description || "").trim() || "No description provided.";

  // Smart display title: nicer heading if DB title is very short / acronym (e.g., "AEWD")
  function isSkimpyTitle(t: string) {
    if (!t) return true;
    const trimmed = t.trim();
    const looksLikeAcronym = /^[A-Z]{2,6}$/.test(trimmed);
    return trimmed.length < 6 || looksLikeAcronym;
  }
  const displayTitle =
    !isSkimpyTitle(rawTitle)
      ? rawTitle
      : [
          row.kind === "BUY" ? "Buyer Request" : "For Sale",
          row.acreFeet ? `${new Intl.NumberFormat("en-US").format(row.acreFeet)} AF` : null,
          row.waterType || null,
          row.district || null,
        ]
          .filter(Boolean)
          .join(" · ") || "Listing";

  /** Fetch trades/offers for the Offers & Activity Panel */
  let trades: any[] = [];
  try {
    trades = await prisma.trade.findMany({
      where: { listingId: row.id },
      orderBy: { createdAt: "desc" },
      include: { buyer: true, seller: true },
    });
  } catch (e) {
    console.error("[listing page] prisma.trade.findMany failed", e);
  }

  /** Map trades -> panel Offer[] shape */
  type Offer = import("@/components/listings/ListingOffersPanel").Offer;
  const offers: Offer[] = trades.map((t: any) => {
    const price = Number(t.pricePerAf ?? t.pricePerAF ?? t.totalAmount ?? 0);
    const createdAt: string = (t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt)).toISOString();

    const expiresAt: string | undefined = t.expiresAt
      ? (t.expiresAt instanceof Date ? t.expiresAt : new Date(t.expiresAt)).toISOString()
      : undefined;

    const side =
      t.sellerUserId && viewerDbUserId ? (t.sellerUserId === viewerDbUserId ? "received" : "sent") : "received";

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

  /** Progress bar: temporarily disabled (no transactionStatus on Listing) */
  type DealStage = import("@/components/listings/ListingOffersPanel").DealStage;
  const currentStage: DealStage | null = null;

  return (
    <div className="mx-auto max-w-6xl">
      {/* Sticky summary header (meta trimmed per request) */}
      <nav className="sticky top-0 z-30 border-b bg-white/85 backdrop-blur">
        <div className="px-6 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Breadcrumbs />
              <span className="text-slate-300">/</span>
              <h1 className="truncate text-lg font-semibold text-slate-900">{displayTitle}</h1>
              <StatusPill status={row.status} />
            </div>
            {/* Meta row: removed District, Water Type, AF */}
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              <Meta label="$ / AF" value={`$${format2(pricePerAfDollars)}`} />
              <Meta label="Kind" value={row.kind === "BUY" ? "Buyer Looking" : "For Sale"} />
              <Meta label="Created" value={formatDate(row.createdAt)} />
            </div>
          </div>

          {!isOwner && row.kind === "SELL" && (
            <div className="flex items-center gap-2">
              <a
                href="#buy-now"
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Buy / Make Offer
              </a>
            </div>
          )}
        </div>
      </nav>

      {/* Body */}
      <div className="p-6">
        {/* Intro blurb */}
        <p className="text-sm text-slate-600">{description}</p>

        {/* Details + Action panel */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr,380px]">
          {/* Left: Offers & Activity */}
          <section className="space-y-6">
            <OffersPanelWithActions
              listingId={row.id}
              listingTitle={displayTitle}
              unitLabel="Total ($)"
              offers={offers}
              currentStage={currentStage}
              // handlers are provided by the client shim
            />
          </section>

          {/* Right: stacked cards (Buy/Offer + How actions work + Footer buttons) */}
          <div className="space-y-6">
            {/* Buy / Offer (only when viewer isn't owner and listing is SELL) */}
            {!isOwner && row.kind === "SELL" && (
              <aside
                id="buy-now"
                className="sticky top-24 h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-3">
                  <div className="text-sm font-semibold text-slate-900">Buy / Offer</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Submit a firm offer or propose new terms. Escrow managed by a licensed third party.
                  </div>
                </div>

                <ListingActions
                  listingId={row.id}
                  kind="SELL"
                  pricePerAf={pricePerAfDollars}
                  isAuction={false}
                  reservePrice={null}
                />

                <ul className="mt-4 space-y-1 text-xs text-slate-600">
                  <li>• Funds held in escrow</li>
                  <li>• District fees settled at closing</li>
                  <li>• Support available 9–5 PT</li>
                </ul>

                {/* Helper note */}
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="flex items-start gap-2">
                    <Info aria-hidden className="mt-0.5 h-5 w-5 text-emerald-600" />
                    <p>
                      Prices shown are dollars per acre-foot. Final settlement may vary with conveyance and district fees.
                    </p>
                  </div>
                </div>
              </aside>
            )}

            {/* How actions work (right column only) */}
            <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">How actions work</div>
              <p className="mt-1 text-xs text-slate-600">
                <strong>Accept</strong> locks the price and moves the deal to contracts.{" "}
                <strong>Decline</strong> closes the thread.{" "}
                <strong>Counter</strong> lets you revise price/terms and re-send.
              </p>
            </aside>

            {/* Footer actions moved to right column */}
            <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard"
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                >
                  Back to Listings
                </Link>
                {isOwner && (
                  <Link
                    href={`/listings/${row.id}/edit`}
                    className="rounded-xl bg-[#004434] px-4 py-2 text-sm font-semibold text-white hover:bg-[#00392f] "
                  >
                    Edit Listing
                  </Link>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Helpers & small UI atoms (no shadcn) ---------- */

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-slate-500">{label}:</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls: Record<string, string> = {
    ACTIVE: "bg-blue-100 text-blue-700",
    UNDER_CONTRACT: "bg-amber-100 text-amber-800",
    SOLD: "bg-emerald-100 text-emerald-800",
    ARCHIVED: "bg-slate-100 text-slate-600",
    DECLINED: "bg-rose-100 text-rose-700",
    EXPIRED: "bg-slate-200 text-slate-700",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${
        cls[status] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {prettyStatus(status)}
    </span>
  );
}

function prettyStatus(s: string) {
  return s.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (t) => t.toUpperCase());
}

function Breadcrumbs() {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <Link href="/dashboard" className="hover:text-slate-700">
        Dashboard
      </Link>
      <span>/</span>
      <Link href="/dashboard" className="hover:text-slate-700">
        Listings
      </Link>
    </div>
  );
}

function format2(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDate(d: Date) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(d));
  } catch {
    return new Date(d).toLocaleString();
  }
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
