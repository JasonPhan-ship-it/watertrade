// app/t/[id]/page.tsx
import TradeShell from "@/components/trade/TradeShell";
import DeclineButton from "@/components/trades/DeclineButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  return (
    <div className="space-y-6">
      <TradeShell tradeId={id} role={role} token={token} action={action} />

      {/* Example: Decline button shown only if user is the seller */}
      {role === "seller" && (
        <div className="mt-6">
          <DeclineButton transactionId={id} />
        </div>
      )}
    </div>
  );
}
