// app/transactions/[id]/page.tsx
import TradeShell from "@/components/trade/TradeShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: { id: string };
  searchParams: { [k: string]: string | string[] | undefined };
};

function getParam(sp: PageProps["searchParams"], k: string) {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v || "";
}

export default function Page({ params, searchParams }: PageProps) {
  const id = params.id ?? "";
  const role = (getParam(searchParams, "role") || "").toLowerCase();
  const token = getParam(searchParams, "token");
  const action = (getParam(searchParams, "action") || "").toLowerCase();

  return <TradeShell tradeId={id} role={role} token={token} action={action} />;
}
