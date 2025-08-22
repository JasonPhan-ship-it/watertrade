// app/transactions/[id]/page.tsx
import TradeShell from "@/components/trade/TradeShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: { id?: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v[0]?.toString().trim();
  return undefined;
}

export default function Page({ params, searchParams }: PageProps) {
  const id = params?.id?.trim() ?? "";
  const role = (asString(searchParams?.role) || "").toLowerCase();
  const action = (asString(searchParams?.action) || "").toLowerCase();
  const token = asString(searchParams?.token) || undefined;

  return <TradeShell tradeId={id} role={role} action={action} token={token} />;
}
