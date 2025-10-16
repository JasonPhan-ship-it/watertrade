// app/listings/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { Check, ChevronRight, Clock, Info } from "lucide-react";
import NextDynamic from "next/dynamic";

export const revalidate = 0;
export const runtime = "nodejs"; // ensure Prisma runs on Node

// 🚫 Do NOT import types from client modules.
// Define local types instead to avoid accidental client-module resolution.
type OfferSide = "received" | "sent";
type OfferStatus = "pending" | "accepted" | "declined" | "expired" | "countered";
type DealStage =
  | "OFFER_SENT"
  | "OFFER_ACCEPTED"
  | "CONTRACTS_DRAFTED"
  | "SIGNING_IN_PROGRESS"
  | "ESCROW_OPENED"
  | "DUE_DILIGENCE"
  | "CLOSING_SCHEDULED"
  | "CLOSED";

type Offer = {
  id: string;
  side: OfferSide;
  fromParty: string;
  amount: number;
  terms?: string;
  createdAt: string;
  expiresAt?: string;
  status: OfferStatus;
  unread?: boolean;
  notes?: string;
};

// ✅ Load client components only on the client (alias avoids clash with route option `dynamic`)
const ListingActions = NextDynamic(() => import("@/components/ListingActions"), { ssr: false });
const OffersPanelWithActions = NextDynamic(
  () => import("@/components/listings/OffersPanelWithActions"),
  { ssr: false }
);

type PageProps = { params: { id: string } };

