import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  district: string;
  supplyAF: number;
  demandAF: number;
  activeSellMedianCents: number | null;
  recentTxnMedianCents: number | null;
  suggestedCents: number | null;
};

export default async function AdminAnalyticsPage() {
  // auth
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

  // Pull listings (supply/demand & spot)
  const sells = await prisma.listing.findMany({
    where: { status: "ACTIVE", kind: "SELL" },
    select: { district: true, acreFeet: true, pricePerAF: true },
    take: 2000,
  });
  const buys = await prisma.listing.findMany({
    where: { status: "ACTIVE", kind: "BUY" },
    select: { district: true, acreFeet: true, pricePerAF: true },
    take: 2000,
  });
  const recentTxns = await prisma.transaction.findMany({
    where: { status: { in: ["APPROVED", "FUNDS_RELEASED"] } },
    select: { listing: { select: { district: true } }, pricePerAF: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  // group by district
  const districts = new Set<string>([
    ...sells.map((x) => x.district),
    ...buys.map((x) => x.district),
    ...recentTxns.map((t) => t.listing?.district).filter(Boolean) as string[],
  ]);

  const rows: Row[] = Array.from(districts).map((d) => {
    const sellsD = sells.filter((x) => x.district === d);
    const buysD  = buys.filter((x) => x.district === d);
    const txnsD  = recentTxns.filter((t) => t.listing?.district === d);

    const supplyAF = sum(sellsD.map((x) => x.acreFeet));
    const demandAF = sum(buysD.map((x) => x.acreFeet));

    const sellMedian = median(sellsD.map((x) => x.pricePerAF).filter(isFiniteNumber)) ?? null; // cents
    const txnMedian  = median(txnsD.map((t) => t.pricePerAF).filter(isFiniteNumber)) ?? null;  // cents

    // Suggested price
    // base = blend( txns 60% , sells 40% ), then adjust by pressure = (demand+1)/(supply+1)
    const alpha = 0.6;
    let base: number | null = null;
    if (txnMedian != null && sellMedian != null) base = Math.round(alpha * txnMedian + (1 - alpha) * sellMedian);
    else if (txnMedian != null) base = txnMedian;
    else if (sellMedian != null) base = sellMedian;

    const pressure = (demandAF + 1) / (supplyAF + 1);
    const suggested = base != null ? Math.round(base * clamp(pressure, 0.85, 1.25)) : null;

    return {
      district: d || "(Unspecified)",
      supplyAF,
      demandAF,
      activeSellMedianCents: sellMedian,
      recentTxnMedianCents: txnMedian,
      suggestedCents: suggested,
    };
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      {/* Admin tabs */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Admin · Water District Analytics
        </h1>
        <a
          href="/admin/transactions"
          className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800"
        >
          ← Back to Transactions
        </a>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <Th>District</Th>
              <Th className="text-right">Supply (AF)</Th>
              <Th className="text-right">Demand (AF)</Th>
              <Th className="text-right">Active Listing Median</Th>
              <Th className="text-right">Recent Txn Median</Th>
              <Th className="text-right">Suggested Price</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>
                  No data yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.district} className="border-t border-slate-100">
                  <Td>{r.district}</Td>
                  <Td align="right">{num(r.supplyAF)}</Td>
                  <Td align="right">{num(r.demandAF)}</Td>
                  <Td align="right">{r.activeSellMedianCents != null ? usdCents(r.activeSellMedianCents) + "/AF" : "—"}</Td>
                  <Td align="right">{r.recentTxnMedianCents != null ? usdCents(r.recentTxnMedianCents) + "/AF" : "—"}</Td>
                  <Td align="right">
                    {r.suggestedCents != null ? (
                      <span className="font-medium text-slate-900">{usdCents(r.suggestedCents)}/AF</span>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Suggested price uses a blend of recent transactions & active listings, adjusted by demand/supply. You can later
        wire real district allocation & remaining-year data into this model.
      </p>
    </main>
  );
}

/* utils */
function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-medium ${className}`}>{children}</th>;
}
function Td({ children, align }: { children: React.ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <td className={`px-4 py-3 ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""}`}>
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
function sum(ns: number[]) {
  return ns.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
}
function median(ns: number[]) {
  if (!ns.length) return null;
  const a = [...ns].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
