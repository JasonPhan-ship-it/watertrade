// app/admin/transactions/page.tsx
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import DownloadTransactionsButton from "./DownloadTransactionsButton";

type PageProps = {
  searchParams?: {
    from?: string; // YYYY-MM-DD
    to?: string;   // YYYY-MM-DD
  };
};

function parseDate(d?: string) {
  if (!d) return null;
  const date = new Date(d);
  return Number.isFinite(date.valueOf()) ? date : null;
}
function toStartOfDay(d: Date) {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  return dd;
}
function toEndOfDay(d: Date) {
  const dd = new Date(d);
  dd.setHours(23, 59, 59, 999);
  return dd;
}
function moneyFromCents(cents: number) {
  return (cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default async function AdminTransactionsPage({ searchParams }: PageProps) {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  // Ensure we have a local User and check ADMIN
  let me = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!me) {
    const cu = await clerkClient.users.getUser(userId);
    const email =
      cu?.emailAddresses?.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ||
      cu?.emailAddresses?.[0]?.emailAddress ||
      `${userId}@example.local`;
    const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.username || null;
    me = await prisma.user.create({ data: { clerkId: userId, email, name: name ?? undefined } });
  }
  if (me.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const fromParam = parseDate(searchParams?.from);
  const toParam = parseDate(searchParams?.to);
  const where: any = {};
  if (fromParam || toParam) {
    where.createdAt = {};
    if (fromParam) where.createdAt.gte = toStartOfDay(fromParam);
    if (toParam) where.createdAt.lte = toEndOfDay(toParam);
  }

  const txns = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 250, // cap for UI
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
      buyer: { select: { email: true, name: true } },
      seller: { select: { email: true, name: true } },
    },
  });

  // Quick KPI
  const count = txns.length;
  const sumTotal = txns.reduce((s, t) => s + (t.totalAmount || 0), 0);
  const avgTotal = count ? sumTotal / count : 0;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Admin · Transactions</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/settings"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Settings
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm">
          From
          <input
            type="date"
            name="from"
            defaultValue={searchParams?.from || ""}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          To
          <input
            type="date"
            name="to"
            defaultValue={searchParams?.to || ""}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <button className="h-10 rounded-xl border border-slate-300 px-4 text-sm hover:bg-slate-50">
          Apply
        </button>

        <div className="ml-auto">
          <DownloadTransactionsButton from={searchParams?.from} to={searchParams?.to} />
        </div>
      </form>

      {/* KPIs */}
      <section className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-slate-500 text-sm">Count</div>
          <div className="mt-2 text-2xl font-semibold">{count}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-slate-500 text-sm">Total Volume ($)</div>
          <div className="mt-2 text-2xl font-semibold">${moneyFromCents(sumTotal)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-slate-500 text-sm">Avg Transaction ($)</div>
          <div className="mt-2 text-2xl font-semibold">${moneyFromCents(Math.round(avgTotal))}</div>
        </div>
      </section>

      {/* Table */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
          <div className="font-medium">Latest Transactions</div>
          <div className="text-xs text-slate-500">Showing up to 250 rows</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-6 py-3">Created</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Listing</th>
                <th className="px-6 py-3">Buyer</th>
                <th className="px-6 py-3">Seller</th>
                <th className="px-6 py-3 text-right">AF</th>
                <th className="px-6 py-3 text-right">$ / AF</th>
                <th className="px-6 py-3 text-right">Total ($)</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => {
                const listingTitle = t.listingTitleSnapshot || t.listing?.title || "—";
                const buyer = t.buyer?.name || t.buyer?.email || "—";
                const seller = t.seller?.name || t.seller?.email || "—";
                return (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-6 py-3">{new Date(t.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-3">{t.type}</td>
                    <td className="px-6 py-3">{t.status}</td>
                    <td className="px-6 py-3">{listingTitle}</td>
                    <td className="px-6 py-3">{buyer}</td>
                    <td className="px-6 py-3">{seller}</td>
                    <td className="px-6 py-3 text-right">{t.acreFeet.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right">
                      {(t.pricePerAF / 100).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {(t.totalAmount / 100).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                );
              })}
              {!txns.length && (
                <tr>
                  <td className="px-6 py-10 text-center text-slate-500" colSpan={9}>
                    No transactions found for the selected range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
