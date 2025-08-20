// components/trade/TradeShell.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import TradeActionRunner from "./TradeRunner"; // client component

type Normalized = {
  id: string;
  district: string;
  waterType?: string | null;
  volumeAf: number;     // cents/AF
  pricePerAf: number;
  windowLabel?: string | null;
  round: number;
  sellerToken?: string | null;
  buyerToken?: string | null;
  listingTitle?: string | null;
};

// ---- Helpers to normalize shapes from either model ----
function normalizeFromAny(t: any): Normalized {
  return {
    id: t.id,
    district: t.district ?? t.listing?.district ?? "—",
    waterType: t.waterType ?? t.listing?.waterType ?? null,
    volumeAf: Number(t.volumeAf ?? t.acreFeet ?? 0),
    pricePerAf: Number(t.pricePerAf ?? t.pricePerAF ?? t.price_per_af ?? 0),
    windowLabel: t.windowLabel ?? t.listing?.availability ?? null,
    round: Number(t.round ?? 1),
    sellerToken: t.sellerToken ?? null,
    buyerToken: t.buyerToken ?? null,
    listingTitle: t.listing?.title ?? null,
  };
}

// ---- Fetch by ID (try Trade, then Transaction; with/without relation) ----
async function fetchById(id: string): Promise<Normalized | null> {
  try {
    const t = await prisma.trade.findUnique({ where: { id }, include: { listing: true } });
    if (t) return normalizeFromAny(t);
  } catch (e: any) {
    console.error("[TradeShell] trade.findUnique(include) by id failed", { id, message: e?.message });
  }
  try {
    const t = await prisma.trade.findUnique({ where: { id } as any });
    if (t) return normalizeFromAny(t);
  } catch (e: any) {
    console.error("[TradeShell] trade.findUnique by id failed", { id, message: e?.message });
  }

  try {
    const tx = await prisma.transaction.findUnique({ where: { id }, include: { listing: true } } as any);
    if (tx) return normalizeFromAny(tx);
  } catch (e: any) {
    console.error("[TradeShell] transaction.findUnique(include) by id failed", { id, message: e?.message });
  }
  try {
    const tx = await prisma.transaction.findUnique({ where: { id } } as any);
    if (tx) return normalizeFromAny(tx);
  } catch (e: any) {
    console.error("[TradeShell] transaction.findUnique by id failed", { id, message: e?.message });
  }
  return null;
}

// ---- Fetch by token (works when the email carries a valid token but wrong id) ----
async function fetchByToken(token: string): Promise<Normalized | null> {
  if (!token) return null;

  // Prefer Trade
  try {
    const t = await prisma.trade.findFirst({
      where: { OR: [{ sellerToken: token }, { buyerToken: token }] },
      include: { listing: true },
    } as any);
    if (t) return normalizeFromAny(t);
  } catch (e: any) {
    console.error("[TradeShell] trade.findFirst by token failed", { message: e?.message });
  }

  // Then Transaction (older rows may not have tokens, but try anyway)
  try {
    const tx = await prisma.transaction.findFirst({
      where: { OR: [{ sellerToken: token }, { buyerToken: token }] },
      include: { listing: true },
    } as any);
    if (tx) return normalizeFromAny(tx);
  } catch (e: any) {
    console.error("[TradeShell] transaction.findFirst by token failed", { message: e?.message });
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

  // 1) Try by id
  rec = await fetchById(tradeId);

  // 2) If not found, try by token (common when the link used a mismatched id)
  if (!rec && token) {
    rec = await fetchByToken(token);
    if (rec) {
      console.warn("[TradeShell] Record found by token but not by id", {
        requestedId: tradeId,
        resolvedId: rec.id,
      });
    }
  }

  if (!rec) {
    return (
      <ProblemCard
        title="Transaction not found"
        body="This transaction may have been moved or deleted. Try opening the newest email, or sign in to your dashboard."
      />
    );
  }

  // Token validation (if record has tokens, require a match; otherwise allow view)
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
          <TradeActionRunner
            tradeId={rec.id}                       // use canonical id we found
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
