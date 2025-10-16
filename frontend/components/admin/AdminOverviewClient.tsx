"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ArrowDownRight, TrendingUp } from "lucide-react";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { AdminOverviewMetrics } from "@/types/admin";

const currency = (n: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(n);

const clampPercent = (value: number) => (Math.abs(value) < 0.05 ? 0 : value);

const formatPercent = (value: number) => {
  if (!Number.isFinite(value)) return "0.0%";
  const normalized = clampPercent(value);
  const abs = Math.abs(normalized).toFixed(1);
  if (normalized > 0) return `+${abs}%`;
  if (normalized < 0) return `-${abs}%`;
  return `${abs}%`;
};

const formatPercentAbs = (value: number) => {
  if (!Number.isFinite(value)) return "0.0%";
  return `${Math.abs(clampPercent(value)).toFixed(1)}%`;
};

const TrendPill = ({ pct }: { pct: number }) => {
  if (!Number.isFinite(pct)) return null;
  const normalized = clampPercent(pct);
  const abs = Math.abs(normalized).toFixed(1);
  if (normalized > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
        <TrendingUp className="h-3 w-3" />
        +{abs}%
      </span>
    );
  }
  if (normalized < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
        <ArrowDownRight className="h-3 w-3" />
        -{abs}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
      0.0%
    </span>
  );
};

