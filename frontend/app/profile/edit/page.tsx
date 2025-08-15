// app/profile/edit/page.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

const DISTRICTS = [
  "",
  "Westlands Water District",
  "San Luis Water District",
  "Panoche Water District",
  "Arvin Edison Water District",
] as const;

const WATER_TYPES = ["CVP Allocation", "Pumping Credits", "Supplemental Water"] as const;

export default function EditProfilePage() {
  const router = useRouter();
  const { user, isLoaded: userLoaded } = useUser();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [portalLoading, setPortalLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    fullName: "",
    company: "",
    role: "",
    phone: "",
    primaryDistrict: "",
    waterTypes: [] as string[],
  });

  const isPremium = Boolean(user?.publicMetadata?.premium);

  // Load profile
  React.useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/profile", { cache: "no-store", credentials: "include" });
        if (res.status === 401) {
          router.push(`/sign-in?redirect_url=${encodeURIComponent("/profile/edit")}`);
          return;
        }
        if (!res.ok) throw new Error(await res.text());

        const { profile } = await res.json();
        if (live && profile) {
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
        if (live) setError(e?.message || "Failed to load profile");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [router]);

  // Save profile
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          company: form.company,
          role: form.role, // server maps to tradeRole
          phone: form.phone,
          primaryDistrict: form.primaryDistrict,
          waterTypes: form.waterTypes,
        }),
      });

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/profile/edit")}`);
        return;
      }
      if (!res.ok) {
        let msg = "Failed to save changes";
        try {
          const j = await res.json();
          msg = j?.error || msg;
        } catch {
          msg = await res.text();
        }
        throw new Error(msg);
      }

      router.push("/profile");
    } catch (e: any) {
      setError(e?.message || "Failed to save changes");
      setSaving(false);
    }
  }

  // Open Stripe Billing Portal
  async function openBillingPortal() {
    if (portalLoading) return;
    setPortalLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/billing/portal", { method: "POST" });
      if (!r.ok) {
        const text = await r.text().catch(() => "Failed to open billing portal");
        throw new Error(text);
      }
      const { url } = await r.json();
      if (!url) throw new Error("No billing portal URL returned");
      window.location.href = url;
    } catch (e: any) {
      setError(e?.message || "Failed to open billing portal");
      setPortalLoading(false);
    }
  }

  if (loading || !userLoaded) return <div className="mx-auto max-w-2xl p-6">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit Profile</h1>

      {/* Subscription card */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Premium Subscription</div>
            <div className="mt-1 text-xs text-slate-600">
              {isPremium ? "Your Premium plan is active." : "You are currently on the Free plan."}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openBillingPortal}
              disabled={portalLoading}
              className="h-9 rounded-xl bg-[#004434] px-4 text-sm font-medium text-white hover:bg-[#003a2f] disabled:opacity-50"
            >
              {portalLoading ? "Opening…" : "Manage Billing"}
            </button>
            {!isPremium && (
              <a
                href="/pricing/checkout"
                className="h-9 rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Upgrade to Premium
              </a>
            )}
          </div>
        </div>
      </section>

      <form onSubmit={onSubmit} className="mt-6 space-y-6" aria-live="polite">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="fullName">
              Full name *
            </label>
            <input
              id="fullName"
              required
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="company">
              Company
            </label>
            <input
              id="company"
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="role">
              Role *
            </label>
            <select
              id="role"
              required
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Select…</option>
              <option value="BUYER">Buyer</option>
              <option value="SELLER">Seller</option>
              <option value="BOTH">Both</option>
              <option value="DISTRICT_ADMIN">District Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="phone">
              Phone
            </label>
            <input
              id="phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              inputMode="tel"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="primaryDistrict">
              Primary District
            </label>
            <select
              id="primaryDistrict"
              value={form.primaryDistrict}
              onChange={(e) => setForm((f) => ({ ...f, primaryDistrict: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d ? d : "Select…"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-600">Water Types</label>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {WATER_TYPES.map((wt) => {
                const checked = form.waterTypes.includes(wt);
                return (
                  <label key={wt} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setForm((f) => ({
                          ...f,
                          waterTypes: e.target.checked
                            ? [...f.waterTypes, wt]
                            : f.waterTypes.filter((x) => x !== wt),
                        }));
                      }}
                    />
                    <span>{wt}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-[#004434] px-5 py-2 text-white hover:bg-[#003a2f] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <a
            href="/profile"
            className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
