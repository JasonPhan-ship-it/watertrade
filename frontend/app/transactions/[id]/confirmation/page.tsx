// app/transactions/[id]/confirmation/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";

function moneyFromCents(cents?: number | null) {
  const n = Number(cents ?? 0) / 100;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatDate(value?: Date | string | null) {
  if (!value) return "Just now";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type PageProps = {
  params: { id?: string };
};

export default async function ConfirmationPage({ params }: PageProps) {
  const id = params?.id?.trim();

  if (!id) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold">Purchase confirmed</h1>
        <p className="mt-2 text-sm text-slate-600">
          We couldn’t identify that transaction. Double-check the link from your email or head back to your dashboard.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

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
    },
  });

  if (!tx) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold">Purchase confirmed</h1>
        <p className="mt-2 text-sm text-slate-600">
          We can’t find that transaction anymore. It may have been moved or deleted. Return to your dashboard to keep browsing.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const title = tx.listing?.title ?? tx.listingTitleSnapshot ?? "Water Trade";
  const district = tx.listing?.district ?? "—";
  const waterType = tx.listing?.waterType ?? "—";
  const qty = tx.acreFeet ?? 0;
  const priceAf = tx.pricePerAF ?? 0;
  const total = (tx.totalAmount ?? qty * priceAf) || 0;
  const purchasedAtRaw = (tx as any)?.purchasedAt ?? tx.updatedAt ?? tx.createdAt ?? new Date();
  const purchasedAt = formatDate(purchasedAtRaw);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-3xl border border-emerald-200 bg-white p-8 shadow-xl shadow-emerald-100">
        <div className="flex flex-col gap-4 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-6 w-6"
              >
                <path
                  fill="currentColor"
                  d="M9.75 17.25a.75.75 0 0 1-.53-.22l-4-4a.75.75 0 0 1 1.06-1.06l3.47 3.47 7.72-7.72a.75.75 0 1 1 1.06 1.06l-8.25 8.25a.75.75 0 0 1-.53.22Z"
                />
              </svg>
            </div>
          </div>
          <div>
            <p className="text-sm uppercase tracking-wide text-emerald-700">Purchase complete</p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-900">Congratulations! You just secured this water trade.</h1>
            <p className="mt-3 text-base text-slate-600">
              A confirmation email is on its way and the seller has been notified. You can keep reviewing the agreement below or return to your dashboard.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            Purchase summary
          </div>
          <dl className="divide-y divide-slate-200 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <dt className="text-slate-500">Listing</dt>
              <dd className="font-medium text-slate-900">{title}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <dt className="text-slate-500">District</dt>
              <dd className="font-medium text-slate-900">{district}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <dt className="text-slate-500">Water type</dt>
              <dd className="font-medium text-slate-900">{waterType}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <dt className="text-slate-500">Acre-feet</dt>
              <dd className="font-medium text-slate-900">{qty.toLocaleString()}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <dt className="text-slate-500">Price / AF</dt>
              <dd className="font-medium text-slate-900">{moneyFromCents(priceAf)}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <dt className="text-slate-500">Total</dt>
              <dd className="font-semibold text-slate-900">{moneyFromCents(total)}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <dt className="text-slate-500">Purchased</dt>
              <dd className="font-medium text-slate-900">{purchasedAt}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={`/transactions/${id}?action=review`}
            className="inline-flex w-full items-center justify-center rounded-xl bg-[#004434] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#003a2f] sm:w-auto"
          >
            View transaction details
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