export default function AdminOverviewClient() {
  const [range, setRange] = useState<"90d" | "30d" | "7d">("90d");
  const [data, setData] = useState<AdminOverviewMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fetch("/api/admin/overview", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return (await res.json()) as AdminOverviewMetrics;
      })
      .then((json) => {
        if (live) setData(json);
      })
      .catch((err: any) => {
        if (live) setError(err?.message || "Unable to load admin overview data.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const series = useMemo(() => {
    const all = data?.visitors.series ?? [];
    if (range === "7d") return all.slice(-7);
    if (range === "30d") return all.slice(-30);
    return all;
  }, [data, range]);

  const tableRows = useMemo(() => series.slice(-14), [series]);

  const revenueDelta = useMemo(() => {
    if (!data) return 0;
    return data.revenue.last30Cents - data.revenue.previous30Cents;
  }, [data]);

  const customerDelta = useMemo(() => {
    if (!data) return 0;
    return data.newCustomers.current - data.newCustomers.previous;
  }, [data]);

  const activeAccountDelta = useMemo(() => {
    if (!data) return 0;
    return data.activeAccounts.current - data.activeAccounts.previous;
  }, [data]);

  const formatCurrencyFromCents = (cents: number) => currency((cents ?? 0) / 100);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-emerald-900">Admin Overview</h1>
        <p className="mt-2 text-sm text-emerald-700/80">
          Welcome to your admin panel.
          {loading && !data ? " Loading live marketplace totals…" : null}
          {data ? (
            <>
              {" "}
              Tracking {data.counts.activeListings.toLocaleString()} active listings,{" "}
              {data.counts.transactionsInFlight.toLocaleString()} in-flight transactions, and{" "}
              {data.counts.transactionsCompleted.toLocaleString()} completed deals to date.
            </>
          ) : null}
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-sm text-emerald-700">
          Loading the latest revenue, account, and traffic metrics…
        </div>
      ) : null}

      {!data ? null : (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-emerald-700">Total Revenue</CardTitle>
                  <TrendPill pct={data.revenue.trendPct} />
                </div>
                <div className="text-3xl font-semibold text-emerald-900">
                  {formatCurrencyFromCents(data.revenue.totalCents)}
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-emerald-700/90">
                <div
                  className={`flex items-center gap-1 font-medium ${
                    revenueDelta >= 0 ? "text-emerald-800" : "text-rose-700"
                  }`}
                >
                  {revenueDelta >= 0 ? "Up" : "Down"} {formatPercentAbs(data.revenue.trendPct)} vs prior 30 days
                  {revenueDelta >= 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                </div>
                <CardDescription>
                  Last 30 days revenue: {formatCurrencyFromCents(data.revenue.last30Cents)}
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-emerald-700">New Customers</CardTitle>
                  <TrendPill pct={data.newCustomers.trendPct} />
                </div>
                <div className="text-3xl font-semibold text-emerald-900">
                  {data.newCustomers.current.toLocaleString()}
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-emerald-700/90">
                <div
                  className={`flex items-center gap-1 font-medium ${
                    customerDelta >= 0 ? "text-emerald-800" : "text-rose-700"
                  }`}
                >
                  {customerDelta >= 0 ? "Up" : "Down"} {formatPercentAbs(data.newCustomers.trendPct)} vs prior 30 days
                  {customerDelta >= 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                </div>
                <CardDescription>
                  Prior window: {data.newCustomers.previous.toLocaleString()} signups
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-emerald-700">Active Accounts</CardTitle>
                  <TrendPill pct={data.activeAccounts.trendPct} />
                </div>
                <div className="text-3xl font-semibold text-emerald-900">
                  {data.activeAccounts.current.toLocaleString()}
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-emerald-700/90">
                <div
                  className={`flex items-center gap-1 font-medium ${
                    activeAccountDelta >= 0 ? "text-emerald-800" : "text-rose-700"
                  }`}
                >
                  {activeAccountDelta >= 0 ? "More" : "Fewer"} engaged users this month
                  {activeAccountDelta >= 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                </div>
                <CardDescription>
                  Unique buyers or sellers participating in listings or trades over the last 30 days
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-emerald-700">Growth Rate</CardTitle>
                  <TrendPill pct={data.growthRatePct} />
                </div>
                <div className="text-3xl font-semibold text-emerald-900">
                  {formatPercent(data.growthRatePct)}
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-emerald-700/90">
                <div className="flex items-center gap-1 font-medium text-emerald-800">
                  Revenue trend over the last 30 days
                  <ArrowUpRight className="h-4 w-4" />
                </div>
                <CardDescription>Compared with the prior 30-day window</CardDescription>
              </CardContent>
            </Card>
          </div>

          {/* Area Chart Card */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-emerald-900">
                    {data.visitors.source === "vercel" ? "Total Visitors" : "New Signups"}
                  </CardTitle>
                  <CardDescription>
                    {data.visitors.source === "vercel"
                      ? "Unique visitors captured by Vercel Web Analytics"
                      : "Verified signups recorded in the last 90 days"}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={range === "90d" ? "default" : "outline"}
                    className={
                      range === "90d"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    }
                    onClick={() => setRange("90d")}
                  >
                    Last 3 months
                  </Button>
                  <Button
                    variant={range === "30d" ? "default" : "outline"}
                    className={
                      range === "30d"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    }
                    onClick={() => setRange("30d")}
                  >
                    Last 30 days
                  </Button>
                  <Button
                    variant={range === "7d" ? "default" : "outline"}
                    className={
                      range === "7d"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "border-emerald-300 text-emerald-700 hover-bg-emerald-50"
                    }
                    onClick={() => setRange("7d")}
                  >
                    Last 7 days
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="h-[300px] w-full text-emerald-600">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ left: 8, right: 8 }}>
                    <defs>
                      <linearGradient id="visitorsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="currentColor" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="currentColor" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) =>
                        new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                      }
                      tick={{ fontSize: 12, fill: "#047857" }}
                      axisLine={{ stroke: "#A7F3D0" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: "#047857" }}
                      axisLine={{ stroke: "#A7F3D0" }}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, borderColor: "#A7F3D0" }}
                      labelFormatter={(d) => new Date(d as string).toLocaleDateString()}
                      formatter={(value: number) => [
                        value.toLocaleString(),
                        data.visitors.source === "vercel" ? "Visitors" : "Signups",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="visitors"
                      strokeWidth={2}
                      stroke="currentColor"
                      fill="url(#visitorsGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Data Table */}
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-emerald-900">Recent Metrics</CardTitle>
              <CardDescription>
                {data.visitors.source === "vercel"
                  ? "Daily visitors over the last two weeks"
                  : "Daily verified signups over the last two weeks"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[160px] text-emerald-700">Date</TableHead>
                    <TableHead className="text-emerald-700">Metric</TableHead>
                    <TableHead className="text-right text-emerald-700">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.map((row) => (
                    <TableRow key={row.date} className="hover:bg-emerald-50/60">
                      <TableCell className="text-emerald-900">
                        {new Date(row.date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-emerald-800">
                        {data.visitors.source === "vercel" ? "Visitors" : "New signups"}
                      </TableCell>
                      <TableCell className="text-right font-medium text-emerald-900">
                        {row.visitors.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {tableRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-emerald-800">
                        No data available for this range.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
