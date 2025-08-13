"use client";

import { useEffect, useState } from "react";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
  clerkId: string | null;
  createdAt: string;
};

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setRows(json.users);
    } catch (e: any) {
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setRole(id: string, role: "USER" | "ADMIN") {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, role }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-medium">All Users</div>
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
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{u.email}</td>
                    <td className="px-4 py-2">{u.name ?? "—"}</td>
                    <td className="px-4 py-2">{u.role}</td>
                    <td className="px-4 py-2">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-right">
                      {u.role === "ADMIN" ? (
                        <button
                          onClick={() => setRole(u.id, "USER")}
                          className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                        >
                          Demote
                        </button>
                      ) : (
                        <button
                          onClick={() => setRole(u.id, "ADMIN")}
                          className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                        >
                          Make Admin
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No users found.
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
