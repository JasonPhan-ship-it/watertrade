import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

import DecisionPanel from "./DecisionPanel";
import { requireDistrictAdmin } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = { params: { id?: string } };

function formatMoney(cents?: number | null) {
  const amount = Number(cents ?? 0) / 100;
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatDate(value?: Date | string | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default async function DistrictTransactionPage({ params }: PageProps) {
  const id = params?.id?.trim();
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  await requireDistrictAdmin();

  if (!id) notFound();

  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: {
      listing: {
        select: {
          title: true,
          district: true,
          waterType: true,
          kind: true,
        },
      },
      buyer: { select: { name: true, email: true } },
      seller: { select: { name: true, email: true } },
      trade: {
        select: {
          id: true,
          district: true,
          waterType: true,
          pricePerAf: true,
          volumeAf: true,
          windowLabel: true,
        },
      },
    },
  });

  if (!tx) notFound();

  const listingTitle = tx.listing?.title ?? tx.listingTitleSnapshot ?? "Water Trade";
  const district = tx.trade?.district || tx.listing?.district || "—";
  const waterType = tx.trade?.waterType || tx.listing?.waterType || "—";
  const pricePerAf = tx.trade?.pricePerAf ?? tx.pricePerAF ?? 0;
  const volume = tx.trade?.volumeAf ?? tx.acreFeet ?? 0;
  const total = tx.totalAmount ?? volume * pricePerAf;
  const createdAt = tx.createdAt ?? new Date();

  const readonly = ["APPROVED", "FUNDS_RELEASED", "CANCELLED"].includes(tx.status);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">District review</p>
          <h1 className="text-2xl font-semibold text-slate-900">Trade {tx.id}</h1>
          <p className="text-sm text-slate-600">Review the water transfer details before accepting or declining.</p>
        </div>
        <Link
          href="/admin/transactions"
          className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to admin
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Transaction details</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                {tx.status.replace(/_/g, " ")}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <Detail label="Listing" value={listingTitle} />
              <Detail label="District" value={district} />
              <Detail label="Water type" value={waterType} />
              <Detail label="Type" value={tx.listing?.kind ?? tx.type} />
              <Detail label="Acre-feet" value={volume.toLocaleString()} />
              <Detail label="Price / AF" value={formatMoney(pricePerAf)} />
              <Detail label="Total" value={formatMoney(total)} />
              <Detail label="Created" value={formatDate(createdAt)} />
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Parties</h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <Detail label="Buyer" value={tx.buyer?.name || tx.buyerNameSnapshot || "—"} helper={tx.buyer?.email || tx.buyerEmailSnapshot} />
              <Detail label="Seller" value={tx.seller?.name || tx.sellerNameSnapshot || "—"} helper={tx.seller?.email || tx.sellerEmailSnapshot} />
            </dl>
          </div>
        </div>

        <div className="space-y-4">
          <DecisionPanel transactionId={tx.id} disabled={readonly} currentStatus={tx.status.replace(/_/g, " ")} />
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-sm text-slate-700">
            <p className="font-semibold text-slate-900">What happens next?</p>
            <p className="mt-2">
              Accepting moves the trade into the approved state so payments can be released. Declining will cancel the trade
              and notify the marketplace team.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

type DetailProps = {
  label: string;
  value: string;
  helper?: string | null;
};

function Detail({ label, value, helper }: DetailProps) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value}</dd>
      {helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}
