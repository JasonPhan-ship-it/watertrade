// components/trade/TradeShell.tsx
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

type Props = {
  tradeId: string;
  role?: string;   // "buyer" | "seller" | ""
  token?: string;  // optional one-click token for emails (not enforced here)
  action?: string; // e.g. "review"
};

function moneyFromCents(cents: number) {
  const n = (cents ?? 0) / 100;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default async function TradeShell({ tradeId, role = "", token = "", action = "" }: Props) {
  if (!tradeId) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">Transaction not found</h1>
        <p className="mt-2 text-sm text-slate-600">
          Missing transaction id. Try the newest email link or sign in to your dashboard.
        </p>
      </div>
    );
  }

  // Load the transaction with all UI-required joins
  const tx = await prisma.transaction.findUnique({
    where: { id: tradeId },
    include: {
      listing: {
        select: { id: true, title: true, district: true, waterType: true, kind: true },
      },
      seller: { select: { id: true, email: true, name: true } },
      buyer: { select: { id: true, email: true, name: true } },
      signatures: true,
    },
  });

  if (!tx) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">Transaction not found</h1>
        <p className="mt-2 text-sm text-slate-600">
          This transaction may have been moved or deleted. Try opening the newest email, or{" "}
          <Link href="/dashboard" className="text-[#0E6A59] underline">go to your dashboard</Link>.
        </p>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
          <div><strong>ID:</strong> {tradeId}</div>
          <div className="mt-2">
            Tip: confirm the id exists in your DB at{" "}
            <Link href="/api/transactions/recent" className="text-[#0E6A59] underline">/api/transactions/recent</Link>.
          </div>
        </div>
      </div>
    );
  }

  // Determine viewer role:
  // 1) honor query `role=buyer|seller` if present
  // 2) else infer from Clerk user id -> local user -> match buyer/seller
  let viewerRole: "buyer" | "seller" | "guest" = "guest";
  const hinted = role.toLowerCase();
  if (hinted === "buyer" || hinted === "seller") {
    viewerRole = hinted;
  } else {
    const { userId: clerkId } = auth();
    if (clerkId) {
      const me = await prisma.user.findUnique({ where: { clerkId } });
      if (me) {
        if (me.id === tx.buyerId) viewerRole = "buyer";
        else if (me.id === tx.sellerId) viewerRole = "seller";
      }
    }
  }

  const title = tx.listing?.title || "Water Trade";
  const qty = tx.acreFeet;
  const pAf = tx.pricePerAF; // cents
  const total = tx.totalAmount ?? qty * (pAf ?? 0);

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
            <div className="flex justify-between"><dt>Acre-Feet</dt><dd>{qty?.toLocaleString() ?? "—"}</dd></div>
            <div className="flex justify-between"><dt>Price / AF</dt><dd>{moneyFromCents(pAf ?? 0)}</dd></div>
            <div className="flex justify-between font-medium"><dt>Total</dt><dd>{moneyFromCents(total ?? 0)}</dd></div>
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

      {/* Actions */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {viewerRole === "seller" ? (
          <div className="flex flex-wrap items-center gap-3">
            <form action={`/api/trades/${tx.id}/seller/accept`} method="post">
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="rounded-xl bg-[#004434] px-5 py-2 text-white hover:bg-[#003a2f]"
              >
                Accept Offer
              </button>
            </form>
            <Link
              href={`/t/${tx.id}?role=seller&action=counter${token ? `&token=${encodeURIComponent(token)}` : ""}`}
              className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Counter
            </Link>
            <form action={`/api/trades/${tx.id}/seller/decline`} method="post">
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Decline
              </button>
            </form>
          </div>
        ) : viewerRole === "buyer" ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/t/${tx.id}?role=buyer&action=counter${token ? `&token=${encodeURIComponent(token)}` : ""}`}
              className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Counter
            </Link>
            <form action={`/api/trades/${tx.id}/buyer/decline`} method="post">
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Decline
              </button>
            </form>
          </div>
        ) : (
          <div className="text-sm text-slate-600">
            You’re viewing as a guest.{" "}
            <Link href="/sign-in" className="text-[#0E6A59] underline">Sign in</Link>{" "}
            to take action.
          </div>
        )}
      </div>

      <div className="mt-6 text-xs text-slate-500">
        Tx ID: {tx.id}
      </div>
    </div>
  );
}
