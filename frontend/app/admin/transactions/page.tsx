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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Admin · Transactions
        </h1>
        <a
          href="/admin/export"
          className="inline-flex h-10 items-center rounded-xl bg-[#004434] px-4 text-sm font-medium text-white hover:bg-[#00392f]"
        >
          Download Excel
        </a>
      </div>

      {degraded && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Running in “degraded” mode. A database error occurred fetching all fields
          (e.g. missing snapshot columns). Showing a reduced set instead.
          {process.env.NODE_ENV !== "production" && loadError ? (
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs">{loadError}</pre>
          ) : null}
        </div>
      )}

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
