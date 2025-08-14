"use client";

import * as React from "react";

export default function ProfilePage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [profile, setProfile] = React.useState<any>(null);

  React.useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/profile", { cache: "no-store", credentials: "include" });
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        if (live) setProfile(json?.profile ?? null);
      } catch (e: any) {
        if (live) setError(e?.message || "Failed to load profile");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  if (loading) return <div className="mx-auto max-w-2xl p-6">Loading…</div>;
  if (error) return <div className="mx-auto max-w-2xl p-6 text-red-600">{error}</div>;

  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Your Profile</h1>
        <p className="mt-2 text-slate-600">No profile yet.</p>
        <a href="/onboarding" className="inline-flex mt-4 rounded-xl bg-[#004434] px-4 py-2 text-white hover:bg-[#003a2f]">
          Complete onboarding
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your Profile</h1>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div><dt className="text-slate-500 text-xs">Full name</dt><dd className="font-medium">{profile.fullName}</dd></div>
          <div><dt className="text-slate-500 text-xs">Company</dt><dd className="font-medium">{profile.company || "—"}</dd></div>
          <div><dt className="text-slate-500 text-xs">Role</dt><dd className="font-medium">{profile.tradeRole}</dd></div>
          <div><dt className="text-slate-500 text-xs">Phone</dt><dd className="font-medium">{profile.phone || "—"}</dd></div>
          <div><dt className="text-slate-500 text-xs">Primary District</dt><dd className="font-medium">{profile.primaryDistrict || "—"}</dd></div>
          <div><dt className="text-slate-500 text-xs">Water Types</dt><dd className="font-medium">{(profile.waterTypes || []).join(", ") || "—"}</dd></div>
        </dl>

        <a href="/onboarding" className="inline-flex mt-5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Edit profile
        </a>
      </div>
    </div>
  );
}
