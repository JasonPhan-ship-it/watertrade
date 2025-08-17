// frontend/app/admin/transactions/page.tsx
import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  createdAt: Date;
  type: string;
  status: string;
  acreFeet: number;
  pricePerAF: number;   // cents
  totalAmount: number;  // cents
  listingTitleSnapshot: string | null;
  listing?: { title: string | null } | null;
  buyer?: { name: string | null; email: string | null } | null;
  seller?: { name: string | null; email: string | null } | null;
};

export default async function AdminTransactionsPage() {
  // --- Auth + ensure local user exists
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  let me = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!me) {
    const cu = await clerkClient.users.getUser(userId);
    const email =
      cu?.emailAddresses?.find(e => e.id === cu.primaryEmailAddressId)?.emailAddress ||
      cu?.emailAddresses?.[0]?.emailAddress ||
      `${userId}@example.local`;
    const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.username || null;
    me = await prisma.user.create({
      data: { clerkId: userId, email, name: name ?? undefined },
    });
  }

  if (me.role !== "ADMIN") redirect("/dashboard");

  // --- Spot price cards ---
  // Listing Spot: median of active SELL listings' pricePerAF (cents)
  const activeSell = await prisma.listing.findMany({
    where: { status: "ACTIVE", kind: "SELL" },
    select: { pricePerAF: true }, // cents
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const listingSpotCents = median(activeSell.map(x => x.pricePerAF).filter(isFiniteNumber));

  // Transacted Spot: median of completed transactions' pricePerAF (cents)
  const completed = await prisma.transaction.findMany({
    where: { status: { in: ["APPROVED", "FUNDS_RELEASED"] } },
    select: { pricePerAF: true }, // cents
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const transactedSpotCents = median(completed.map(x => x.pricePerAF).filter(isFiniteNumber));

  // --- Transactions table (with degraded fallback) ---
  let txns: Row[] = [];
  let degraded = false;
  let loadError: string | null = null;

  try {
    // Full query (includes snapshots + relations)
    txns = await prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        createdAt: true,
        type: true,
        status: true,
        acreFeet: true,
        pricePerAF: true,
        totalAmount: true,
        listingTitleSnapshot: true,
        listing: { select: { title: true } },
        buyer: { select: { name: true, email: true } },
        seller: { select: { name: true, email: true } },
      },
    });
  } catch (e: any) {
    // Log the real reason on the server and fall back
    console.error("Admin /transactions full select failed:", e);
    loadError = e?.message || String(e);
    degraded = true;

    const basic = await prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        createdAt: true,
        type: true,
        status: true,
        acreFeet: true,
        pricePerAF: true,
        totalAmount: true,
      },
    });

    // Map into Row shape with nulls for the fields we didn't fetch
    txns = basic.map((b) => ({
      ...b,
      listingTitleSnapshot: null,
      listing: null,
      buyer: null,
      seller: null,
    }));
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      {/* Header + actions */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Admin
        </h1>
        <a
          href="/admin/export"
          className="inline-flex h-10 items-center rounded-xl bg-[#004434] px-4 text-sm font-medium text-white hover:bg-[#00392f]"
        >
          Download Excel
        </a>
      </div>

      {/* Simple tabs */}
      <div className="mb-6 flex gap-2">
        <a
          href="/admin/transactions"
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800"
        >
          Transactions
        </a>
        <a
          href="/admin/analytics"
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Water District Analytics
        </a>
      </div>

      {/* Spot price cards */}
      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card
          title="Listing Spot Price"
          value={listingSpotCents != null ? `${usdCents(listingSpotCents)} / AF` : "—"}
          subtitle="Median of active SELL listings"
        />
        <Card
          title="Transacted Spot Price"
          value={transactedSpotCents != null ? `${usdCents(transactedSpotCents)} / AF` : "—"}
          subtitle="Median of completed transactions"
        />
      </section>

      {degraded && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Running in “degraded” mode. A database error occurred fetching all fields
          (e.g. missing snapshot columns). Showing a reduced set instead.
          {process.env.NODE_ENV !== "production" && loadError ? (
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs">{loadError}</pre>
          ) : null}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <Th>Created</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Listing</Th>
              <Th>Buyer</Th>
              <Th>Seller</Th>
              <Th className="text-right">AF</Th>
              <Th className="text-right">Price / AF</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {txns.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={9}>
                  No transactions yet.
                </td>
              </tr>
            ) : (
              txns.map((t) => {
                const listingTitle = t.listingTitleSnapshot || t.listing?.title || "—";
                const buyer = t.buyer?.name || t.buyer?.email || "—";
                const seller = t.seller?.name || t.seller?.email || "—";
                return (
                  <tr key={t.id} className="border-t border-slate-100">
                    <Td>{new Date(t.createdAt).toLocaleString()}</Td>
                    <Td>{t.type}</Td>
                    <Td>{t.status}</Td>
                    <Td>{listingTitle}</Td>
                    <Td>{buyer}</Td>
                    <Td>{seller}</Td>
                    <Td align="right">{num(t.acreFeet)}</Td>
                    <Td align="right">{usdCents(t.pricePerAF)}/AF</Td>
                    <Td align="right">{usdCents(t.totalAmount)}</Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

/* ---------- small components & utils ---------- */
function Card({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-slate-500 text-sm">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={`px-4 py-3 font-medium ${className}`}>{children}</th>;
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <td
      className={`px-4 py-3 ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : ""
      }`}
    >
      {children}
    </td>
  );
}

function num(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
function usdCents(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}
function median(ns: number[]) {
  if (!ns.length) return null;
  const arr = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
}
