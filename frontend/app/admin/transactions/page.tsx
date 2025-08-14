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
  // --- Auth + ensure local user
  const { userId } = auth();
  if (!userId) {
    redirect("/sign-in");
  }

  let me = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!me) {
    // Create a local user record from Clerk (safe on server)
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

  if (me.role !== "ADMIN") {
    // Be explicit and *don’t* throw — redirect to dashboard
    redirect("/dashboard");
  }

  // --- Load data but never throw — catch and render a friendly message
  let txns: Row[] = [];
  let loadError: string | null = null;

  try {
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
    // Don’t throw — just show an error row
    loadError = "Failed to load transactions.";
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Admin · Transactions
        </h1>

        {/* Simple download button that hits /admin/export */}
        <a
          href="/admin/export"
          className="inline-flex h-10 items-center rounded-xl bg-[#004434] px-4 text-sm font-medium text-white hover:bg-[#00392f]"
        >
          Download .xlsx
        </a>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError}
        </div>
      ) : (
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
      )}
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
