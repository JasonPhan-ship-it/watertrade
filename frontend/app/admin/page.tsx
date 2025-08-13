import { prisma } from "@/lib/prisma";

export default async function AdminOverview() {
  const [listingCount, activeCount, userCount, txCount] = await Promise.all([
    prisma.listing.count(),
    prisma.listing.count({ where: { status: "ACTIVE" } }),
    prisma.user.count(),
    prisma.transaction.count(),
  ]);

  const recent = await prisma.listing.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, title: true, district: true, pricePerAF: true, acreFeet: true, status: true, createdAt: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Admin Overview</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Kpi label="All Listings" value={String(listingCount)} />
        <Kpi label="Active Listings" value={String(activeCount)} />
        <Kpi label="Users" value={String(userCount)} />
        <Kpi label="Transactions" value={String(txCount)} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-medium">Recent Listings</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">District</th>
                <th className="px-4 py-2 text-right">AF</th>
                <th className="px-4 py-2 text-right">$ / AF (¢)</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{r.title}</td>
                  <td className="px-4 py-2">{r.district}</td>
                  <td className="px-4 py-2 text-right">{r.acreFeet}</td>
                  <td className="px-4 py-2 text-right">{r.pricePerAF}</td>
                  <td className="px-4 py-2">{r.status}</td>
                  <td className="px-4 py-2">{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No listings yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-slate-500 text-sm">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
