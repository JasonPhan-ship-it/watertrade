// app/profile/edit/page.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

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
  // legacy + new
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;

  // identity
  company?: string | null;
  tradeRole?: string | null; // BUYER | SELLER | BOTH | DISTRICT_ADMIN

  // address/contact
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  cellPhone?: string | null;
  smsOptIn?: boolean | null;

  // water prefs
  primaryDistrict?: string | null;
  districts?: string[] | null;
  waterTypes?: string[] | null;
};

type FarmRow = {
  name: string;
  accountNumber: string;
  district: string;
  otherDistrict?: string;
};

function splitFullName(fullName?: string | null) {
  const s = (fullName ?? "").trim();
  if (!s) return { first: "", last: "" };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

const ROLE_OPTIONS = ["BUYER", "SELLER", "BOTH", "DISTRICT_ADMIN"] as const;

export default function EditProfilePage() {
  const router = useRouter();
  const { user, isLoaded: userLoaded } = useUser();
  const isPremium = Boolean(user?.publicMetadata?.premium);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [portalLoading, setPortalLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Identity
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [tradeRole, setTradeRole] = React.useState<typeof ROLE_OPTIONS[number] | "">("");

  // Contact
  const [address, setAddress] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [cellPhone, setCellPhone] = React.useState("");
  const [smsOptIn, setSmsOptIn] = React.useState(false);

  // Water prefs
  const [primaryDistrict, setPrimaryDistrict] = React.useState("");
  const [primaryDistrictOther, setPrimaryDistrictOther] = React.useState("");
  const [presetSelected, setPresetSelected] = React.useState<Set<string>>(new Set());
  const [customDistricts, setCustomDistricts] = React.useState<string[]>([]);
  const [customDistrictInput, setCustomDistrictInput] = React.useState("");

  // Water types as tags
  const [waterTypes, setWaterTypes] = React.useState<string[]>([]);
  const [waterTypeInput, setWaterTypeInput] = React.useState("");

  // Farms
  const [farms, setFarms] = React.useState<FarmRow[]>([
    { name: "", accountNumber: "", district: "", otherDistrict: "" },
  ]);

  // ----- Load profile -----
  React.useEffect(() => {
    let live = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/profile", { cache: "no-store", credentials: "include" });
        if (res.status === 401) {
          router.push(`/sign-in?redirect_url=${encodeURIComponent("/profile/edit")}`);
          return;
        }
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Unexpected response (${res.status})`);
        }
        const { profile, farms: apiFarms } = (await res.json()) as {
          profile: ApiProfile | null;
          farms: ApiFarm[];
        };

        if (!live) return;

        const p = profile ?? {};

        // Names
        const nameParts = {
          first: (p.firstName ?? "").trim(),
          last: (p.lastName ?? "").trim(),
        };
        if (!nameParts.first && !nameParts.last && p.fullName) {
          const s = splitFullName(p.fullName);
          nameParts.first = s.first;
          nameParts.last = s.last;
        }
        setFirstName(nameParts.first || "");
        setLastName(nameParts.last || "");

        // Identity
        setCompany((p.company ?? "").trim());
        setTradeRole(
          ROLE_OPTIONS.includes((p.tradeRole ?? "").trim() as any)
            ? ((p.tradeRole ?? "").trim() as typeof ROLE_OPTIONS[number])
            : ""
        );

        // Contact
        setAddress((p.address ?? "").trim());
        setEmail((p.email ?? user?.primaryEmailAddress?.emailAddress ?? "").trim());
        setPhone((p.phone ?? "").trim());
        setCellPhone((p.cellPhone ?? "").trim());
        setSmsOptIn(Boolean(p.smsOptIn));

        // Primary district
        const pd = (p.primaryDistrict ?? "").trim();
        if (pd && PRESET_DISTRICTS.includes(pd as any)) {
          setPrimaryDistrict(pd);
          setPrimaryDistrictOther("");
        } else if (pd) {
          setPrimaryDistrict("__OTHER__");
          setPrimaryDistrictOther(pd);
        } else {
          setPrimaryDistrict("");
          setPrimaryDistrictOther("");
        }

        // Districts: partition into preset vs custom
        const districts = Array.isArray(p.districts) ? p.districts.filter(Boolean) : [];
        const preset = new Set<string>();
        const custom: string[] = [];
        for (const d of districts) {
          if (PRESET_DISTRICTS.includes(d as any)) preset.add(d);
          else custom.push(d);
        }
        setPresetSelected(preset);
        setCustomDistricts(Array.from(new Set(custom)));

        // Water types
        setWaterTypes(Array.isArray(p.waterTypes) ? p.waterTypes.filter(Boolean).map(s => String(s)) : []);

        // Farms
        const mapped = Array.isArray(apiFarms)
          ? apiFarms.map((f) => ({
              name: (f?.name ?? "").trim(),
              accountNumber: (f?.accountNumber ?? "").trim(),
              district: (f?.district ?? "").trim(),
              otherDistrict: "",
            }))
          : [];
        setFarms(mapped.length ? mapped : [{ name: "", accountNumber: "", district: "", otherDistrict: "" }]);
      } catch (e: any) {
        if (live) setError(e?.message || "Failed to load profile");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [router, user?.primaryEmailAddress?.emailAddress]);

  // ----- District helpers -----
  const togglePreset = (d: string) => {
    setPresetSelected((prev) => {
      const n = new Set(prev);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });
  };

  const addCustomDistrict = () => {
    const v = customDistrictInput.trim();
    if (!v) return;
    setCustomDistricts((a) => (a.includes(v) ? a : [...a, v]));
    setCustomDistrictInput("");
  };

  const removeCustomDistrict = (idx: number) => {
    setCustomDistricts((a) => a.filter((_, i) => i !== idx));
  };

  // ----- Water type helpers -----
  const addWaterType = () => {
    const v = waterTypeInput.trim();
    if (!v) return;
    setWaterTypes((arr) => (arr.includes(v) ? arr : [...arr, v]));
    setWaterTypeInput("");
  };
  const removeWaterType = (idx: number) => {
    setWaterTypes((arr) => arr.filter((_, i) => i !== idx));
  };

  // ----- Farm helpers -----
  const updateFarm = (i: number, patch: Partial<FarmRow>) => {
    setFarms((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const addFarm = () =>
    setFarms((rows) => [...rows, { name: "", accountNumber: "", district: "", otherDistrict: "" }]);
  const removeFarm = (i: number) => setFarms((rows) => rows.filter((_, idx) => idx !== i));

  // ----- Save profile (PATCH /api/profile) -----
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    // Validate required like onboarding
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setSaving(false);
      setError("First name, last name, and email are required.");
      return;
    }

    // Build selected districts
    const selectedDistricts = Array.from(presetSelected);
    for (const d of customDistricts) if (!selectedDistricts.includes(d)) selectedDistricts.push(d);

    // Primary district normalized
    const primaryDistrictValue =
      primaryDistrict === "__OTHER__" ? primaryDistrictOther.trim() : primaryDistrict.trim();

    // Farms payload
    const farmsPayload = farms
      .map((f) => ({
        name: (f.name || "").trim(),
        accountNumber: (f.accountNumber || "").trim(),
        district: f.district === "__OTHER__" ? (f.otherDistrict || "").trim() : (f.district || "").trim(),
      }))
      .filter((f) => f.name || f.accountNumber || f.district);

    const fullName = `${firstName} ${lastName}`.trim();

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          company: company.trim() || undefined,
          tradeRole: tradeRole || undefined,
          email: email.trim(),
          phone: phone.trim() || undefined,
          cellPhone: cellPhone.trim() || undefined,
          address: address.trim() || undefined,
          smsOptIn,
          primaryDistrict: primaryDistrictValue || undefined,
          districts: selectedDistricts,
          waterTypes: waterTypes, // array of strings
          farms: farmsPayload, // server PATCH supports replacing farms when provided
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

  // ----- Stripe Customer Portal -----
  async function openBillingPortal() {
    if (portalLoading) return;
    setPortalLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/billing/portal", { method: "POST" });
      if (r.redirected) {
        window.location.href = r.url;
        return;
      }
      if (!r.ok) {
        const text = await r.text().catch(() => "Failed to open billing portal");
        throw new Error(text);
      }
      const { url } = await r.json().catch(() => ({ url: "" }));
      if (!url) throw new Error("No billing portal URL returned");
      window.location.href = url;
    } catch (e: any) {
      setError(e?.message || "Failed to open billing portal");
      setPortalLoading(false);
    }
  }

  if (loading || !userLoaded) return <div className="mx-auto max-w-2xl p-6">Loading…</div>;

  // For farm & primary district dropdown suggestions (preset + custom)
  const suggestedFarmDistricts = Array.from(new Set(["", ...PRESET_DISTRICTS, ...customDistricts]));
  const suggestedPrimaryOptions = ["", ...PRESET_DISTRICTS, "__OTHER__"] as const;

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
              className="flex h-9 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {portalLoading ? "Opening…" : "Manage Billing"}
            </button>
            {!isPremium && (
              <a
                href="/pricing/checkout"
                className="flex h-9 items-center justify-center rounded-xl bg-[#004434] px-4 text-sm font-medium text-white hover:bg-[#003a2f]"
              >
                Upgrade to Premium
              </a>
            )}
          </div>
        </div>
      </section>

      <form onSubmit={onSubmit} className="mt-6 space-y-6" aria-live="polite">
        {/* Name */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="firstName">First Name *</label>
            <input
              id="firstName"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="lastName">Last Name *</label>
            <input
              id="lastName"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        </div>

        {/* Company + Role */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="company">Company</label>
            <input
              id="company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="tradeRole">Role</label>
            <select
              id="tradeRole"
              value={tradeRole}
              onChange={(e) => setTradeRole(e.target.value as typeof ROLE_OPTIONS[number] | "")}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Select…</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Address */}
        <div>
          <label className="block text-sm text-slate-600" htmlFor="address">Address</label>
          <input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, City, State ZIP"
            autoComplete="street-address"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </div>

        {/* Contact */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="email">Email *</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="phone">Phone</label>
            <input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="cellPhone">Cell Phone</label>
            <input
              id="cellPhone"
              value={cellPhone}
              onChange={(e) => setCellPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel-national"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                id="smsOptIn"
                type="checkbox"
                checked={smsOptIn}
                onChange={(e) => setSmsOptIn(e.target.checked)}
              />
              <span>SMS Opt-In</span>
            </label>
          </div>
        </div>

        {/* Primary District */}
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="primaryDistrict">Primary District</label>
          <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select
              id="primaryDistrict"
              value={primaryDistrict}
              onChange={(e) => setPrimaryDistrict(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {suggestedPrimaryOptions.map((d, idx) => (
                <option key={`${d}-${idx}`} value={d}>{d || "Select…"}</option>
              ))}
            </select>
            {primaryDistrict === "__OTHER__" && (
              <input
                placeholder="Other district"
                value={primaryDistrictOther}
                onChange={(e) => setPrimaryDistrictOther(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            )}
          </div>
        </div>

        {/* Water Districts (preset + custom) */}
        <div>
          <div className="text-sm font-medium text-slate-700">All Districts (select all that apply)</div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PRESET_DISTRICTS.map((d) => (
              <label key={d} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={presetSelected.has(d as string)}
                  onChange={() => togglePreset(d as string)}
                />
                <span>{d}</span>
              </label>
            ))}
          </div>

          <div className="mt-3">
            <div className="text-sm text-slate-600">Add other districts</div>
            <div className="mt-1 flex gap-2">
              <input
                value={customDistrictInput}
                onChange={(e) => setCustomDistrictInput(e.target.value)}
                placeholder="Type a district and click Add"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={addCustomDistrict}
                className="rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50"
              >
                Add
              </button>
            </div>
            {customDistricts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {customDistricts.map((d, i) => (
                  <span
                    key={`${d}-${i}`}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs"
                  >
                    {d}
                    <button
                      type="button"
                      onClick={() => removeCustomDistrict(i)}
                      aria-label={`Remove ${d}`}
                      className="-mr-1 rounded-full px-1 hover:bg-slate-200"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Water Types (tags) */}
        <div>
          <label className="block text-sm font-medium text-slate-700">Water Types</label>
          <div className="mt-1 flex gap-2">
            <input
              value={waterTypeInput}
              onChange={(e) => setWaterTypeInput(e.target.value)}
              placeholder="e.g., Surface, Groundwater, Carryover…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={addWaterType}
              className="rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50"
            >
              Add
            </button>
          </div>
          {waterTypes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {waterTypes.map((wt, i) => (
                <span
                  key={`${wt}-${i}`}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs"
                >
                  {wt}
                  <button
                    type="button"
                    onClick={() => removeWaterType(i)}
                    aria-label={`Remove ${wt}`}
                    className="-mr-1 rounded-full px-1 hover:bg-slate-200"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Farms */}
        <div>
          <div className="text-sm font-medium text-slate-700">Farms</div>
          <p className="mt-1 text-xs text-slate-500">
            Add each farm you own with its water account number and the district it sits in.
          </p>

          <div className="mt-3 space-y-4">
            {farms.map((f, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs text-slate-600" htmlFor={`farm-name-${i}`}>
                      Farm Name
                    </label>
                    <input
                      id={`farm-name-${i}`}
                      value={f.name}
                      onChange={(e) => updateFarm(i, { name: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600" htmlFor={`farm-acct-${i}`}>
                      Water Account #
                    </label>
                    <input
                      id={`farm-acct-${i}`}
                      value={f.accountNumber}
                      onChange={(e) => updateFarm(i, { accountNumber: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600" htmlFor={`farm-district-${i}`}>
                      District
                    </label>
                    <select
                      id={`farm-district-${i}`}
                      value={f.district}
                      onChange={(e) => updateFarm(i, { district: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {suggestedFarmDistricts.map((d, idx) => (
                        <option key={`${d}-${idx}`} value={d}>
                          {d || "Select…"}
                        </option>
                      ))}
                      <option value="__OTHER__">Other (type below)</option>
                    </select>
                    {f.district === "__OTHER__" && (
                      <input
                        placeholder="Other district"
                        value={f.otherDistrict || ""}
                        onChange={(e) => updateFarm(i, { otherDistrict: e.target.value })}
                        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    )}
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeFarm(i)}
                    className="text-xs text-slate-600 hover:text-slate-900"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={addFarm}
              className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              + Add another farm
            </button>
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