export default async function ListingDetailPage({ params }: PageProps) {
  try {
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
    const row = await prisma.listing.findUnique({
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

    if (!row) return notFound();

    const isOwner = !!viewerDbUserId && row.sellerId === viewerDbUserId;
    const pricePerAfDollars = Number(row.pricePerAF ?? 0) / 100;

    const rawTitle = formatAcreFeetFigures((row.title || "").trim());
    const description = (row.description || "").trim() || "No description provided.";

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

    const shouldShowDescription = (() => {
      const d = (description || "").trim();
      if (!d) return false;
      if (/^[A-Z]{2,6}$/.test(d)) return false;
      if (d === rawTitle || d === displayTitle) return false;
      if (d === "No description provided.") return false;
      return true;
    })();

    /** Fetch trades/offers (guard includes in case relations differ) */
    const STAGE_ORDER: DealStage[] = [
      "OFFER_SENT",
      "OFFER_ACCEPTED",
      "CONTRACTS_DRAFTED",
      "SIGNING_IN_PROGRESS",
      "ESCROW_OPENED",
      "DUE_DILIGENCE",
      "CLOSING_SCHEDULED",
      "CLOSED",
    ];

    const stageRank = (stage: DealStage | null | undefined) =>
      stage ? STAGE_ORDER.indexOf(stage) : -1;
    
    const toStageLabel = (stage: DealStage) => {
      switch (stage) {
        case "OFFER_SENT":
          return "Offer Sent";
        case "OFFER_ACCEPTED":
          return "Offer Accepted";
        case "CONTRACTS_DRAFTED":
          return "Contracts Drafted";
        case "SIGNING_IN_PROGRESS":
          return "Signing In Progress";
        case "ESCROW_OPENED":
          return "Escrow Opened";
        case "DUE_DILIGENCE":
          return "Due Diligence";
        case "CLOSING_SCHEDULED":
          return "Closing Scheduled";
        case "CLOSED":
          return "Closed";
      }
    };

    const mapOfferStatus = (status: string | null | undefined): OfferStatus => {
      const normalized = (status || "").toUpperCase();
      if (!normalized) return "pending";
      if (normalized === "DECLINED" || normalized === "CANCELLED") return "declined";
      if (normalized === "EXPIRED") return "expired";
      if (normalized === "FULLY_EXECUTED") return "accepted";
      if (normalized.startsWith("ACCEPTED")) return "accepted";
      if (normalized.startsWith("COUNTERED")) return "countered";
      return "pending";
    };

    const mapStageFromTrade = (status: string | null | undefined): DealStage | null => {
      const normalized = (status || "").toUpperCase();
      if (!normalized) return null;
      if (normalized === "FULLY_EXECUTED") return "CLOSED";
      if (normalized.startsWith("ACCEPTED")) return "OFFER_ACCEPTED";
      if (normalized.startsWith("COUNTERED") || normalized === "OFFERED") return "OFFER_SENT";
      return null;
    };

    const mapStageFromTransaction = (status: string | null | undefined): DealStage | null => {
      const normalized = (status || "").toUpperCase();
      switch (normalized) {
        case "PENDING_SELLER_SIGNATURE":
        case "PENDING_BUYER_SIGNATURE":
        case "AWAITING_BUYER_PAYMENT":
        case "PAYMENT_IN_REVIEW":
        case "COMPLIANCE_REVIEW":
          return "SIGNING_IN_PROGRESS";
        case "APPROVED":
          return "ESCROW_OPENED";
        case "FUNDS_RELEASED":
          return "CLOSED";
        default:
          return null;
      }
    };

    const mapStageFromListing = (status: string | null | undefined): DealStage | null => {
      switch ((status || "").toUpperCase()) {
        case "UNDER_CONTRACT":
          return "SIGNING_IN_PROGRESS";
        case "SOLD":
          return "CLOSED";
        default:
          return null;
      }
    };

    let trades: any[] = [];
    try {
      trades = await prisma.trade.findMany({
        where: { listingId: row.id },
        orderBy: { createdAt: "desc" },
        include: {
          buyer: true as any,
          seller: true as any,
          transaction: { select: { status: true } } as any,
        },
      });
    } catch (e) {
      console.error("[listing page] prisma.trade.findMany failed", e);
      trades = [];
    }

    /** Map trades -> Offer[] (defensive on field names/types) */
    const offers: Offer[] = trades.map((t: any) => {
      const price = Number(t?.pricePerAf ?? t?.pricePerAF ?? t?.totalAmount ?? 0) || 0;
      const createdAt = toIso(t?.createdAt);
      const expiresAt = t?.expiresAt ? toIso(t.expiresAt) : undefined;

      const side: OfferSide =
        t?.sellerUserId && viewerDbUserId
          ? t.sellerUserId === viewerDbUserId
            ? "received"
            : "sent"
          : "received";

      const status: OfferStatus = mapOfferStatus(t?.status);

      return {
        id: String(t?.id),
        side,
        fromParty: side === "received" ? "Buyer" : "Seller",
        amount: Math.round(price),
        terms: t?.terms ?? undefined,
        createdAt,
        expiresAt,
        status,
        unread: Boolean(t?.viewerHasSeen === false),
        notes: t?.note ?? undefined,
      };
    });

    const stagesFromTrades = trades
      .map((t: any) => {
        const tradeStage = mapStageFromTrade(t?.status);
        const txnStage = mapStageFromTransaction(t?.transaction?.status);
        return stageRank(txnStage) > stageRank(tradeStage) ? txnStage : tradeStage;
      })
      .filter((s): s is DealStage => Boolean(s));

    const stagesFromListing = mapStageFromListing(row.status);

    const currentStage: DealStage | null = [...stagesFromTrades, stagesFromListing]
      .filter((s): s is DealStage => Boolean(s))
      .sort((a, b) => stageRank(b) - stageRank(a))[0] ?? null;

    const currentStageIndex = currentStage ? stageRank(currentStage) : -1;
    const showTransactionProgress =
      currentStageIndex >= 0 && currentStageIndex >= stageRank("OFFER_ACCEPTED");
    const transactionProgressPct =
      currentStageIndex < 0
        ? 0
        : Math.max(0, Math.min(100, (currentStageIndex / (STAGE_ORDER.length - 1)) * 100));
    
    return (
      <div className="mx-auto max-w-6xl">
        {/* Sticky summary header */}
        <nav className="sticky top-0 z-30 border-b bg-white/85 backdrop-blur">
          <div className="px-6 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Breadcrumbs />
                <span className="text-slate-300">/</span>
                <h1 className="truncate text-lg font-semibold text-slate-900">{displayTitle}</h1>
                <StatusPill status={row.status} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <Meta label="$ / AF" value={`$${format2(pricePerAfDollars)}`} />
                <Meta label="Transaction Type" value={row.kind === "BUY" ? "Buyer Looking" : "For Sale"} />
                <Meta label="Created" value={formatDate(row.createdAt)} />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {isOwner && (
                <Link
                  href={`/listings/${row.id}/edit`}
                  className="rounded-xl bg-[#004434] px-4 py-2 text-sm font-semibold text-white hover:bg-[#00392f]"
                >
                  Edit Listing
                </Link>
              )}
              <Link
                href="/dashboard"
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back to Listings
              </Link>
            </div>
          </div>
        </nav>

        {/* Body */}
        <div className="p-6">
          {shouldShowDescription && <p className="text-sm text-slate-600">{description}</p>}

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr,380px]">
            {/* Left: Offers & Activity */}
            <section className="space-y-6">
              {/* client component, SSR disabled */}
              <OffersPanelWithActions
                listingId={row.id}
                unitLabel="Total ($)"
                offers={offers}
                currentStage={currentStage}
              />
            </section>

            {/* Right: stacked cards */}
            <div className="space-y-6">
              {!isOwner && row.kind === "SELL" && (
                <aside id="buy-now" className="sticky top-24 h-fit">
                  <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-sm font-semibold text-slate-900">Buy / Offer</div>
                    <div className="mt-1 text-xs text-slate-500">Submit an offer or purchase now.</div>
                  </div>

                  {/* client component, SSR disabled */}
                  <ListingActions
                    listingId={row.id}
                    kind="SELL"
                    pricePerAf={pricePerAfDollars}
                    isAuction={false}
                    reservePrice={null}
                  />

                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                    <div className="flex items-start gap-2">
                      <Info aria-hidden className="mt-0.5 h-7 w-7 text-emerald-600" />
                      <p className="leading-relaxed">
                        All funds are securely held in escrow and the final settlement amount may vary based on
                        conveyance and applicable district fees.
                      </p>
                    </div>
                  </div>
                </aside>
              )}

              {isOwner && (
                <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-sm font-semibold text-slate-900">How actions work</div>
                  <p className="mt-2 text-xs text-slate-600">
                    <strong>Accept</strong> locks the price and moves the deal to contracts. <strong>Decline</strong> closes
                    the thread. <strong>Counter</strong> lets you revise price/terms and re-send.
                  </p>
                </aside>
              )}
              
              {showTransactionProgress && currentStage && (
                <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-sm font-semibold text-slate-900">Transaction Progress</div>
                  <p className="mt-1 text-xs text-slate-600">Live status once signing begins</p>
                  <div className="mt-4 space-y-4">
                    <div className="relative h-2 w-full rounded-full bg-slate-100">
                      <div
                        className="absolute left-0 top-0 h-2 rounded-full bg-emerald-600"
                        style={{ width: `${transactionProgressPct}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      {STAGE_ORDER.map((stage, index) => (
                        <div
                          key={stage}
                          className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
                            index < currentStageIndex
                              ? "bg-green-100 text-green-700"
                              : index === currentStageIndex
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {index < currentStageIndex ? (
                            <Check className="h-3 w-3" />
                          ) : index === currentStageIndex ? (
                            <Clock className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          <span>{toStageLabel(stage)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  } catch (err) {
    // Ensure we log *something* server-side for Vercel logs
    console.error("[listing page] fatal render error:", err);
    // Re-throw so app/listings/[id]/error.tsx can render a friendly UI if present
    throw err;
  }
}

/* ---------- Helpers ---------- */

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-slate-500">{label}:</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

function formatAcreFeetFigures(title: string) {
  if (!title) return title;
  return title.replace(/\b(\d{4,})(?=\s*AF\b)/gi, (match) => {
    const numeric = Number(match);
    return Number.isNaN(numeric) ? match : new Intl.NumberFormat("en-US").format(numeric);
  });
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
    <span className={`rounded-full px-2 py-0.5 text-xs ${cls[status] ?? "bg-slate-100 text-slate-700"}`}>
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
function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v as any);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
