// components/trade/TradeShell.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import TradeActionRunner from "./TradeRunner"; // client component

type Normalized = {
  id: string;
  district: string;
  waterType?: string | null;
  volumeAf: number;
  pricePerAf: number; // cents per AF
  windowLabel?: string | null;
  round: number;
  // Tokens are optional – only present if you've added them to Transaction
  sellerToken?: string | null;
  buyerToken?: string | null;
  listingTitle?: string | null;
};

function normalizeFromTx(tx: any): Normalized {
  return {
    id: tx.id,
    district: tx.district ?? tx.listing?.district ?? "—",
    waterType: tx.waterType ?? tx.listing?.waterType ?? null,
    volumeAf: Number(tx.volumeAf ?? tx.acreFeet ?? 0),
    pricePerAf: Number(tx.pricePerAf ?? tx.pricePerAF ?? 0),
    windowLabel: tx.windowLabel ?? tx.listing?.availability ?? null,
    round: Number(tx.round ?? 1),
    sellerToken: tx.sellerToken ?? null,
    buyerToken: tx.buyerToken ?? null,
    listingTitle: tx.listing?.title ?? null,
  };
}

async function fetchTransactionOnly(id: string): Promise<Normalized | null> {
  try {
    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: { listing: true },
    } as any);
    if (tx) return normalizeFromTx(tx);
  } catch (e: any) {
    console.error("[TradeShell] transaction.findUnique(include) failed", {
      id,
      message: e?.message,
    });
  }
  try {
    const tx = await prisma.transaction.findUnique({ where: { id } } as any);
    if (tx) return normalizeFromTx(tx);
  } catch (e: any) {
    console.error("[TradeShell] transaction.findUnique failed", {
      id,
      message: e?.message,
    });
  }
  return null;
}

type Props = {
  tradeId: string;
  role: string;   // "seller" | "buyer"
  token: string;  // magic-link token (optional if you don't use tokens)
  action: string; // "accept" | "counter" | "decline" | "sign" | ""
};

export default async function TradeShell({ tradeId, role, token, action }: Props) {
  const rec = await fetchTransactionOnly(tradeId);

  if (!rec) {
    return (
      <ProblemCard
        title="Transaction not found"
        body="This transaction may have been moved or deleted. Try opening the newest email, or sign in to your dashboard."
      />
    );
  }

  // Token validation is soft: only if columns exist and values are present.
  const hasAnyToken = Boolean(rec.sellerToken || rec.buyerToken);
  const tokenValid = hasAnyToken
    ? (role === "seller" && token && token === rec.sellerToken) ||
      (role === "buyer" && token && token === rec.buyerToken)
    : true;

  const priceLabel = `$${(Number(rec.pricePerAf || 0) / 100).toLocaleString()}/AF`;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Transaction</h1>
        <p className="mt-1 text-sm text-slate-600">
          Offer & counterflow for{" "}
          <span className="font-medium">{rec.listingTitle || rec.windowLabel || "Listing"}</span>
        </p>
      </header>

      {!tokenValid && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <div className="font-medium">This link is invalid or expired.</div>
          <p className="mt-1 text-sm">
            Try opening the most recent email, or{" "}
            <Link href="/sign-in" className="underline">sign in</Link>{" "}
            to view this transaction from your dashboard.
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Current Terms</div>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Info label="District" value={rec.district || "—"} />
              <Info label="Water Type" value={rec.waterType || "—"} />
              <Info label="Volume (AF)" value={Number(rec.volumeAf).toLocaleString()} />
              <Info label="Price" value={priceLabel} />
            </div>
            {rec.windowLabel && (
              <div className="mt-3 text-sm">
                <div className="text-slate-500">Window</div>
                <div className="font-medium">{rec.windowLabel}</div>
              </div>
            )}
          </div>

          <span
            className="inline-flex items-center rounded-full bg-gradient-to-r from-[#0E6A59] to-[#004434] px-3 py-1 text-[11px] font-semibold text-white shadow-sm"
            title={`Round ${rec.round ?? 1}`}
          >
            Round {rec.round ?? 1}
          </span>
        </div>

        <div className="mt-6">
          <TradeActionRunner
            tradeId={rec.id}
            role={role}
            token={token}
            action={action}
            defaultPricePerAf={Number(rec.pricePerAf || 0)}
            defaultVolumeAf={Number(rec.volumeAf || 0)}
            defaultWindowLabel={rec.windowLabel || ""}
            disabled={!tokenValid}
          />
        </div>
      </section>

      <div className="mt-6 text-xs text-slate-500">
        Secure link for: <span className="font-medium uppercase">{role || "unknown"}</span>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <div className="text-slate-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function ProblemCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
        <div className="text-sm font-semibold">{title}</div>
        <p className="mt-1 text-sm">{body}</p>
      </div>
    </div>
  );
}
