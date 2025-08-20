// app/t/[id]/page.tsx
import TradeShell from "@/components/trade/TradeShell";

export const runtime = "nodejs";       // ensure Prisma-friendly runtime
export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
  searchParams: { [k: string]: string | string[] | undefined };
};

function pickFirst(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function sanitizeRole(v: string): "seller" | "buyer" | "" {
  const s = v.toLowerCase();
  return s === "seller" || s === "buyer" ? s : "";
}

function sanitizeAction(v: string): "accept" | "counter" | "decline" | "sign" | "" {
  const s = v.toLowerCase();
  return s === "accept" || s === "counter" || s === "decline" || s === "sign" ? s : "";
}

export default function Page({ params, searchParams }: PageProps) {
  const id = params.id;
  const role = sanitizeRole(pickFirst(searchParams.role));
  const token = pickFirst(searchParams.token);
  const action = sanitizeAction(pickFirst(searchParams.action));

  return <TradeShell tradeId={id} role={role} token={token} action={action} />;
}
