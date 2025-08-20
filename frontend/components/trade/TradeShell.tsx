// components/trade/TradeShell.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";

type Normalized = {
  id: string;
  district: string;
  waterType?: string | null;
  volumeAf: number;        // normalized from volumeAf OR acreFeet
  pricePerAf: number;      // cents/AF (normalized from pricePerAf OR pricePerAF)
  windowLabel?: string | null;
  round: number;
  sellerToken?: string | null;
  buyerToken?: string | null;
  listingTitle?: string | null;
};

async function fetchNormalized(tradeId: string): Promise<Normalized | null> {
  // Try Trade with relation
  try {
    const t = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: { listing: true },
    });
    if (t) {
      return {
        id: t.id,
        district: t.district,
        waterType: (t as any).waterType ?? null,
        volumeAf: Number((t as any).volumeAf ?? 0),
        pricePerAf: Number((t as any).pricePerAf ?? (t as any).pricePerAF ?? 0),
        windowLabel: (t as any).windowLabel ?? null,
        round: Number((t as any).round ?? 1),
        sellerToken: (t as any).sellerToken ?? null,
        buyerToken: (t as any).buyerToken ?? null,
        listingTitle: (t as any).listing?.title ?? null,
      };
    }
  } catch (e: any) {
    console.error("[TradeShell] prisma.trade.findUnique(include) failed", {
      tradeId,
      message: e?.message,
    });
  }

  // Try Trade without relation (if relation name mismatched)
  try {
    const t = await prisma.trade.findUnique({ where: { id: tradeId } as any });
    if (t) {
      return {
        id: (t as any).id,
        district: (t as any).district,
        waterType: (t as any).waterType ?? null,
        volumeAf: Number((t as any).volumeAf ?? 0),
        pricePerAf: Number((t as any).pricePerAf ?? (t as any).pricePerAF ?? 0),
        windowLabel: (t as any).windowLabel ?? null,
        round: Number((t as any).round ?? 1),
        sellerToken: (t as any).sellerToken ?? null,
        buyerToken: (t as any).buyerToken ?? null,
        listingTitle: null,
      };
    }
  } catch (e: any) {
    console.error("[TradeShell] prisma.trade.findUnique() failed", {
      tradeId,
      message: e?.message,
    });
  }

  // Try Transaction with relation (older schema)
  try {
    const tx = await prisma.transaction.findUnique({
      where: { id: tradeId },
      include: { listing: true },
    } as any);
    if (tx) {
      return {
        id: (tx as any).id,
        district: (tx as any).district ?? (tx as any).listing?.district ?? "—",
        waterType: (tx as any).waterType ?? (tx as any).listing?.waterType ?? null,
        volumeAf: Number((tx as any).volumeAf ?? (tx as any).acreFeet ?? 0),
        pricePerAf: Number(
          (tx as any).pricePerAf ?? (tx as any).pricePerAF ?? (tx as any).price_per_af ?? 0
        ),
        windowLabel:
          (tx as any).windowLabel ??
          (tx as any).listing?.availability ??
          null,
        round: Number((tx as any).round ?? 1),
        sellerToken: (tx as any).sellerToken ?? null, // most Transaction rows won’t have tokens
        buyerToken: (tx as any).buyerToken ?? null,
        listingTitle: (tx as any).listing?.title ?? null,
      };
    }
  } catch (e: any) {
    console.error("[TradeShell] prisma.transaction.findUnique(include) failed", {
      tradeId,
      message: e?.message,
    });
  }

  // Try Transaction without relation
  try {
    const tx = await prisma.transaction.findUnique({ where: { id: tradeId } } as any);
    if (tx) {
      return {
        id: (tx as any).id,
        district: (tx as any).district ?? "—",
        waterType: (tx as any).waterType ?? null,
        volumeAf: Number((tx as any).volumeAf ?? (tx as any).acreFeet ?? 0),
        pricePerAf: Number((tx as any).pricePerAf ?? (tx as any).pricePerAF ?? 0),
        windowLabel: (tx as any).windowLabel ?? null,
        round: Number((tx as any).round ?? 1),
        sellerToken: (tx as any).sellerToken ?? null,
        buyerToken: (tx as any).buyerToken ?? null,
        listingTitle: null,
      };
    }
  } catch (e: any) {
    console.error("[TradeShell] prisma.transaction.findUnique() failed", {
      tradeId,
      message: e?.message,
    });
  }

  return null;
}

type Props = {
  tradeId: string;
  role: string;   // "seller" | "buyer"
  token: string;  // magic-link token
  action: string; // "accept" | "counter" | "decline" | "sign" | ""
};

export default async function TradeShell({ tradeId, role, token, action }: Props) {
  let rec: Normalized | null = null;

  try {
    rec = await fetchNormalized(tradeId);
  } catch (e: any) {
    console.error("[TradeShell] Unexpected fetch error", {
      tradeId,
      role,
      hasToken: Boolean(token),
      action,
      message: e?.message,
      stack: e?.stack,
    });
    return (
      <ProblemCard
        title="We couldn’t load this transaction"
        body="Our database returned an error while loading the transaction. Please try again or contact support."
      />
    );
  }

  if (!rec) {
    console.warn("[TradeShell] No record found in Trade or Transaction", {
      tradeId,
      role,
      hasToken: Boolean(token),
      action,
    });
    return (
      <ProblemCard
        title="Transaction not found"
        body="This transaction may have been moved or deleted. Try opening the newest email, or sign in to your dashboard."
      />
    );
  }

  // Token check (optional: older Transaction rows may not have tokens)
  const hasAnyToken = Boolean(rec.sellerToken || rec.buyerToken);
  const tokenValid = hasAnyToken
    ? (role === "seller" && token && token === rec.sellerToken) ||
      (role === "buyer" && token && token === rec.buyerToken)
    : true; // if no tokens exist on record, don’t block viewing

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

      {!hasAnyToken && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
          <div className="text-sm">
            This record doesn’t have a secure token on file. You may need to{" "}
            <Link href="/sign-in" className="underline">sign in</Link> to take action.
          </div>
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
          {/* The client-side runner (accept/counter/decline) */}
          {/* If tokens are missing, actions will likely be rejected by the API; UI still renders. */}
          {/* @ts-expect-error Client Component import is fine */}
          {(await import("./TradeRunner")).default({
            tradeId: rec.id,
            role,
            token,
            action,
            defaultPricePerAf: Number(rec.pricePerAf || 0),
            defaultVolumeAf: Number(rec.volumeAf || 0),
            defaultWindowLabel: rec.windowLabel || "",
            disabled: !tokenValid,
          })}
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
