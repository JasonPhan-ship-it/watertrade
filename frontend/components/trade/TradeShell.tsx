// ✅ Force Prisma to run on Node.js, and avoid cached fetches
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import type { Prisma } from "@prisma/client";

type Props = {
  tradeId: string;
  role?: string;   // "buyer" | "seller" | ""
  token?: string;  // optional from email
  action?: string; // e.g. "review" | "counter"
};

function moneyFromCents(cents?: number) {
  const n = ((cents ?? 0) as number) / 100;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

// 🔒 Keep the include minimal to avoid schema mismatches while debugging.
// Remove fields you don't actually have in your Prisma schema.
type TxWithJoins = Prisma.TransactionGetPayload<{
  include: {
    listing: { select: { id: true; title: true; district: true; waterType: true } };
    seller: { select: { id: true; email: true; name: true } };
    buyer: { select: { id: true; email: true; name: true } };
    // If your relation is named something else (e.g., TransactionSignature[]),
    // rename it here to match. Or comment out while debugging:
    // signatures: true,
  };
}> & {
  titleSnapshot?: string | null;
};

export default async function TradeShell({ tradeId, role = "", token = "", action = "" }: Props) {
  // Basic guard to avoid accidental undefined/empty ids
  if (!tradeId || typeof tradeId !== "string" || tradeId.trim().length === 0) {
    return uiError("Transaction not found", "Missing or invalid transaction id.", tradeId);
  }

  // ---- Load the transaction safely
  let tx: TxWithJoins | null = null;

  try {
    tx = await prisma.transaction.findUnique({
      where: { id: tradeId },
      include: {
        listing: {
          select: { id: true, title: true, district: true, waterType: true },
        },
        seller: { select: { id: true, email: true, name: true } },
        buyer: { select: { id: true, email: true, name: true } },
        // signatures: true, // enable only if this relation exists in your schema
      },
    });
  } catch (e: any) {
    // Log full error (message + stack + code) to Vercel logs
    console.error("[TradeShell] DB query failed", {
      tradeId,
      message: e?.message,
      code: e?.code,
      stack: e?.stack,
    });

    return uiError(
      "We couldn’t load this transaction",
      "Our database returned an error while loading the transaction. Please try again or contact support.",
      tradeId,
      e
    );
  }

  if (!tx) {
    return uiError(
      "Transaction not found",
      "This transaction may have been moved or deleted. Try opening the newest email, or go to your dashboard.",
      tradeId
    );
  }

  // ---- Determine viewer role safely
  let viewerRole: "buyer" | "seller" | "guest" = "guest";
  const hinted = (role || "").toLowerCase();
  if (hinted === "buyer" || hinted === "seller") {
    viewerRole = hinted;
  } else {
    try {
      const { userId: clerkId } = auth();
      if (clerkId) {
        const me = await prisma.user.findUnique({ where: { clerkId } });
        if (me) {
          if (me.id === tx.buyerId) viewerRole = "buyer";
          else if (me.id === tx.sellerId) viewerRole = "seller";
        }
      }
    } catch (e: any) {
      console.warn("[TradeShell] auth() or user lookup failed", e?.message);
    }
  }

  const title = tx.listing?.title ?? tx.titleSnapshot ?? "Water Trade";
  const qty = tx.acreFeet ?? 0;
  const pAf = tx.pricePerAF ?? 0; // cents
  const total = (tx.totalAmount ?? qty * pAf) || 0;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <span className="rounded-full bg-gradient-to-r from-[#0E6A59] to-[#004434] px-3 py-1 text-xs font-semibold text-white">
          {tx.type === "OFFER" ? "Offer" : tx.type === "BUY_NOW" ? "Buy Now" : tx.type}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-slate-500">Summary</div>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><dt>District</dt><dd>{tx.listing?.district || "—"}</dd></div>
            <div className="flex justify-between"><dt>Water Type</dt><dd>{tx.listing?.waterType || "—"}</dd></div>
            <div className="flex justify-between"><dt>Acre-Feet</dt><dd>{qty.toLocaleString()}</dd></div>
            <div className="flex justify-between"><dt>Price / AF</dt><dd>{moneyFromCents(pAf)}</dd></div>
            <div className="flex justify-between font-medium"><dt>Total</dt><dd>{moneyFromCents(total)}</dd></div>
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-slate-500">Parties</div>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Seller</dt><dd>{tx.seller?.name || tx.seller?.email || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Buyer</dt><dd>{tx.buyer?.name || tx.buyer?.email || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Your Role</dt><dd className="capitalize">{viewerRole}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Status</dt><dd>{tx.status}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Actions ... (unchanged) */}

      <div className="mt-6 text-xs text-slate-500">Tx ID: {tx.id}</div>
    </div>
  );
}

function uiError(title: string, details: string, tradeId?: string, err?: unknown) {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{details}</p>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        {tradeId ? <div><strong>ID:</strong> {tradeId}</div> : null}
        {process.env.NODE_ENV !== "production" && err && (
          <div className="mt-2">
            <strong>Error:</strong>{" "}
            {String((err as any)?.message || err)}
          </div>
        )}
        <div className="mt-2">
          Tip: confirm the id exists at{" "}
          <Link href="/api/transactions/recent" className="text-[#0E6A59] underline">/api/transactions/recent</Link>.
        </div>
      </div>
    </div>
  );
}
