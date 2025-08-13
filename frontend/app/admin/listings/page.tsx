"use client";

import { useEffect, useState } from "react";

type Row = {
  id: string;
  title: string;
  district: string;
  waterType: string;
  acreFeet: number;
  pricePerAF: number;
  status: "ACTIVE" | "UNDER_CONTRACT" | "SOLD" | "ARCHIVED";
  createdAt: string;
};

export default function AdminListingsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const url = status === "ALL" ? "/api/admin/listings" : `/api/admin/listings?status=${status}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setRows(json.listings);
    } catch (e: any) {
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [status]);

  async function setListingStatus(id: string, status: Row["status"]) {
    await fetch("/api/admin/listings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Listings</h1>
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

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {err ? (
          <div className="px-4 py-6 text-red-600 text-sm">{err}</div>
        ) : loading ? (
          <div className="px-4 py-6 text-slate-500 text-sm">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">District</th>
                  <th className="px-4 py-2">Water Type</th>
                  <th className="px-4 py-2 text-right">AF</th>
                  <th className="px-4 py-2 text-right">$ / AF (¢)</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{r.title}</td>
                    <td className="px-4 py-2">{r.district}</td>
                    <td className="px-4 py-2">{r.waterType}</td>
                    <td className="px-4 py-2 text-right">{r.acreFeet}</td>
                    <td className="px-4 py-2 text-right">{r.pricePerAF}</td>
                    <td className="px-4 py-2">{r.status}</td>
                    <td className="px-4 py-2 text-right">
                      <select
                        className="rounded-lg border px-2 py-1 text-xs"
                        value={r.status}
                        onChange={(e) => setListingStatus(r.id, e.target.value as Row["status"])}
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="UNDER_CONTRACT">UNDER_CONTRACT</option>
                        <option value="SOLD">SOLD</option>
                        <option value="ARCHIVED">ARCHIVED</option>
                      </select>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
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
