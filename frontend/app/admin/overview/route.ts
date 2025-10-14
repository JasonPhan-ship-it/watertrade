import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

export const runtime = "nodejs";

const COMPLETED_STATUSES = ["APPROVED", "FUNDS_RELEASED"] as const;

function toNumber(value: any) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (typeof value === "object" && typeof value.toString === "function") {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function percentChange(current: number, previous: number) {
  if (!Number.isFinite(current)) current = 0;
  if (!Number.isFinite(previous) || previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

type SeriesPoint = { date: string; visitors: number };

async function fetchVercelSeries(start: Date, end: Date): Promise<SeriesPoint[] | null> {
  const token = process.env.VERCEL_ANALYTICS_TOKEN || process.env.VERCEL_ACCESS_TOKEN;
  const projectId =
    process.env.VERCEL_ANALYTICS_PROJECT_ID ||
    process.env.VERCEL_PROJECT_ID ||
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_ID ||
    process.env.VERCEL_PROJECT_NAME;
  if (!token || !projectId) return null;

  const teamId = process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID;
  const baseCandidates: string[] = [];
  if (process.env.VERCEL_ANALYTICS_SERIES_URL) {
    baseCandidates.push(process.env.VERCEL_ANALYTICS_SERIES_URL);
  }
  baseCandidates.push(
    `https://vercel.com/api/web/insights/v2/projects/${projectId}/timeseries`,
    `https://vercel.com/api/web/insights/v1/projects/${projectId}/timeseries`,
    `https://vercel.com/api/web/insights/timeseries`
  );

  const paramCandidates: Record<string, string>[] = [
    { metric: "visitors" },
    { name: "visitors" },
    { type: "visitors" },
    { event: "visitors" },
    { metric: "pageviews" },
    { name: "pageviews" },
  ];

  for (const base of baseCandidates) {
    for (const params of paramCandidates) {
      try {
        const url = new URL(base);
        url.searchParams.set("from", start.toISOString());
        url.searchParams.set("to", end.toISOString());
        url.searchParams.set("unit", "day");
        url.searchParams.set("limit", "180");
        if (teamId) url.searchParams.set("teamId", teamId);
        for (const [k, v] of Object.entries(params)) {
          url.searchParams.set(k, v);
        }

        const res = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        });
        if (!res.ok) continue;
        const data = await res.json();
        const parsed = parseVercelPayload(data);
        if (parsed && parsed.length) {
          return parsed
            .map((p) => ({ ...p, date: new Date(p.date).toISOString().slice(0, 10) }))
            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        }
      } catch (err) {
        continue;
      }
    }
  }

  return null;
}

function parseVercelPayload(payload: any): SeriesPoint[] | null {
  if (!payload) return null;
  const seriesCandidates: any[] = [];
  if (Array.isArray(payload)) seriesCandidates.push(payload);
  if (Array.isArray(payload.series)) seriesCandidates.push(payload.series);
  if (Array.isArray(payload.timeseries)) seriesCandidates.push(payload.timeseries);
  if (payload.data) {
    if (Array.isArray(payload.data.series)) seriesCandidates.push(payload.data.series);
    if (Array.isArray(payload.data.timeseries)) seriesCandidates.push(payload.data.timeseries);
    if (Array.isArray(payload.data.result)) seriesCandidates.push(payload.data.result);
    if (Array.isArray(payload.data.results)) seriesCandidates.push(payload.data.results);
  }
  if (Array.isArray(payload.result)) seriesCandidates.push(payload.result);
  if (Array.isArray(payload.results)) seriesCandidates.push(payload.results);

  for (const series of seriesCandidates) {
    const normalized = series
      .map((row: any) => {
        const date = row?.date || row?.day || row?.timestamp || row?.time || row?.startTime || row?.start || row?.bucket;
        const value =
          row?.visitors ??
          row?.value ??
          row?.count ??
          row?.total ??
          row?.pageviews ??
          row?.metrics?.visitors ??
          row?.metrics?.value ??
          row?.metrics?.total;
        if (!date || !Number.isFinite(Number(value))) return null;
        return { date: new Date(date).toISOString(), visitors: Number(value) };
      })
      .filter(Boolean);
    if (normalized.length) return normalized as SeriesPoint[];
  }

  return null;
}

async function buildSignupSeries(start: Date, end: Date): Promise<SeriesPoint[]> {
  const users = await prisma.user.findMany({
    where: {
      role: { not: "ADMIN" },
      createdAt: { gte: start },
    },
    select: { createdAt: true },
  });

  const bucket = new Map<string, number>();
  for (const user of users) {
    const key = user.createdAt.toISOString().slice(0, 10);
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
  }

  const series: SeriesPoint[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key, visitors: bucket.get(key) ?? 0 });
  }
  return series;
}

