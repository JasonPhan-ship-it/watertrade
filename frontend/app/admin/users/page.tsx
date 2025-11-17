"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
  clerkId: string | null;
  createdAt: string;

  // Optional fields the API may provide:
  approved?: boolean | null;
  needsApproval?: boolean | null;
  onboardingComplete?: boolean | null;
  verifiedAt?: string | null;
};

type TabKey = "pending" | "all";

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setRows(json.users ?? []);
      // If there are any that need approval, land on that tab by default
      const anyPending = (json.users ?? []).some(needsApproval);
      setTab(anyPending ? "pending" : "all");
    } catch (e: any) {
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setRole(id: string, role: "USER" | "ADMIN") {
    setBusyId(id);
    try {
      await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, role }),
      });
    } finally {
      setBusyId(null);
      load();
    }
  }

  async function approveUser(id: string) {
    setBusyId(id);
    try {
      await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, approved: true }),
      });
    } finally {
      setBusyId(null);
      load();
    }
  }

  // Helper: decide if a user belongs in "Needs Approval"
  function needsApproval(u: UserRow): boolean {
    // API explicit flags take precedence
    if (typeof u.needsApproval === "boolean") return u.needsApproval;
    if (typeof u.approved === "boolean") return !u.approved;

    // If API models onboarding, prefer that
    if (u.onboardingComplete === true && !u.verifiedAt) return true;

    // Fallback heuristic: non-admins created recently without clerkId look unverified
    // (you can tweak/remove this once backend returns approved/needsApproval)
    if (u.role !== "ADMIN" && !u.clerkId) return true;

    return false;
  }

  const filtered = useMemo(() => {
    return tab === "pending" ? rows.filter(needsApproval) : rows;
  }, [rows, tab]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab("pending")}
          className={[
            "rounded-xl px-3 py-1.5 text-sm border",
            tab === "pending"
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
          ].join(" ")}
        >
          Needs Approval
          {rows.length > 0 && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {rows.filter(needsApproval).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("all")}
          className={[
            "rounded-xl px-3 py-1.5 text-sm border",
            tab === "all"
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
          ].join(" ")}
        >
          All Users
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
            {rows.length}
          </span>
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-medium">
          {tab === "pending" ? "Users Awaiting Approval" : "All Users"}
        </div>

        {err ? (
          <div className="px-4 py-6 text-red-600 text-sm">{err}</div>
        ) : loading ? (
          <div className="px-4 py-6 text-slate-500 text-sm">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Approved</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const pending = needsApproval(u);
                  return (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="px-4 py-2">{u.email}</td>
                      <td className="px-4 py-2">{u.name ?? "—"}</td>
                      <td className="px-4 py-2">{u.role}</td>
                      <td className="px-4 py-2">
                        {typeof u.approved === "boolean" ? (
                          u.approved ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 ring-1 ring-emerald-200">
                              Approved
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-amber-200">
                              Pending
                            </span>
                          )
                        ) : pending ? (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-amber-200">
                            Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-2 text-right space-x-2">
                        {pending && (
                          <button
                            onClick={() => approveUser(u.id)}
                            disabled={busyId === u.id}
                            className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:opacity-95 disabled:opacity-60"
                          >
                            {busyId === u.id ? "Approving…" : "Approve"}
                          </button>
                        )}
                        {u.role === "ADMIN" ? (
                          <button
                            onClick={() => setRole(u.id, "USER")}
                            disabled={busyId === u.id}
                            className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
                          >
                            {busyId === u.id ? "…" : "Demote"}
                          </button>
                        ) : (
                          <button
                            onClick={() => setRole(u.id, "ADMIN")}
                            disabled={busyId === u.id}
                            className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
                          >
                            {busyId === u.id ? "…" : "Make Admin"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      {tab === "pending" ? "No users need approval." : "No users found."}
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
