// app/profile/page.tsx
"use client";

import * as React from "react";
import Link from "next/link";

/** Preset districts (for display ordering only) */
const PRESET_DISTRICTS = [
  "Westlands Water District",
  "San Luis Water District",
  "Panoche Water District",
  "Arvin Edison Water District",
] as const;

type ApiFarm = {
  name?: string | null;
  accountNumber?: string | null;
  district?: string | null;
};

type ApiProfile = {
  // "edit" page shape
  fullName?: string | null;
  company?: string | null;
  tradeRole?: string | null; // BUYER/SELLER/BOTH/DISTRICT_ADMIN
  primaryDistrict?: string | null;
  waterTypes?: string[] | null;

  // "this page" legacy shape
  firstName?: string | null;
  lastName?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  cellPhone?: string | null;
  smsOptIn?: boolean | null;

  // shared
  districts?: string[] | null;
};

function displayName(p: ApiProfile | null): string {
  if (!p) return "";
  if (p.fullName) return p.fullName;
  const f = (p.firstName ?? "").trim();
  const l = (p.lastName ?? "").trim();
  return [f, l].filter(Boolean).join(" ");
}

function nonEmpty<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined && `${v}`.trim() !== "";
}

function uniqStrings(arr: (string | null | undefined)[]) {
  const out = new Set<string>();
  for (const v of arr) {
    const s = (v ?? "").trim();
    if (s) out.add(s);
  }
  return Array.from(out);
}

export default function ProfilePage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [profile, setProfile] = React.useState<ApiProfile | null>(null);
  const [farms, setFarms] = React.useState<ApiFarm[]>([]);

  React.useEffect(() => {
    let live = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/profile", { credentials: "include", cache: "no-store" });
        if (res.status === 401) {
          // Let middleware/sign-in handle auth redirect if you use it elsewhere
          setError("You must be signed in to view your profile.");
          return;
        }
        if (!res.ok) throw new Error(await res.text());

        const { profile: pf, farms: apiFarms } = await res.json();
        if (!live) return;

        setProfile(pf ?? null);
        setFarms(Array.isArray(apiFarms) ? apiFarms : []);
      } catch (e: any) {
        if (live) setError(e?.message || "Failed to load profile");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (loading) return <div className="mx-auto max-w-3xl p-6">Loading…</div>;

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
        <p className="mt-3 text-sm text-red-600">{error}</p>
        <div className="mt-6">
          <Link
            href="/profile/edit"
            className="inline-flex items-center rounded-xl bg-[#004434] px-4 py-2 text-sm font-medium text-white hover:bg-[#003a2f]"
          >
            Edit profile
          </Link>
        </div>
      </div>
    );
  }

  const name = displayName(profile);
  const email =
    (profile?.email ?? "").trim() ||
    ""; // may be missing if API uses only "phone/company" shape

  const phone = (profile?.phone ?? "").trim();
  const cell = (profile?.cellPhone ?? "").trim();
  const address = (profile?.address ?? "").trim();
  const role = (profile?.tradeRole ?? "").trim();
  const company = (profile?.company ?? "").trim();
  const primaryDistrict = (profile?.primaryDistrict ?? "").trim();

  // Districts: merge list + primary so we don't "lose" it if API only sets one or the other.
  const districts = uniqStrings([
    ...(Array.isArray(profile?.districts) ? profile!.districts! : []),
    primaryDistrict || null,
  ]).filter(Boolean);

  // Sort districts: presets first (keep preset order), then customs alphabetically.
  const preset = districts.filter((d) => PRESET_DISTRICTS.includes(d as any));
  const custom = districts.filter((d) => !PRESET_DISTRICTS.includes(d as any)).sort((a, b) => a.localeCompare(b));
  const orderedDistricts = [...preset, ...custom];

  const waterTypes = Array.isArray(profile?.waterTypes) ? profile!.waterTypes! : [];

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
          <p className="mt-1 text-slate-600">View your details. Make changes on the edit page.</p>
        </div>
        <Link
          href="/profile/edit"
          className="shrink-0 rounded-xl bg-[#004434] px-4 py-2 text-sm font-medium text-white hover:bg-[#003a2f]"
        >
          Edit profile
        </Link>
      </div>

      {/* Identity */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Identity</div>
        <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Name</dt>
            <dd className="mt-1 text-sm text-slate-900">{name || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Company</dt>
            <dd className="mt-1 text-sm text-slate-900">{company || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Role</dt>
            <dd className="mt-1 text-sm text-slate-900">{role || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Address</dt>
            <dd className="mt-1 text-sm text-slate-900">{address || "—"}</dd>
          </div>
        </dl>
      </section>

      {/* Contact */}
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Contact</div>
        <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Email</dt>
            <dd className="mt-1 text-sm text-slate-900">{email || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Phone</dt>
            <dd className="mt-1 text-sm text-slate-900">{phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Cell</dt>
            <dd className="mt-1 text-sm text-slate-900">{cell || "—"}</dd>
          </div>
          {typeof profile?.smsOptIn === "boolean" && (
            <div>
              <dt className="text-xs text-slate-500">SMS Opt-In</dt>
              <dd className="mt-1 text-sm text-slate-900">{profile?.smsOptIn ? "Yes" : "No"}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* Water */}
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Water Preferences</div>
        <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Primary District</dt>
            <dd className="mt-1 text-sm text-slate-900">{primaryDistrict || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">All Districts</dt>
            <dd className="mt-1 text-sm text-slate-900">
              {orderedDistricts.length ? orderedDistricts.join(", ") : "—"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-500">Water Types</dt>
            <dd className="mt-1 text-sm text-slate-900">
              {waterTypes.length ? waterTypes.join(", ") : "—"}
            </dd>
          </div>
        </dl>
      </section>

      {/* Farms */}
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Farms</div>
        {farms.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No farms on file.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {farms.map((f, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-4">
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-slate-500">Name</dt>
                    <dd className="mt-1 text-sm text-slate-900">{nonEmpty(f.name) ? f.name : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Water Account #</dt>
                    <dd className="mt-1 text-sm text-slate-900">
                      {nonEmpty(f.accountNumber) ? f.accountNumber : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">District</dt>
                    <dd className="mt-1 text-sm text-slate-900">{nonEmpty(f.district) ? f.district : "—"}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-6">
        <Link
          href="/profile/edit"
          className="inline-flex items-center rounded-xl bg-[#004434] px-4 py-2 text-sm font-medium text-white hover:bg-[#003a2f]"
        >
          Edit profile
        </Link>
      </div>
    </div>
  );
}
