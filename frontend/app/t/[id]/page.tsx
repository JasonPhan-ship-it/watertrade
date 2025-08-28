// app/t/[id]/page.tsx
import TradeShell from "@/components/trade/TradeShell";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = {
  params: { id: string };
  searchParams: { [k: string]: string | string[] | undefined };
};

function getParam(sp: PageProps["searchParams"], k: string) {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

const ROLE_SET = new Set(["buyer", "seller"]);
const ACTION_SET = new Set(["review", "counter", "decline", "awaiting-buyer-signature"]);

export default function Page({ params, searchParams }: PageProps) {
  const id = params.id ?? "";

  const roleRaw = getParam(searchParams, "role").toLowerCase();
  const role = ROLE_SET.has(roleRaw) ? (roleRaw as "buyer" | "seller") : undefined;

  // Prefer query ?token, but also accept headers (x-trade-token / legacy x-magic-token)
  const hdrs = headers();
  const tokenFromHeader =
    hdrs.get("x-trade-token") || hdrs.get("x-magic-token") || hdrs.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const tokenQuery = getParam(searchParams, "token");
  const token = (tokenQuery || tokenFromHeader) || undefined;

  const actionRaw = getParam(searchParams, "action").toLowerCase();
  const action = ACTION_SET.has(actionRaw) ? actionRaw : undefined;

  return <TradeShell tradeId={id} role={role} token={token} action={action} />;
}
