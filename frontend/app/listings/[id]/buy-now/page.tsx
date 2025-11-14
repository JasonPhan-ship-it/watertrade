// app/listings/[id]/buy-now/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSiteSetting } from "@/lib/site-settings";
import { DEFAULT_WATER_TRADER_FEE_RATE } from "@/lib/site-settings/defaults";

import BuyNowConfirmClient from "./ConfirmClient";

export const runtime = "nodejs";
export const revalidate = 0;

function formatCurrency(amount: number) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatAcreFeet(acreFeet: number) {
  return new Intl.NumberFormat("en-US").format(acreFeet);
}

type PageProps = {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function BuyNowConfirmationPage({ params, searchParams }: PageProps) {
  const listing = await prisma.listing.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      status: true,
      pricePerAF: true,
      acreFeet: true,
      kind: true,
    },
  });

  if (!listing) {
    notFound();
  }

  const waterTraderFee = await getSiteSetting("waterTraderFee");

  const normalizedFeeRate =
    typeof waterTraderFee?.rate === "number" &&
    Number.isFinite(waterTraderFee.rate) &&
    waterTraderFee.rate >= 0
      ? waterTraderFee.rate
      : DEFAULT_WATER_TRADER_FEE_RATE;

  const pricePerAfDollars = Number(listing.pricePerAF ?? 0) / 100;
  const acreFeet = Math.max(1, Math.floor(Number(listing.acreFeet) || 1));
  const total = pricePerAfDollars * acreFeet;
  const feePerAf = pricePerAfDollars * normalizedFeeRate;
  const feeTotal = feePerAf * acreFeet;
  const marketplacePricePerAf = pricePerAfDollars + feePerAf;
  const marketplaceTotal = total + feeTotal;
  const feePercentLabel = (normalizedFeeRate * 100).toLocaleString("en-US", {
    minimumFractionDigits: normalizedFeeRate > 0 && normalizedFeeRate < 0.01 ? 2 : 0,
    maximumFractionDigits: 2,
  });

  const listingHref = `/listings/${listing.id}`;

  const accountParam = searchParams?.buyerWaterAccount;
  const buyerWaterAccount = Array.isArray(accountParam)
    ? accountParam[0] || ""
    : typeof accountParam === "string"
    ? accountParam
    : "";

  const modeParam = searchParams?.mode;
  const normalizedMode =
    typeof modeParam === "string" && modeParam.toUpperCase() === "SELL_NOW"
      ? "SELL_NOW"
      : "BUY_NOW";

  const actionVerb = normalizedMode === "SELL_NOW" ? "sell" : "buy";
  const heading = normalizedMode === "SELL_NOW" ? "Confirm Sell Now" : "Confirm Buy Now";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href={listingHref}
        className="inline-flex items-center text-sm font-medium text-emerald-700 transition hover:text-emerald-800"
      >
        ← Back to listing
      </Link>

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900">{heading}</h1>
        <p className="mt-3 text-sm text-slate-600">
          You&apos;re about to {actionVerb}{" "}
          <span className="font-medium text-slate-900">{listing.title || "this listing"}</span>. Review the
          details below and confirm to open DocuSign for signatures.
        </p>

        <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Quantity</dt>
            <dd className="mt-2 text-base font-semibold text-slate-900">{formatAcreFeet(acreFeet)} AF</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Listing price per AF</dt>
            <dd className="mt-2 text-base font-semibold text-slate-900">{formatCurrency(pricePerAfDollars)}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Water Trader fee ({feePercentLabel}%)
            </dt>
            <dd className="mt-2 text-base font-semibold text-slate-900">{formatCurrency(feePerAf)}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Marketplace price per AF</dt>
            <dd className="mt-2 text-base font-semibold text-slate-900">{formatCurrency(marketplacePricePerAf)}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Subtotal (before fee)</dt>
            <dd className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(total)}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Water Trader fee total</dt>
            <dd className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(feeTotal)}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Total due (incl. fee)</dt>
            <dd className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(marketplaceTotal)}</dd>
          </div>
          {buyerWaterAccount ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Destination water account</dt>
              <dd className="mt-2 font-medium text-slate-900 break-words">{buyerWaterAccount}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-medium">Next step</p>
          <p className="mt-1 text-emerald-900/80">
            Confirming will lock in the listing and immediately launch DocuSign so you can complete the agreement.
          </p>
        </div>

        <BuyNowConfirmClient
          listingId={listing.id}
          buyerWaterAccount={buyerWaterAccount || undefined}
          mode={normalizedMode}
          backHref={listingHref}
        />
      </div>
    </div>
  );
}
