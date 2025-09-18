// app/listings/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { Info } from "lucide-react";

export const revalidate = 0; // always fresh

type PageProps = { params: { id: string } };

export default async function ListingDetailPage({ params }: PageProps) {
  // Who is viewing? (for ownership check)
  const { userId: clerkId } = auth();
  let viewerDbUserId: string | null = null;
  if (clerkId) {
    const viewer = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    viewerDbUserId = viewer?.id ?? null;
  }

  // Only select columns that exist
  const row = await prisma.listing.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      description: true,
      district: true,
      waterType: true,
      acreFeet: true,
      pricePerAF: true,        // cents
      kind: true,              // SELL | BUY
      status: true,
      createdAt: true,
      updatedAt: true,
      sellerId: true,          // used to determine ownership
    },
  });

  if (!row) return notFound();

  const isOwner = !!viewerDbUserId && row.sellerId === viewerDbUserId;
  const pricePerAfDollars = (row.pricePerAF ?? 0) / 100;

  const title = (row.title || "").trim() || "Untitled Listing";
  const description = (row.description || "").trim() || "No description provided.";

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
          {isOwner && (
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
              Your listing
            </span>
          )}
        </div>
      </div>

      {/* Details + Action panel */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr,380px]">
        {/* Left: Facts */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Detail label="District" value={row.district} />
          <Detail label="Water Type" value={row.waterType} />
          <Detail label="Acre-Feet" value={formatInt(row.acreFeet)} />
          <Detail label="Price $/AF" value={`$${format2(pricePerAfDollars)}`} />
          <Detail label="Status" value={row.status} />
          <Detail label="Created" value={new Date(row.createdAt).toLocaleString()} />
          <Detail label="Updated" value={new Date(row.updatedAt).toLocaleString()} />
        </section>

        {/* Right: Actions — hide for owner, only show for SELL listings */}
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
                <p>
                  Prices shown are dollars per acre-foot. Final settlement may vary with conveyance and district fees.
                </p>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Back link + manage for owner */}
      <div className="mt-8 flex items-center gap-3">
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

/* ---------- Lazy import so this file stays a Server Component ---------- */
import ListingActions from "@/components/ListingActions";
