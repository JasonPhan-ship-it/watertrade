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
    <div className="relative isolate overflow-hidden bg-gradient-to-b from-slate-50 via-white to-emerald-50/40">
      <div className="absolute inset-x-0 top-[-10rem] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[-18rem]">
        <div
          className="relative left-1/2 aspect-[1155/678] w-[72.1875rem] -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-200 via-emerald-100 to-transparent opacity-60"
          aria-hidden
        />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-12">
        <div className="flex items-center gap-3 text-sm text-emerald-700">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 shadow-inner ring-1 ring-emerald-100">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-emerald-700" aria-hidden>
              <path
                d="M5 12.5L9.5 17 19 7.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="flex items-center gap-2">
            <Link
              href={listingHref}
              className="font-semibold text-emerald-800 transition hover:text-emerald-900"
            >
              Return to listing
            </Link>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6">
          <div className="rounded-3xl border border-emerald-100/70 bg-white/90 p-8 shadow-xl backdrop-blur">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Secure transaction</p>
                <h1 className="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">{heading}</h1>
                <p className="mt-3 max-w-3xl text-base text-slate-600 sm:text-lg">
                  You&apos;re about to {actionVerb} <span className="font-semibold text-slate-900">{listing.title || "this listing"}</span>.
                  We&apos;ve prepared a concierge-style summary so you can breeze through DocuSign with confidence.
                </p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900/80">Listing</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{listing.title || "Untitled listing"}</p>
                <p className="mt-1 text-sm text-emerald-900/70">Status: {listing.status || "Pending"}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{formatAcreFeet(acreFeet)} AF</p>
                <p className="mt-1 text-sm text-slate-600">Ready for instant escrow</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Marketplace total</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(marketplaceTotal)}</p>
                <p className="mt-1 text-sm text-slate-600">Includes Water Trader fee</p>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-slate-100 bg-slate-50/80 p-6 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Financials</p>
                  <p className="text-base text-slate-700">Crystal clear pricing so you can sign with confidence.</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                  Audit-ready ledger
                </span>
              </div>
              <dl className="mt-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl bg-white px-4 py-3 shadow-inner">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Listing price per AF</dt>
                  <dd className="mt-2 text-base font-semibold text-slate-900">{formatCurrency(pricePerAfDollars)}</dd>
                </div>
                <div className="rounded-xl bg-white px-4 py-3 shadow-inner">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Water Trader fee ({feePercentLabel}%)</dt>
                  <dd className="mt-2 text-base font-semibold text-slate-900">{formatCurrency(feePerAf)}</dd>
                </div>
                <div className="rounded-xl bg-white px-4 py-3 shadow-inner">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Marketplace price per AF</dt>
                  <dd className="mt-2 text-base font-semibold text-slate-900">{formatCurrency(marketplacePricePerAf)}</dd>
                </div>
                <div className="rounded-xl bg-white px-4 py-3 shadow-inner sm:col-span-2 lg:col-span-3">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Subtotal (before fee)</dt>
                  <dd className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(total)}</dd>
                </div>
                <div className="rounded-xl bg-white px-4 py-3 shadow-inner sm:col-span-2 lg:col-span-3">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Water Trader fee total</dt>
                  <dd className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(feeTotal)}</dd>
                </div>
                <div className="rounded-xl bg-[#003a2f] px-4 py-4 text-white shadow-lg sm:col-span-2 lg:col-span-3">
                  <dt className="flex items-center gap-2 text-xs uppercase tracking-wide text-emerald-100">
                    Total due (incl. fee)
                  </dt>
                  <dd className="mt-2 text-2xl font-semibold">{formatCurrency(marketplaceTotal)}</dd>
                  <p className="mt-1 text-sm text-emerald-50">Locked in at current marketplace terms.</p>
                </div>
                {buyerWaterAccount ? (
                  <div className="rounded-xl border border-emerald-100 bg-white px-4 py-3 shadow-inner sm:col-span-2 lg:col-span-3">
                    <dt className="text-xs uppercase tracking-wide text-emerald-700">Destination water account</dt>
                    <dd className="mt-2 break-words text-base font-semibold text-slate-900">{buyerWaterAccount}</dd>
                    <p className="mt-1 text-sm text-emerald-800/80">We&apos;ll route the transfer automatically after signatures.</p>
                  </div>
                ) : null}
              </dl>
            </div>

            <BuyNowConfirmClient
              listingId={listing.id}
              buyerWaterAccount={buyerWaterAccount || undefined}
              mode={normalizedMode}
              backHref={listingHref}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
