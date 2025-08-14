// app/profile/page.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    fullName: "",
    company: "",
    role: "",
    phone: "",
    primaryDistrict: "",
    waterTypes: [] as string[],
  });

  React.useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/profile", { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const { profile } = await res.json();
        if (!live) return;
        if (profile) {
          setForm({
            fullName: profile.fullName || "",
            company: profile.company || "",
            role: profile.tradeRole || "",
            phone: profile.phone || "",
            primaryDistrict: profile.primaryDistrict || "",
            waterTypes: profile.waterTypes || [],
          });
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load profile");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          company: form.company,
          role: form.role,
          phone: form.phone,
          primaryDistrict: form.primaryDistrict,
          waterTypes: form.waterTypes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-2xl p-6">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm text-slate-600">Full name</label>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                 value={form.fullName}
                 onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}/>
        </div>
        <div>
          <label className="block text-sm text-slate-600">Company</label>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                 value={form.company}
                 onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}/>
        </div>
        <div>
          <label className="block text-sm text-slate-600">Role</label>
          <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            <option value="">Select…</option>
            <option value="BUYER">Buyer</option>
            <option value="SELLER">Seller</option>
            <option value="BOTH">Both</option>
            <option value="DISTRICT_ADMIN">District Admin</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-600">Phone</label>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                 value={form.phone}
                 onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}/>
        </div>
        <div>
          <label className="block text-sm text-slate-600">Primary District</label>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                 value={form.primaryDistrict}
                 onChange={(e) => setForm((f) => ({ ...f, primaryDistrict: e.target.value }))}/>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-[#004434] px-5 py-2 text-white hover:bg-[#003a2f] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
