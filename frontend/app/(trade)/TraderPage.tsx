// app/(trade)/TradePage.tsx
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import TradeActionRunner from "./TradeRunner";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
  searchParams: { [k: string]: string | string[] | undefined };
};

function getParam(sp: PageProps["searchParams"], k: string) {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v || "";
}

export default async function TradePage({ params, searchParams }: PageProps) {
  const id = params.id;
  const role = (getParam(searchParams, "role") || "").toLowerCase(); // "seller" | "buyer"
  const token = getParam(searchParams, "token");
  const action = (getParam(searchParams, "action") || "").toLowerCase(); // "accept" | "counter" | "decline" | "sign"

  const trade = await prisma.trade.findUnique({
    where: { id },
    include: { listing: true },
  });

  if (!trade) {
    notFound();
  }

  // Validate magic-link token (view-only; API routes will also validate on mutate)
  const tokenValid =
    (role === "seller" && token && token === (trade as any).sellerToken) ||
    (role === "buyer" && token && token === (trade as any).buyerToken);

  const priceLabel = `$${(trade.pricePerAf / 100).toLocaleString()}/AF`;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Transaction</h1>
        <p className="mt-1 text-sm text-slate-600">
          Offer & counterflow for{" "}
          <span className="font-medium">
            {trade.listing?.title || trade.windowLabel || "Listing"}
          </span>
        </p>
      </header>

      {!tokenValid && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <div className="font-medium">This link is invalid or expired.</div>
          <p className="mt-1 text-sm">
            Try opening the most recent email, or{" "}
            <Link href="/sign-in" className="underline">
              sign in
            </Link>{" "}
            to view this transaction from your dashboard.
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Current Terms</div>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="text-sm">
                <div className="text-slate-500">District</div>
                <div className="font-medium">{trade.district}</div>
              </div>
              <div className="text-sm">
                <div className="text-slate-500">Water Type</div>
                <div className="font-medium">{trade.waterType || "—"}</div>
              </div>
              <div className="text-sm">
                <div className="text-slate-500">Volume (AF)</div>
                <div className="font-medium">{trade.volumeAf.toLocaleString()}</div>
              </div>
              <div className="text-sm">
                <div className="text-slate-500">Price</div>
                <div className="font-medium">{priceLabel}</div>
              </div>
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
            title={`Round ${trade.round}`}
          >
            Round {trade.round}
          </span>
        </div>

        {/* Action runner auto-executes when ?action=... is present, else shows buttons/forms */}
        <div className="mt-6">
          <TradeActionRunner
            tradeId={trade.id}
            role={role}
            token={token}
            action={action}
            defaultPricePerAf={trade.pricePerAf}
            defaultVolumeAf={trade.volumeAf}
            defaultWindowLabel={trade.windowLabel || ""}
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
