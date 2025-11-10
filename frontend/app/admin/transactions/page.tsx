import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import TradeProgressTracker from "@/components/trade/ProgressTracker";
import { buildTradeProgressSteps, type TradeProgressStep } from "@/lib/trade-progress";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Party = { name: string | null; email: string | null };

type Row = {
  id: string;
  createdAt: Date;
  type: string;
  status: string;
  acreFeet: number;
  pricePerAF: number; // cents
  totalAmount: number; // cents
  listingTitleSnapshot: string | null;
  listing?: { title: string | null } | null;
  buyer?: Party | null;
  seller?: Party | null;
  trade?: {
    status: string | null;
    sellerSignStatus: string | null;
    buyerSignStatus: string | null;
  } | null;
};

export type DisplayRow = Omit<Row, "buyer" | "seller"> & {
  listingTitle: string;
  buyer: string;
  seller: string;
  created: string;
  shortId: string;
  progressSteps: TradeProgressStep[];
  hasLinkedTrade: boolean;
};

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  // --- Auth + ensure local user exists
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  let me = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!me) {
    const cu = await clerkClient.users.getUser(userId);
    const email =
      cu?.emailAddresses?.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ||
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
  const listingSpotCents = median(activeSell.map((x) => x.pricePerAF).filter(isFiniteNumber));

  // Transacted Spot: median of completed transactions' pricePerAF (cents)
  const completed = await prisma.transaction.findMany({
    where: { status: { in: ["APPROVED", "FUNDS_RELEASED"] } },
    select: { pricePerAF: true }, // cents
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const transactedSpotCents = median(completed.map((x) => x.pricePerAF).filter(isFiniteNumber));

  // --- Transactions table (with degraded fallback) ---
  const MAX_RECENT_TRANSACTIONS = 300;

  let txns: Row[] = [];
  let degraded = false;
  let loadError: string | null = null;

  try {
    // Full query (includes snapshots + relations)
    txns = await prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: MAX_RECENT_TRANSACTIONS,
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
        trade: {
          select: {
            status: true,
            sellerSignStatus: true,
            buyerSignStatus: true,
          },
        },
      },
    });
  } catch (e: any) {
    // Log the real reason on the server and fall back
    console.error("Admin /transactions full select failed:", e);
    loadError = e?.message || String(e);
    degraded = true;

    const basic = await prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: MAX_RECENT_TRANSACTIONS,
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
      trade: null,
    }));
  }

  const search = (() => {
    const raw = searchParams?.q;
    if (Array.isArray(raw)) return raw[0]?.trim() ?? "";
    if (typeof raw === "string") return raw.trim();
    return "";
  })();
  const normalizedSearch = search.toLowerCase();

  const rows = txns.map<DisplayRow>((t) => {
    const { buyer: buyerInfo, seller: sellerInfo, ...base } = t;
    const listingTitle = t.listingTitleSnapshot || t.listing?.title || "—";
    const buyer = formatParty(buyerInfo);
    const seller = formatParty(sellerInfo);
    const created = formatDate(t.createdAt);
    const shortId = t.id.length > 12 ? `${t.id.slice(0, 8)}…` : t.id;
    const hasLinkedTrade = Boolean(t.trade);
    const progressSteps = hasLinkedTrade
      ? buildTradeProgressSteps({
          tradeStatus: t.trade?.status,
          sellerSignStatus: t.trade?.sellerSignStatus,
          buyerSignStatus: t.trade?.buyerSignStatus,
          txStatus: t.status,
        })
      : [];

    return {
      ...base,
      listingTitle,
      buyer,
      seller,
      created,
      shortId,
      progressSteps,
      hasLinkedTrade,
    };
  });

  const filteredRows = normalizedSearch
    ? rows.filter((row) =>
        [
          row.listingTitle,
          row.buyer,
          row.seller,
          row.type,
          row.status,
          row.shortId,
          row.id,
        ]
          .map((value) => value.toLowerCase())
          .some((value) => value.includes(normalizedSearch)),
      )
    : rows;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Admin</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review recent marketplace transactions and spot pricing trends.
          </p>
        </div>
        <a
          href="/admin/export"
          className="inline-flex h-10 items-center rounded-xl bg-[#004434] px-4 text-sm font-medium text-white shadow-sm transition hover:bg-[#00392f]"
        >
          Download Excel
        </a>
      </div>

      <nav className="mt-8 flex flex-wrap gap-2 text-sm">
        <a
          href="/admin/transactions"
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-900 shadow-sm"
        >
          Transactions
        </a>
        <a
          href="/admin/analytics"
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-slate-600 transition hover:bg-slate-50"
        >
          Water District Analytics
        </a>
      </nav>

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
          Running in “degraded” mode. A database error occurred fetching all fields (for example, missing snapshot columns).
          Showing a reduced data set instead.
          {process.env.NODE_ENV !== "production" && loadError ? (
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-amber-100 p-2 text-xs text-amber-900">
              {loadError}
            </pre>
          ) : null}
        </div>
      )}

      <section className="mt-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Recent Transactions</h2>
            <span className="mt-1 block text-sm text-slate-500">
              Showing up to {MAX_RECENT_TRANSACTIONS.toLocaleString()} latest entries
            </span>
          </div>
          <form
            action="/admin/transactions"
            method="get"
            className="flex w-full max-w-md items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-[#004434] focus-within:ring-offset-2 sm:w-auto"
          >
            <label htmlFor="transaction-search" className="sr-only">
              Search transactions
            </label>
            <input
              id="transaction-search"
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Search transactions"
              className="w-full border-none bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              autoComplete="off"
            />
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-[#004434] px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#00392f]"
            >
              Search
            </button>
            {search ? (
              <a
                href="/admin/transactions"
                className="text-sm font-medium text-[#004434] transition hover:text-[#00392f]"
              >
                Clear
              </a>
            ) : null}
          </form>
        </header>

        {filteredRows.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
            {rows.length === 0
              ? "No transactions yet."
              : `No transactions match “${search}”.`}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {filteredRows.map((row) => (
              <TransactionCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

/* ---------- small components & utils ---------- */
function Card({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function TransactionCard({ row }: { row: DisplayRow }) {
  return (
    <article className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{row.created}</div>
          <div className="text-xs text-slate-500">ID: {row.shortId}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill label={row.type} tone={row.type === "BUY" ? "sky" : row.type === "SELL" ? "emerald" : "slate"} />
          <StatusPill label={row.status} tone={statusTone(row.status)} />
        </div>
      </header>

      <dl className="grid gap-4">
        <InfoSection title="Listing" value={row.listingTitle} />

        <div className="grid gap-4 sm:grid-cols-2">
          <InfoSection title="Buyer" value={row.buyer} />
          <InfoSection title="Seller" value={row.seller} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label="Acre-Feet" value={num(row.acreFeet)} />
          <Metric label="Price / AF" value={usdCents(row.pricePerAF)} />
          <Metric label="Total" value={usdCents(row.totalAmount)} emphasized />
        </div>
      </dl>

      {row.hasLinkedTrade && row.progressSteps.length > 0 ? (
        <div className="border-t border-slate-200 pt-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Progress</div>
          <div className="mt-3">
            <TradeProgressTracker steps={row.progressSteps} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

function InfoSection({ title, value }: { title: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value ?? "—"}</dd>
    </div>
  );
}

function Metric({ label, value, emphasized }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 font-semibold text-slate-900 ${emphasized ? "text-base" : "text-sm"}`}>{value}</div>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  const colors: Record<Tone, string> = {
    emerald: "bg-emerald-100 text-emerald-800",
    sky: "bg-sky-100 text-sky-800",
    amber: "bg-amber-100 text-amber-800",
    slate: "bg-slate-100 text-slate-700",
    rose: "bg-rose-100 text-rose-800",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${colors[tone]}`}>
      {label}
    </span>
  );
}

type Tone = "emerald" | "sky" | "amber" | "slate" | "rose";

function statusTone(status: string): Tone {
  const normalized = status.toUpperCase();
  if (["APPROVED", "FUNDS_RELEASED", "COMPLETED"].includes(normalized)) return "emerald";
  if (["PENDING", "IN_REVIEW"].includes(normalized)) return "amber";
  if (["CANCELLED", "REJECTED", "FAILED"].includes(normalized)) return "rose";
  return "slate";
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

function formatParty(party?: Party | null) {
  return party?.name || party?.email || "—";
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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
