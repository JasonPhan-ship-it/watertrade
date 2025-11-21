// components/trade/TradeShell.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import DeclineButton from "@/components/trade/DeclineButton";
import CounterButton from "@/components/trade/CounterButton";
import AcceptButton from "@/components/trade/AcceptButton";
import BuyNowConfirmButton from "@/components/trade/BuyNowConfirmButton";
import TradeProgressTracker, { type TradeProgressStep } from "@/components/trade/ProgressTracker";
import { buildTradeProgressSteps } from "@/lib/trade-progress";
import { getSiteSetting } from "@/lib/site-settings";
import { DEFAULT_WATER_TRADER_FEE_RATE } from "@/lib/site-settings/defaults";

type Props = {
  tradeId: string;
  role?: string;
  token?: string;
  action?: string;
  hideInlineBuyNow?: boolean;
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

function moneyFromCents(cents?: number) {
  const n = ((cents ?? 0) as number) / 100;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

async function loadTransactionByAnyId(anyId: string): Promise<TxWithJoins | null> {
  const direct = await prisma.transaction.findUnique({
    where: { id: anyId },
    include: {
      listing: { select: { id: true, title: true, district: true, waterType: true, kind: true } },
      signatures: { select: signatureSelect },
    },
  });
  if (direct) return direct;

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
    console.error("[TradeShell] load failed", { tradeOrTxId, msg, digest: (e as any)?.digest });
    return { tx: null, err: msg };
  }
}

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "amber" | "red" }) {
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

function buildUrl(base: string, opts: { token?: string; role?: "buyer" | "seller" } = {}) {
  // Always supply a base; never touches window
  const url = new URL(base, "http://localhost");
  if (opts.token) url.searchParams.set("token", opts.token);
  if (opts.role) url.searchParams.set("role", opts.role);
  return url.pathname + (url.search ? url.search : "");
}

export default async function TradeShell(props: Props) {
  try {
    const {
      tradeId,
      role = "",
      token = "",
      action = "",
      hideInlineBuyNow = false,
    } = props;

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

    // linked Trade (optional)
    const linkedTrade = await prisma.trade.findFirst({
      where: { transactionId: tx.id },
      select: {
        id: true,
        status: true,
        sellerSignStatus: true,
        buyerSignStatus: true,
        sellerSignUrl: true,
        buyerSignUrl: true,
      },
    });
    const tradeIdLinked = linkedTrade?.id ?? null;

    const progressSteps = buildTradeProgressSteps({
      tradeStatus: linkedTrade?.status ?? tx.status,
      sellerSignStatus: linkedTrade?.sellerSignStatus,
      buyerSignStatus: linkedTrade?.buyerSignStatus,
      txStatus: tx.status,
    });

    // resolve viewer role
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
      } catch (e) {
        console.error("[TradeShell] auth resolution failed", { digest: (e as any)?.digest });
      }
    }

    // view model
    const rawTitle = tx.listing?.title ?? tx.listingTitleSnapshot ?? "Water Trade";
    const title = formatAcreFeetFigures(rawTitle);
    const district = tx.listing?.district ?? "—";
    const waterType = tx.listing?.waterType ?? "—";
    const qty = tx.acreFeet ?? 0;
    const priceAf = tx.pricePerAF ?? 0; // cents
    const subtotalCents = (tx.totalAmount ?? qty * priceAf) || 0;
    const kind = tx.type === "OFFER" ? "Offer" : tx.type === "BUY_NOW" ? "Buy Now" : tx.type ?? "—";
    const status = tx.status ?? "—";
    const statusUpper = status.toUpperCase();
    const isBuyNow = tx.type === "BUY_NOW";

    const waterTraderFeeSetting = await getSiteSetting("waterTraderFee");
    const rawFeeRate = Number(waterTraderFeeSetting?.rate);
    const normalizedFeeRate =
      Number.isFinite(rawFeeRate) && rawFeeRate >= 0 ? rawFeeRate : DEFAULT_WATER_TRADER_FEE_RATE;
    const feeAmountCents = Math.round(subtotalCents * normalizedFeeRate);
    const finalTotalCents = subtotalCents + feeAmountCents;
    const feePercentLabel = (normalizedFeeRate * 100).toLocaleString(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: normalizedFeeRate > 0 && normalizedFeeRate < 0.01 ? 2 : 0,
    });

    const sellerSignStatus = `${linkedTrade?.sellerSignStatus ?? "NONE"}`;
    const buyerSignStatus = `${linkedTrade?.buyerSignStatus ?? "NONE"}`;
    const sellerSignUrl = linkedTrade?.sellerSignUrl ?? "";
    const buyerSignUrl = linkedTrade?.buyerSignUrl ?? "";
    const tradeStatusRaw = `${linkedTrade?.status ?? ""}`.toUpperCase();
    const sellerSignStatusUpper = sellerSignStatus.toUpperCase();
    const buyerSignStatusUpper = buyerSignStatus.toUpperCase();
    const sellerSignRequested = sellerSignStatusUpper === "REQUESTED";
    const buyerSignRequested = buyerSignStatusUpper === "REQUESTED";
    const sellerSignReady = sellerSignRequested || statusUpper === "PENDING_SELLER_SIGNATURE";
    const buyerSignReady = buyerSignRequested;
    const sellerSignHref = sellerSignUrl || `/api/signing/seller?tx=${encodeURIComponent(tx.id)}`;
    const buyerSignHref = buyerSignUrl || `/api/signing/buyer?tx=${encodeURIComponent(tx.id)}`;
    const signUrlSeller = sellerSignHref;
    const signUrlBuyer = buyerSignHref;
    const signUrl = viewerRole === "seller" ? signUrlSeller : viewerRole === "buyer" ? signUrlBuyer : "";
    const sellerHasAccepted =
      tradeStatusRaw.startsWith("ACCEPTED") ||
      tradeStatusRaw === "FULLY_EXECUTED" ||
      sellerSignReady;
    const sellerAwaitingBuyer = sellerHasAccepted && buyerSignRequested && !sellerSignRequested;
    const buyerAwaitingSignature = statusUpper === "PENDING_BUYER_SIGNATURE";
    
    // endpoints
    const idForActions = tradeIdLinked || tx.id;
    const acceptUrlSeller = buildUrl(`/api/trades/${idForActions}/seller/accept`, {
      token,
      role: viewerRole === "seller" ? "seller" : undefined,
    });
    const acceptUrlBuyer = buildUrl(`/api/trades/${idForActions}/buyer/accept`, {
      token,
      role: viewerRole === "buyer" ? "buyer" : undefined,
    });
    const declineUrlBuyer = buildUrl(`/api/trades/${idForActions}/buyer/decline`, {
      token,
      role: viewerRole === "buyer" ? "buyer" : undefined,
    });
    const counterUrlSeller = buildUrl(`/api/trades/${idForActions}/seller/counter`, {
      token,
      role: viewerRole === "seller" ? "seller" : undefined,
    });
    const counterUrlBuyer = buildUrl(`/api/trades/${idForActions}/buyer/counter`, {
      token,
      role: viewerRole === "buyer" ? "buyer" : undefined,
    });

    const showPermsHint = viewerRole === "guest";

    // Force-hide inline Buy Now on review route
    const isReview = action?.toLowerCase?.() === "review";    
    const actionLower = action?.toLowerCase?.() ?? "";
    
    const hideInlineBuyNowFinal =
      hideInlineBuyNow || isReview || actionLower === "awaiting-buyer-signature";
    const showAwaitingSellerSignatureBanner =
      actionLower === "awaiting-seller-signature" ||
      (!actionLower && viewerRole === "seller" && sellerSignReady);
    const showAwaitingBuyerSignatureBanner =
      actionLower === "awaiting-buyer-signature" ||
      (!actionLower && viewerRole === "buyer" && buyerSignReady);

    const showSellerSignCta = viewerRole === "seller" && sellerSignReady && Boolean(sellerSignHref);

    const showBuyerSignCta = viewerRole === "buyer" && buyerSignReady && Boolean(buyerSignHref);

    const showSellerSignCtaInline = showSellerSignCta && !showAwaitingSellerSignatureBanner;

    const showBuyerSignCtaInline = showBuyerSignCta && !showAwaitingBuyerSignatureBanner;
    const buyerHasSigned = buyerSignStatusUpper === "SIGNED";
    const buyerSignatureMessage = (() => {
      if (buyerHasSigned && viewerRole === "buyer") {
        return "You already finished DocuSign. We’ll update you once the seller completes their part.";
      }
      if (buyerHasSigned) {
        return "The buyer already finished DocuSign. We’ll update everyone once the seller completes their part.";
      }
      if (viewerRole === "buyer") {
        return "You have the DocuSign link—sign now to keep the trade moving.";
      }
      return "The buyer has the DocuSign link and will sign next.";
    })();
    let banner: React.ReactNode = null;
    if (showAwaitingSellerSignatureBanner) {
      const sellerDocuSignLabel =
        actionLower === "awaiting-seller-signature" ? "Continue to DocuSign" : "Resume DocuSign";
      banner = (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <div className="font-semibold">Awaiting seller signature</div>
          <p className="mt-1 text-sm">The buyer has already signed. Complete DocuSign to move the trade forward.</p>
          {viewerRole === "seller" && sellerSignHref ? (
            <div className="mt-3">
              <a
                href={sellerSignHref}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                {sellerDocuSignLabel}
              </a>
            </div>
          ) : null}
        </div>
      );
    } else if (actionLower === "seller-signature-complete") {
      banner = (
        <div className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
          <div className="font-semibold">Seller signature captured</div>
          <p className="mt-1 text-sm">Compliance review is underway. We’ll notify everyone once the district responds.</p>
        </div>
      );
    } else if (showAwaitingBuyerSignatureBanner) {
      banner = (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <div className="font-semibold">Awaiting buyer signature</div>
          <p className="mt-1 text-sm">The buyer has the DocuSign link and will sign next.</p>
          {viewerRole === "buyer" && buyerSignHref ? (
            <div className="mt-3">
              <a
                href={buyerSignHref}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                Open DocuSign
              </a>
            </div>
          ) : null}
        </div>
      );
    } else if (actionLower === "buyer-signature-complete") {
      banner = (
        <div className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
          <div className="font-semibold">Buyer signature captured</div>
          <p className="mt-1 text-sm">We notified the seller to sign. We’ll update you once they finish.</p>
        </div>
      );
    } else if (actionLower === "signing-error") {
      banner = (
        <div className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-900">
          <div className="font-semibold">We couldn’t verify the signing status</div>
          <p className="mt-1 text-sm">Please refresh or contact support if the issue persists.</p>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-3xl p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              <Badge tone={toneForStatus(status)}>{status}</Badge>
              <Badge tone="slate">{kind}</Badge>
            </div>
            {isBuyNow ? <div className="flex items-center sm:ml-3" id="buy-now-header-slot" /> : null}
          </div>
        </div>

        {banner}

        {/* Summary */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs uppercase text-slate-500">Summary</div>
            <div className="text-xs text-slate-600">
              Role:&nbsp;<Badge tone="slate">{viewerRole}</Badge>
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
                  <td className="bg-slate-50 px-4 py-2 text-slate-600">Acre-Feet</td>
                  <td className="px-4 py-2">{qty.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="bg-slate-50 px-4 py-2 text-slate-600">Price / AF</td>
                  <td className="px-4 py-2">{moneyFromCents(priceAf)}</td>
                </tr>
                <tr>
                  <td className="bg-slate-50 px-4 py-2 text-slate-600">Subtotal</td>
                  <td className="px-4 py-2">{moneyFromCents(subtotalCents)}</td>
                </tr>
                <tr>
                  <td className="bg-slate-50 px-4 py-2 text-slate-600">
                    Water Traders fee ({feePercentLabel}%)
                  </td>
                  <td className="px-4 py-2">{moneyFromCents(feeAmountCents)}</td>
                </tr>
                <tr>
                  <td className="bg-slate-50 px-4 py-2 font-medium text-slate-700">Total</td>
                  <td className="px-4 py-2 font-medium">{moneyFromCents(finalTotalCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        
        {/* Actions */}
        {!isBuyNow ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {showPermsHint && (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                You’re signed in as a guest for this transaction. Actions may return “Forbidden” unless you’re the buyer/seller or provide a valid token.
              </div>
            )}

            {viewerRole === "seller" ? (
              sellerHasAccepted ? (
                <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  {sellerAwaitingBuyer
                    ? "You accepted this offer. We invited the buyer to sign and will email you when it's your turn."
                    : "You accepted this offer. Use the DocuSign link above to finish signing."}
                </div>
              ) : (

                <div className="flex flex-wrap items-center gap-3">
                  <AcceptButton
                    postUrl={acceptUrlSeller}
                    label="Accept"
                    className="inline-flex h-9 items-center justify-center rounded-xl bg-[#004434] px-4 text-sm font-semibold text-white hover:bg-[#003a2f]"
                    confirm
                    confirmMessage="Accept this offer?"
                    successMessage="We invited the buyer to sign and will email you when it's your turn."
                  />
                  <CounterButton
                    postUrl={counterUrlSeller}
                    role="seller"
                    currentPriceCents={priceAf}
                    currentQty={qty}
                    label="Counter"
                  />
                  <DeclineButton
                    transactionId={tradeIdLinked || tx.id}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100"
                    label="Decline"
                  />
                </div>
              )
            ) : viewerRole === "buyer" ? (
              buyerAwaitingSignature ? null : (
                <div className="flex flex-wrap items-center gap-3">
                  <AcceptButton
                    postUrl={acceptUrlBuyer}
                    label="Accept"
                    className="inline-flex h-9 items-center justify-center rounded-xl bg-[#004434] px-4 text-sm font-semibold text-white hover:bg-[#003a2f]"
                    confirm
                    confirmMessage="Accept this offer?"
                    successMessage="We invited the seller to sign and will email you when it's their turn."
                  />
                  <CounterButton
                    postUrl={counterUrlBuyer}
                    role="buyer"
                    currentPriceCents={priceAf}
                    currentQty={qty}
                    label="Counter"
                  />
                  <DeclineButton
                    transactionId={tradeIdLinked || tx.id}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100"
                    label="Decline"
                  />
                </div>
              )
            ) : (
              <div className="text-sm text-slate-600">
                You’re viewing as a guest.{" "}
                <Link href="/sign-in" className="text-[#0E6A59] underline">
                  Sign in
                </Link>{" "}
                to take action.
              </div>
            )}

              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={signUrl || signUrlBuyer || signUrlSeller}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-[#004434] px-5 text-sm font-semibold text-white hover:bg-[#00392f]"
                >
                  Open DocuSign
                </a>
                <Link href="/contact" className="text-sm font-semibold text-[#0E6A59] underline">
                  Need help?
                </Link>
              </div>
          </div>
        ) : null}
                

        {/* Progress Tracker */}
        
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Progress</h2>
          </div>
          <TradeProgressTracker steps={progressSteps} />

          {viewerRole === "buyer" && buyerSignStatusUpper === "SIGNED" ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              Thanks for signing! We’ll notify the seller to finish their part.
            </div>
          ) : null}
        </div>

        {/* Disclaimer */}
        <div className="mt-6 text-xs text-slate-500">
          Prices shown are dollars per acre-foot. Final settlement may vary with conveyance and district fees.
        </div>
      </div>
    );
  } catch (e: any) {
    // Log full detail on the server; show friendly UI
    console.error("[TradeShell] render error", { message: e?.message, digest: e?.digest, stack: e?.stack });
    return uiError(
      "We hit a snag loading this trade",
      "Please refresh. If the issue persists, contact support with the trade URL.",
      undefined,
      e
    );
  }
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

function formatAcreFeetFigures(title: string) {
  if (!title) return title;
  return title.replace(/\b(\d{4,})(?=\s*AF\b)/gi, (match) => {
    const numeric = Number(match);
    return Number.isNaN(numeric) ? match : new Intl.NumberFormat("en-US").format(numeric);
  });
}