export async function GET() {
  await requireAdmin();

  const now = new Date();
  const range90Start = new Date(now);
  range90Start.setDate(range90Start.getDate() - 89);

  const range30Start = new Date(now);
  range30Start.setDate(range30Start.getDate() - 30);

  const prev30Start = new Date(range30Start);
  prev30Start.setDate(prev30Start.getDate() - 30);

  const [revenueAllTimeAgg, revenueCurrentAgg, revenuePreviousAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { status: { in: [...COMPLETED_STATUSES] } },
      _sum: { totalAmount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        status: { in: [...COMPLETED_STATUSES] },
        createdAt: { gte: range30Start },
      },
      _sum: { totalAmount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        status: { in: [...COMPLETED_STATUSES] },
        createdAt: { gte: prev30Start, lt: range30Start },
      },
      _sum: { totalAmount: true },
    }),
  ]);

  const revenueTotalCents = toNumber(revenueAllTimeAgg._sum.totalAmount);
  const revenueCurrentCents = toNumber(revenueCurrentAgg._sum.totalAmount);
  const revenuePreviousCents = toNumber(revenuePreviousAgg._sum.totalAmount);

  const [newCustomersCurrent, newCustomersPrev] = await Promise.all([
    prisma.user.count({
      where: {
        role: { not: "ADMIN" },
        createdAt: { gte: range30Start },
      },
    }),
    prisma.user.count({
      where: {
        role: { not: "ADMIN" },
        createdAt: { gte: prev30Start, lt: range30Start },
      },
    }),
  ]);

  const [listingsCurrent, listingsPrev, transactionsCurrent, transactionsPrev] = await Promise.all([
    prisma.listing.findMany({
      where: { createdAt: { gte: range30Start }, sellerId: { not: null } },
      select: { sellerId: true },
    }),
    prisma.listing.findMany({
      where: { createdAt: { gte: prev30Start, lt: range30Start }, sellerId: { not: null } },
      select: { sellerId: true },
    }),
    prisma.transaction.findMany({
      where: { createdAt: { gte: range30Start } },
      select: { buyerId: true, sellerId: true },
    }),
    prisma.transaction.findMany({
      where: { createdAt: { gte: prev30Start, lt: range30Start } },
      select: { buyerId: true, sellerId: true },
    }),
  ]);

  const activeAccountsCurrent = new Set<string>();
  const activeAccountsPrev = new Set<string>();

  for (const row of listingsCurrent) if (row.sellerId) activeAccountsCurrent.add(row.sellerId);
  for (const row of listingsPrev) if (row.sellerId) activeAccountsPrev.add(row.sellerId);

  for (const row of transactionsCurrent) {
    if (row.sellerId) activeAccountsCurrent.add(row.sellerId);
    if (row.buyerId) activeAccountsCurrent.add(row.buyerId);
  }
  for (const row of transactionsPrev) {
    if (row.sellerId) activeAccountsPrev.add(row.sellerId);
    if (row.buyerId) activeAccountsPrev.add(row.buyerId);
  }

  const [activeListings, totalListings, transactionsInFlight, transactionsCompleted] = await Promise.all([
    prisma.listing.count({ where: { status: "ACTIVE" } }),
    prisma.listing.count(),
    prisma.transaction.count({ where: { status: { notIn: ["CANCELLED", "FUNDS_RELEASED"] } } }),
    prisma.transaction.count({ where: { status: { in: [...COMPLETED_STATUSES] } } }),
  ]);

  const vercelSeries = await fetchVercelSeries(range90Start, now).catch(() => null);
  const visitorsSeries = vercelSeries ?? (await buildSignupSeries(range90Start, now));
  const visitorSource = vercelSeries ? "vercel" : "signups";

  return NextResponse.json({
    revenue: {
      totalCents: revenueTotalCents,
      last30Cents: revenueCurrentCents,
      previous30Cents: revenuePreviousCents,
      trendPct: percentChange(revenueCurrentCents, revenuePreviousCents),
    },
    newCustomers: {
      current: newCustomersCurrent,
      previous: newCustomersPrev,
      trendPct: percentChange(newCustomersCurrent, newCustomersPrev),
    },
    activeAccounts: {
      current: activeAccountsCurrent.size,
      previous: activeAccountsPrev.size,
      trendPct: percentChange(activeAccountsCurrent.size, activeAccountsPrev.size),
    },
    growthRatePct: percentChange(revenueCurrentCents, revenuePreviousCents),
    counts: {
      activeListings,
      totalListings,
      transactionsInFlight,
      transactionsCompleted,
    },
    visitors: {
      source: visitorSource,
      series: visitorsSeries,
    },
  });
}
