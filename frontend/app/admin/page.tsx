"use client";

import { useMemo, useState } from "react";
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

export const runtime = "nodejs";

// ---- Mock data (replace with your API data when ready) ----
const rawVisitors = [
  { date: "2025-04-01", visitors: 420 },
  { date: "2025-04-03", visitors: 980 },
  { date: "2025-04-06", visitors: 610 },
  { date: "2025-04-09", visitors: 1340 },
  { date: "2025-04-12", visitors: 720 },
  { date: "2025-04-15", visitors: 1500 },
  { date: "2025-04-18", visitors: 860 },
  { date: "2025-04-21", visitors: 1210 },
  { date: "2025-04-24", visitors: 980 },
  { date: "2025-04-27", visitors: 1600 },
  { date: "2025-04-30", visitors: 1320 },
  { date: "2025-05-03", visitors: 1180 },
  { date: "2025-05-06", visitors: 1740 },
  { date: "2025-05-09", visitors: 920 },
  { date: "2025-05-12", visitors: 1420 },
  { date: "2025-05-15", visitors: 1680 },
  { date: "2025-05-18", visitors: 820 },
  { date: "2025-05-21", visitors: 1310 },
  { date: "2025-05-24", visitors: 1010 },
  { date: "2025-05-27", visitors: 1800 },
  { date: "2025-05-30", visitors: 1510 },
  { date: "2025-06-02", visitors: 1260 },
  { date: "2025-06-05", visitors: 1880 },
  { date: "2025-06-08", visitors: 980 },
  { date: "2025-06-11", visitors: 1390 },
  { date: "2025-06-14", visitors: 2010 },
  { date: "2025-06-17", visitors: 1110 },
  { date: "2025-06-20", visitors: 1710 },
  { date: "2025-06-23", visitors: 1190 },
  { date: "2025-06-26", visitors: 2090 },
  { date: "2025-06-29", visitors: 2300 },
];

const currency = (n: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(n);

const GrowthPill = ({ value }: { value: string }) => (
  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
    <TrendingUp className="h-3 w-3" />
    {value}
  </span>
);

export default function AdminHome() {
  const [range, setRange] = useState<"90d" | "30d" | "7d">("90d");

  const series = useMemo(() => {
    if (range === "7d") return rawVisitors.slice(-7);
    if (range === "30d") return rawVisitors.slice(-15); // ~ every other day sample
    return rawVisitors; // ~90d
  }, [range]);

  const totals = useMemo(() => {
    const revenue = 1250;
    const newCustomers = 1234;
    const active = 45678;
    const growth = 4.5;
    return { revenue, newCustomers, active, growth };
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-emerald-900">Admin Overview</h1>
        <p className="mt-2 text-sm text-emerald-700/80">
          Welcome to your admin panel.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-emerald-700">Total Revenue</CardTitle>
              <GrowthPill value="+12.5%" />
            </div>
            <div className="text-3xl font-semibold text-emerald-900">
              {currency(totals.revenue)}
            </div>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-emerald-700/90">
            <div className="flex items-center gap-1 font-medium text-emerald-800">
              Trending up this month <ArrowUpRight className="h-4 w-4" />
            </div>
            <CardDescription>Visitors for the last 6 months</CardDescription>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-emerald-700">New Customers</CardTitle>
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                <ArrowDownRight className="h-3 w-3" />-20%
              </span>
            </div>
            <div className="text-3xl font-semibold text-emerald-900">
              {totals.newCustomers.toLocaleString()}
            </div>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-emerald-700/90">
            <div className="flex items-center gap-1 font-medium text-emerald-800">
              Down 20% this period <ArrowDownRight className="h-4 w-4" />
            </div>
            <CardDescription>Acquisition needs attention</CardDescription>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-emerald-700">Active Accounts</CardTitle>
              <GrowthPill value="+12.5%" />
            </div>
            <div className="text-3xl font-semibold text-emerald-900">
              {totals.active.toLocaleString()}
            </div>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-emerald-700/90">
            <div className="flex items-center gap-1 font-medium text-emerald-800">
              Strong user retention <ArrowUpRight className="h-4 w-4" />
            </div>
            <CardDescription>Engagement exceeds targets</CardDescription>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-emerald-700">Growth Rate</CardTitle>
              <GrowthPill value="+4.5%" />
            </div>
            <div className="text-3xl font-semibold text-emerald-900">{totals.growth}%</div>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-emerald-700/90">
            <div className="flex items-center gap-1 font-medium text-emerald-800">
              Steady performance increase <ArrowUpRight className="h-4 w-4" />
            </div>
            <CardDescription>Meets growth projections</CardDescription>
          </CardContent>
        </Card>
      </div>

      {/* Area Chart Card */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-emerald-900">Total Visitors</CardTitle>
              <CardDescription>Total for the selected range</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={range === "90d" ? "default" : "outline"}
                className={range === "90d"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"}
                onClick={() => setRange("90d")}
              >
                Last 3 months
              </Button>
              <Button
                variant={range === "30d" ? "default" : "outline"}
                className={range === "30d"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"}
                onClick={() => setRange("30d")}
              >
                Last 30 days
              </Button>
              <Button
                variant={range === "7d" ? "default" : "outline"}
                className={range === "7d"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"}
                onClick={() => setRange("7d")}
              >
                Last 7 days
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="h-[300px] w-full text-emerald-600">
            {/* ^ currentColor for the line/area will be emerald via this wrapper */}
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
                  tick={{ fontSize: 12, fill: "#047857" }}          // emerald-700
                  axisLine={{ stroke: "#A7F3D0" }}                  // emerald-200
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#047857" }}          // emerald-700
                  axisLine={{ stroke: "#A7F3D0" }}                  // emerald-200
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 12, borderColor: "#A7F3D0" }} // emerald-200
                  labelFormatter={(d) => new Date(d as string).toLocaleDateString()}
                  formatter={(value: number) => [value.toLocaleString(), "Visitors"]}
                />
                <Area type="monotone" dataKey="visitors" strokeWidth={2} stroke="currentColor" fill="url(#visitorsGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-emerald-900">Recent Metrics</CardTitle>
          <CardDescription>Key stats from the last 14 days</CardDescription>
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
              {rawVisitors.slice(-14).map((row) => (
                <TableRow key={row.date} className="hover:bg-emerald-50/60">
                  <TableCell className="text-emerald-900">
                    {new Date(row.date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="text-emerald-800">Visitors</TableCell>
                  <TableCell className="text-right font-medium text-emerald-900">
                    {row.visitors.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
