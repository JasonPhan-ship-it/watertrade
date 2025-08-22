// app/transactions/[id]/page.tsx
import NextDynamic from "next/dynamic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Load TradeShell on the client only to avoid SSR crashes
const TradeShell = NextDynamic(() => import("@/components/trade/TradeShell"), {
  ssr: false,
  loading: () => (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-2/3 rounded bg-slate-200" />
        <div className="h-4 w-1/3 rounded bg-slate-200" />
        <div className="h-40 w-full rounded-2xl bg-slate-100" />
      </div>
    </main>
  ),
});

type PageProps = {
  params: { id?: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v[0]?.toString().trim();
  return undefined;
}

const ROLES = new Set(["buyer", "seller"] as const);
const ACTIONS = new Set(["review", "accept", "decline", "counter"] as const);

export default function Page({ params, searchParams }: PageProps) {
  const id = params?.id?.trim();
  const safeId = id && id.length >= 8 && id.length <= 64 ? id : "";

  const roleRaw = (asString(searchParams?.role) || "").toLowerCase();
  const actionRaw = (asString(searchParams?.action) || "").toLowerCase();

  const role = ROLES.has(roleRaw as any) ? (roleRaw as "buyer" | "seller") : undefined;
  const action = ACTIONS.has(actionRaw as any)
    ? (actionRaw as "review" | "accept" | "decline" | "counter")
    : "review";

  const token = asString(searchParams?.token) || undefined;

  return <TradeShell tradeId={safeId} role={role} token={token} action={action} />;
}
