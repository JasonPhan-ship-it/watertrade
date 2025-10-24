"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const EMPTY_FORM: FormState = {
  districtName: "",
  code: "",
  year: "",
  description: "",
  category: "",
  isActive: true,
};

type WaterCodeRow = {
  id: string;
  districtId: string;
  districtName: string | null;
  code: string;
  year: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
};

type FormState = {
  districtName: string;
  code: string;
  year: string;
  description: string;
  category: string;
  isActive: boolean;
};

export default function WaterCodesManager() {
  const [rows, setRows] = useState<WaterCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDistrict, setFilterDistrict] = useState<string>("ALL");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const districts = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => {
      if (row.districtName) set.add(row.districtName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (filterDistrict === "ALL") return rows;
    return rows.filter((row) => row.districtName === filterDistrict);
  }, [rows, filterDistrict]);

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/water-codes?includeInactive=true", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const flattened: WaterCodeRow[] = [];
      const districtList: any[] = Array.isArray(data?.districts) ? data.districts : [];
      for (const dist of districtList) {
        const codes: any[] = Array.isArray(dist?.codes) ? dist.codes : [];
        for (const code of codes) {
          flattened.push({
            id: String(code.id ?? ""),
            districtId: String(code.districtId ?? dist.id ?? ""),
            districtName: typeof dist.name === "string" ? dist.name : code.districtName ?? null,
            code: String(code.code ?? ""),
            year: String(code.year ?? ""),
            description: code.description ?? null,
            category: code.category ?? null,
            isActive: Boolean(code.isActive ?? true),
          });
        }
      }
      // Sort by district -> category -> code for stable UI
      flattened.sort((a, b) => {
        const byDistrict = (a.districtName || "").localeCompare(b.districtName || "");
        if (byDistrict !== 0) return byDistrict;
        const byCategory = (a.category || "").localeCompare(b.category || "");
        if (byCategory !== 0) return byCategory;
        return a.code.localeCompare(b.code);
      });
      setRows(flattened);
    } catch (err: any) {
      setError(err?.message || "Failed to load water codes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onEdit = useCallback(
    (row: WaterCodeRow) => {
      setEditingId(row.id);
      setForm({
        districtName: row.districtName || "",
        code: row.code,
        year: row.year,
        description: row.description || "",
        category: row.category || "",
        isActive: row.isActive,
      });
    },
    []
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const payload = {
      districtName: form.districtName.trim(),
      code: form.code.trim(),
      year: form.year.trim(),
      description: form.description.trim(),
      category: form.category.trim(),
      isActive: form.isActive,
    };

    if (!payload.districtName || !payload.code || !payload.year) {
      setError("District, code, and year are required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(editingId ? `/api/water-codes/${editingId}` : "/api/water-codes", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
      resetForm();
    } catch (err: any) {
      setError(err?.message || "Failed to save water code");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this water code?")) return;
    try {
      const res = await fetch(`/api/water-codes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to delete water code");
    }
  }

  async function handleToggleActive(row: WaterCodeRow) {
    try {
      const res = await fetch(`/api/water-codes/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          districtName: row.districtName || "",
          code: row.code,
          year: row.year,
          description: row.description || "",
          category: row.category || "",
          isActive: !row.isActive,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to update status");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Water Codes</h1>
          <p className="text-sm text-slate-500">
            Manage district-specific water codes. Codes marked inactive will not appear to sellers automatically.
          </p>
        </div>
        <button
          type="button"
          className="h-9 rounded-lg border border-slate-200 px-3 text-sm shadow-sm hover:bg-slate-50"
          onClick={() => {
            resetForm();
            setFilterDistrict("ALL");
          }}
        >
          New code
        </button>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-medium">
          {editingId ? "Edit water code" : "Add a new water code"}
        </h2>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">District name</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={form.districtName}
              onChange={(e) => setForm((prev) => ({ ...prev, districtName: e.target.value }))}
              placeholder="e.g. Westlands Water District"
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Water code</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={form.code}
              onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
              placeholder="e.g. WC1802"
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Water year</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={form.year}
              onChange={(e) => setForm((prev) => ({ ...prev, year: e.target.value }))}
              placeholder="e.g. 2024-25"
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Category</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              placeholder="e.g. Groundwater"
            />
          </label>
        </div>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Description</span>
          <textarea
            className="w-full min-h-[72px] rounded-lg border border-slate-200 px-3 py-2"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="e.g. SGMA Groundwater Allocation"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
          />
          <span className="text-slate-700">Active</span>
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving…" : editingId ? "Save changes" : "Add code"}
          </button>
          {editingId ? (
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
              onClick={resetForm}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-medium">Existing codes</h2>
            <p className="text-sm text-slate-500">{rows.length} codes configured</p>
          </div>
          <select
            className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm sm:w-56"
            value={filterDistrict}
            onChange={(e) => setFilterDistrict(e.target.value)}
          >
            <option value="ALL">All districts</option>
            {districts.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <div className="px-4 py-6 text-sm text-slate-500">Loading…</div>
        ) : filteredRows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">No water codes found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2">District</th>
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Year</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{row.districtName || "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs">{row.code}</td>
                    <td className="px-4 py-2">{row.year}</td>
                    <td className="px-4 py-2">{row.category || "—"}</td>
                    <td className="px-4 py-2">{row.description || "—"}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          row.isActive
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {row.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                          onClick={() => onEdit(row)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                          onClick={() => handleToggleActive(row)}
                        >
                          {row.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                          onClick={() => handleDelete(row.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
