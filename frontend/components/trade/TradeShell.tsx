// components/trade/TradeShell.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import type { Prisma } from "@prisma/client";

// ---------- Types ----------
type Props = {
  tradeId: string;                // can be a Transaction.id OR a Trade.id
  role?: string;                  // "Buyer" | "Seller" | (optional hint)
  token?: string;                 // optional magic token for server actions
  action?: string;                // "review" | ... (not used in summary UI)
};

const signatureSelect = {
  id: true,
  party: true,
  docusignEnvelopeId: true,
  status: true,
  completedAt: true,
} as const;

type TxWithJoins = Prisma.TransactionGetPayload<{
  include: {
    listing: { select: { id: true; title: true; district: true; waterType: true; kind: true } };
    signatures: { select: typeof signatureSelect };
  };
}>;

// ---------- Helpers ----------
function moneyFromCents(cents?: number) {
  const n = ((cents ?? 0) as number) / 100;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

async function loadTransactionByAnyId(anyId: string): Promise<TxWithJoins | null> {
  // 1) Try as Transaction.id
  const direct = await prisma.transaction.findUnique({
    where: { id: anyId },
    include: {
      listing: { select: { id: true, title: true, district: true, waterType: true, kind: true } },
      signatures: { select: signatureSelect },
    },
  });
  if (direct) return direct;

  // 2) Try as Trade.id → follow Trade.transactionId
  const trade = await prisma.trade.findUnique({
    where: { id: anyId },
    select: { transactionId: true },
  });
  if (!trade?.transactionId) return null;

  return prisma.transaction.findUnique({
    where: { id: trade.transactionId },
    include: {
      listing: { select: { id: true, title: true, district: true, waterType: true, kind: true } },
      signatures: { select: signatureSelect },
    },
  });
}

async function safeLoad(tradeOrTxId: string): Promise<{ tx: TxWithJoins | null; err?: string }> {
  try {
    const tx = await loadTransactionByAnyId(tradeOrTxId);
    return { tx };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.error("[TradeShell] load failed", { tradeOrTxId, msg });
    return { tx: null, err: msg };
  }
}

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "green" | "amber" | "red";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    green: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    amber: "bg-amber-100 text-amber-900 ring-amber-200",
    red: "bg-red-100 text-red-800 ring-red-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

function toneForStatus(status?: string): "slate" | "green" | "amber" | "red" {
  const s = (status || "").toUpperCase();
  if (s.includes("FULLY_EXECUTED") || s.startsWith("ACCEPTED")) return "green";
  if (s.includes("COUNTERED")) return "amber";
  if (s === "DECLINED" || s === "CANCELLED" || s === "EXPIRED") return "red";
  return "slate";
}

// ---------- Component ----------
export default async function TradeShell({ tradeId, role = "", token = "" }: Props) {
  if (!tradeId || typeof tradeId !== "string" || tradeId.trim().length === 0) {
    return uiError("Transaction not found", "Missing or invalid transaction id.", tradeId);
  }

  const { tx, err } = await safeLoad(tradeId);
  if (err) {
    return uiError(
      "We couldn’t load this transaction",
      "Our database returned an error while loading the transaction. Please try again or contact support.",
      tradeId,
      err
    );
  }
  if (!tx) {
    return uiError(
      "Transaction not found",
      "This transaction may have been moved or deleted. Try opening the newest email, or go to your dashboard.",
      tradeId
    );
  }

  // Link back to Trade (if it exists) for action endpoints
  const linkedTrade = await prisma.trade.findFirst({
    where: { transactionId: tx.id },
    select: { id: true, status: true },
  });
  const tradeIdLinked = linkedTrade?.id ?? null;

  // Resolve viewer role (hint → auth inference)
  let viewerRole: "buyer" | "seller" | "guest" =
    role.toLowerCase() === "buyer" || role.toLowerCase() === "seller" ? (role.toLowerCase() as any) : "guest";
  if (viewerRole === "guest") {
    try {
      const { userId: clerkId } = auth();
      if (clerkId) {
        const me = await prisma.user.findUnique({ where: { clerkId }, select: { id: true } });
        if (me) {
          if (tx.buyerId === me.id) viewerRole = "buyer";
          else if (tx.sellerId === me.id) viewerRole = "seller";
        }
      }
    } catch {
      /* noop */
    }
  }

  // View model
  const title = tx.listing?.title ?? tx.listingTitleSnapshot ?? "Water Trade";
  const district = tx.listing?.district ?? "—";
  const waterType = tx.listing?.waterType ?? "—";
  const qty = tx.acreFeet ?? 0;
  const priceAf = tx.pricePerAF ?? 0; // cents
  const total = (tx.totalAmount ?? qty * priceAf) || 0;
  const kind = tx.type === "OFFER" ? "Offer" : tx.type === "BUY_NOW" ? "Buy Now" : tx.type ?? "—";
  const status = tx.status ?? "—";

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="flex items-center gap-2">
          <Badge tone={toneForStatus(status)}>{status}</Badge>
          <Badge tone="slate">{kind}</Badge>
        </div>
      </div>

      {/* Consolidated Summary Card */}
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs uppercase text-slate-500">Summary</div>
          <div className="text-xs text-slate-600">
            Role:&nbsp;
            <Badge tone="slate" >
              {viewerRole}
            </Badge>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <tbody className="[&_tr:not(:last-child)]:border-b [&_tr]:border-slate-100">
              <tr>
                <td className="bg-slate-50 px-4 py-2 text-slate-600">District</td>
                <td className="px-4 py-2">{district}</td>
              </tr>
              <tr>
                <td className="bg-slate-50 px-4 py-2 text-slate-600">Water Type</td>
                <td className="px-4 py-2">{waterType}</td>
              </tr>
              <tr>
                <td className="bg-slate-50 px-4 py-2 text-slate-600">Acre‑Feet</td>
                <td className="px-4 py-2">{qty.toLocaleString()}</td>
              </tr>
              <tr>
                <td className="bg-slate-50 px-4 py-2 text-slate-600">Price / AF</td>
                <td className="px-4 py-2">{moneyFromCents(priceAf)}</td>
              </tr>
              <tr>
                <td className="bg-slate-50 px-4 py-2 font-medium text-slate-700">Total</td>
                <td className="px-4 py-2 font-medium">{moneyFromCents(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {viewerRole === "seller" ? (
          <div className="flex flex-wrap items-center gap-3">
            <form action={tradeIdLinked ? `/api/trades/${tradeIdLinked}/seller/accept` : undefined} method="post">
              {token ? <input type="hidden" name="token" value={token} /> : null}
              <button
                type="submit"
                disabled={!tradeIdLinked}
                className={`rounded-xl px-5 py-2 text-white ${
                  tradeIdLinked ? "bg-[#004434] hover:bg-[#003a2f]" : "bg-slate-400 cursor-not-allowed"
                }`}
                title={tradeIdLinked ? "" : "No Trade linked to this Transaction"}
              >
                Accept
              </button>
            </form>

            <Link
              href={
                tradeIdLinked
                  ? `/t/${tradeIdLinked}?role=seller&action=counter${token ? `&token=${encodeURIComponent(token)}` : ""}`
                  : "#"
              }
              className={`rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium ${
                tradeIdLinked ? "text-slate-700 hover:bg-slate-50" : "text-slate-400 cursor-not-allowed"
              }`}
              aria-disabled={!tradeIdLinked}
            >
              Counter
            </Link>

            <form action={tradeIdLinked ? `/api/trades/${tradeIdLinked}/seller/decline` : undefined} method="post">
              {token ? <input type="hidden" name="token" value={token} /> : null}
              <button
                type="submit"
                disabled={!tradeIdLinked}
                className={`rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium ${
                  tradeIdLinked ? "text-slate-700 hover:bg-slate-50" : "text-slate-400 cursor-not-allowed"
                }`}
                title={tradeIdLinked ? "" : "No Trade linked to this Transaction"}
              >
                Decline
              </button>
            </form>
          </div>
        ) : viewerRole === "buyer" ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={
                tradeIdLinked
                  ? `/t/${tradeIdLinked}?role=buyer&action=counter${token ? `&token=${encodeURIComponent(token)}` : ""}`
                  : "#"
              }
              className={`rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium ${
                tradeIdLinked ? "text-slate-700 hover:bg-slate-50" : "text-slate-400 cursor-not-allowed"
              }`}
              aria-disabled={!tradeIdLinked}
            >
              Counter
            </Link>

            <form action={tradeIdLinked ? `/api/trades/${tradeIdLinked}/buyer/decline` : undefined} method="post">
              {token ? <input type="hidden" name="token" value={token} /> : null}
              <button
                type="submit"
                disabled={!tradeIdLinked}
                className={`rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium ${
                  tradeIdLinked ? "text-slate-700 hover:bg-slate-50" : "text-slate-400 cursor-not-allowed"
                }`}
                title={tradeIdLinked ? "" : "No Trade linked to this Transaction"}
              >
                Decline
              </button>
            </form>
          </div>
        ) : (
          <div className="text-sm text-slate-600">
            You’re viewing as a guest.{" "}
            <Link href="/sign-in" className="text-[#0E6A59] underline">
              Sign in
            </Link>{" "}
            to take action.
          </div>
        )}
      </div>

      {/* IDs */}
      <div className="mt-6 text-xs text-slate-500">
        Tx ID: {tx.id}
        {tradeIdLinked ? <span className="ml-2">· Trade ID: {tradeIdLinked}</span> : null}
      </div>
    </div>
  );
}

function uiError(title: string, details: string, tradeId?: string, err?: unknown) {
  const showErr = process.env.NODE_ENV !== "production" || process.env.DEBUG_ERRORS === "1";
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{details}</p>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        {tradeId ? (
          <div>
            <strong>ID:</strong> {tradeId}
          </div>
        ) : null}
        {showErr ? (
          <div className="mt-2">
            <strong>Error:</strong> {String((err as any)?.message ?? err)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
