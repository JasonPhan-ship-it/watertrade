// components/trade/TradeShell.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";

/**
 * NOTE: We avoid throwing (notFound/error) in production so we don't crash the route.
 * Instead we render a friendly card and log the details server-side.
 */

type Props = {
  tradeId: string;
  role: string;     // "seller" | "buyer"
  token: string;    // magic-link token
  action: string;   // optional: "accept" | "counter" | "decline" | "sign"
};

export default async function TradeShell({ tradeId, role, token, action }: Props) {
  let trade: any | null = null;
  try {
    trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: { listing: true },
    });
  } catch (e: any) {
    // Server log with enough context to find in Vercel logs
    console.error("[TradeShell] DB error", {
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

  if (!trade) {
    console.warn("[TradeShell] trade not found", { tradeId, role, hasToken: Boolean(token), action });
    return (
      <ProblemCard
        title="Transaction not found"
        body="This transaction may have been moved or deleted. Check that you opened the newest email, or sign in to your dashboard."
      />
    );
  }

  // Validate magic-link token
  const tokenValid =
    (role === "seller" && token && token === trade.sellerToken) ||
    (role === "buyer" && token && token === trade.buyerToken);

  const pricePerAf = Number.isFinite(trade.pricePerAf) ? Number(trade.pricePerAf) : 0;
  const volumeAf = Number.isFinite(trade.volumeAf) ? Number(trade.volumeAf) : 0;
  const priceLabel = `$${(pricePerAf / 100).toLocaleString()}/AF`;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Transaction</h1>
        <p className="mt-1 text-sm text-slate-600">
          Offer & counterflow for{" "}
          <span className="font-medium">
            {trade?.listing?.title || trade?.windowLabel || "Listing"}
          </span>
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
              <Info label="District" value={trade.district || "—"} />
              <Info label="Water Type" value={trade.waterType || "—"} />
              <Info label="Volume (AF)" value={Number(volumeAf).toLocaleString()} />
              <Info label="Price" value={priceLabel} />
            </div>
            {trade.windowLabel && (
              <div className="mt-3 text-sm">
                <div className="text-slate-500">Window</div>
                <div className="font-medium">{trade.windowLabel}</div>
              </div>
            )}
          </div>

          <span
            className="inline-flex items-center rounded-full bg-gradient-to-r from-[#0E6A59] to-[#004434] px-3 py-1 text-[11px] font-semibold text-white shadow-sm"
            title={`Round ${trade.round ?? 1}`}
          >
            Round {trade.round ?? 1}
          </span>
        </div>

        <div className="mt-6">
          {/* Lazy import to avoid hydration issues if something above fails */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/** @ts-expect-error async Server Component wrapper */}
          <ClientRunnerWrapper
            trade={trade}
            role={role}
            token={token}
            action={action}
            tokenValid={tokenValid}
            pricePerAf={pricePerAf}
            volumeAf={volumeAf}
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

/**
 * Small server->client handoff to keep the surface tight.
 */
async function ClientRunnerWrapper({
  trade,
  role,
  token,
  action,
  tokenValid,
  pricePerAf,
  volumeAf,
}: {
  trade: any;
  role: string;
  token: string;
  action: string;
  tokenValid: boolean;
  pricePerAf: number;
  volumeAf: number;
}) {
  const TradeActionRunner = (await import("./TradeRunner")).default;
  return (
    <TradeActionRunner
      tradeId={trade.id}
      role={role}
      token={token}
      action={action}
      defaultPricePerAf={pricePerAf}
      defaultVolumeAf={volumeAf}
      defaultWindowLabel={trade.windowLabel || ""}
      disabled={!tokenValid}
    />
  );
}
