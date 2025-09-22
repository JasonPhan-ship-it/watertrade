"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/** Server payload row shape (same as your current code) */
type Row = {
  id: string;
  title: string;
  district: string;
  waterType: string;
  acreFeet: number;
  pricePerAF: number; // cents
  status: "ACTIVE" | "UNDER_CONTRACT" | "SOLD" | "ARCHIVED";
  createdAt: string;
};

export default function AdminListingsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const url =
        status === "ALL" ? "/api/admin/listings" : `/api/admin/listings?status=${status}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setRows(json.listings as Row[]);
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  /** Optimistic status update with rollback on error */
  async function setListingStatus(id: string, nextStatus: Row["status"]) {
    const prev = rows;
    setUpdatingId(id);
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, status: nextStatus } : r)));
    try {
      const res = await fetch("/api/admin/listings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: nextStatus }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      // rollback
      setRows(prev);
      alert((e as any)?.message || "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let data = rows;
    if (q) {
      data = data.filter((r) =>
        [r.title, r.district, r.waterType, r.status, String(r.acreFeet)]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }
    // newest first
    return data.slice().sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [rows, query]);

  return (
    <div className="space-y-6">
      {/* Header + controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Listings</h1>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, district, water type…"
              className="h-9 w-64 rounded-lg border px-3 text-sm"
            />
            <button
              onClick={load}
              className="h-9 rounded-lg border px-3 text-sm hover:bg-slate-50"
              disabled={loading}
              title="Refresh"
            >
              Refresh
            </button>
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-lg border px-3 text-sm"
          >
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="UNDER_CONTRACT">Under contract</option>
            <option value="SOLD">Sold</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {err ? (
          <div className="px-4 py-6 text-sm text-red-600">{err}</div>
        ) : loading ? (
          <div className="px-4 py-6 text-sm text-slate-500">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">District</th>
                  <th className="px-4 py-2">Water Type</th>
                  <th className="px-4 py-2 text-right">AF</th>
                  <th className="px-4 py-2 text-right">$ / AF</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{r.title}</td>
                    <td className="px-4 py-2">{r.district}</td>
                    <td className="px-4 py-2">{r.waterType}</td>
                    <td className="px-4 py-2 text-right">{formatInt(r.acreFeet)}</td>
                    <td className="px-4 py-2 text-right">{formatMoneyPerAf(r.pricePerAF)}</td>
                    <td className="px-4 py-2">{prettyStatus(r.status)}</td>
                    <td className="px-4 py-2">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/listings/${r.id}`}
                          className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          View
                        </Link>
                        <select
                          className="rounded-lg border px-2 py-1 text-xs"
                          value={r.status}
                          disabled={updatingId === r.id}
                          onChange={(e) =>
                            setListingStatus(r.id, e.target.value as Row["status"])
                          }
                        >
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="UNDER_CONTRACT">UNDER_CONTRACT</option>
                          <option value="SOLD">SOLD</option>
                          <option value="ARCHIVED">ARCHIVED</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      No listings
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------- Helpers -------- */

function formatInt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

/** Convert cents → dollars and format */
function formatMoneyPerAf(cents: number) {
  const dollars = (cents ?? 0) / 100;
  return dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function prettyStatus(s: Row["status"]) {
  switch (s) {
    case "ACTIVE":
      return "Active";
    case "UNDER_CONTRACT":
      return "Under Contract";
    case "SOLD":
      return "Sold";
    case "ARCHIVED":
      return "Archived";
    default:
      return s;
  }
}
