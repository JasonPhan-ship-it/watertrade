// app/profile/page.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/** Preset districts (keep in sync with onboarding) */
const PRESET_DISTRICTS = [
  "Westlands Water District",
  "San Luis Water District",
  "Panoche Water District",
  "Arvin Edison Water District",
] as const;

type FarmRow = {
  name: string;
  accountNumber: string;
  district: string;       // value or "__OTHER__"
  otherDistrict?: string; // if district === "__OTHER__"
};

function uniqStrings(arr: (string | null | undefined)[]) {
  const out = new Set<string>();
  for (const v of arr) {
    const s = (v ?? "").trim();
    if (s) out.add(s);
  }
  return Array.from(out);
}

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  // Core fields
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [cellPhone, setCellPhone] = React.useState("");
  const [smsOptIn, setSmsOptIn] = React.useState(false);

  // District state
  const [presetSelected, setPresetSelected] = React.useState<Set<string>>(new Set());
  const [customDistricts, setCustomDistricts] = React.useState<string[]>([]);
  const [customDistrictInput, setCustomDistrictInput] = React.useState("");

  // Farms
  const [farms, setFarms] = React.useState<FarmRow[]>([
    { name: "", accountNumber: "", district: "", otherDistrict: "" },
  ]);

  React.useEffect(() => {
    let live = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/profile", { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const { profile, farms: apiFarms } = await res.json();

        if (!live) return;

        if (profile) {
          setFirstName(profile.firstName || "");
          setLastName(profile.lastName || "");
          setAddress(profile.address || "");
          setEmail(profile.email || "");
          setPhone(profile.phone || "");
          setCellPhone(profile.cellPhone || "");
          setSmsOptIn(Boolean(profile.smsOptIn));

          // Split profile.districts into preset vs custom
          const districts: string[] = Array.isArray(profile.districts) ? profile.districts : [];
          const preset = new Set<string>();
          const custom: string[] = [];
          for (const d of districts) {
            if (PRESET_DISTRICTS.includes(d as any)) preset.add(d);
            else if (d && !custom.includes(d)) custom.push(d);
          }
          setPresetSelected(preset);
          setCustomDistricts(custom);
        }

        // Farms
        if (Array.isArray(apiFarms) && apiFarms.length > 0) {
          const rows: FarmRow[] = apiFarms.map((f: any) => {
            const d: string = (f?.district || "").trim();
            const isPreset = PRESET_DISTRICTS.includes(d as any);
            const isCustomIncluded = customDistricts.includes(d);
            if (!d) {
              return { name: f?.name || "", accountNumber: f?.accountNumber || "", district: "", otherDistrict: "" };
            }
            if (isPreset || isCustomIncluded) {
              return { name: f?.name || "", accountNumber: f?.accountNumber || "", district: d };
            }
            return { name: f?.name || "", accountNumber: f?.accountNumber || "", district: "__OTHER__", otherDistrict: d };
          });
          setFarms(rows.length ? rows : [{ name: "", accountNumber: "", district: "", otherDistrict: "" }]);
        } else {
          setFarms([{ name: "", accountNumber: "", district: "", otherDistrict: "" }]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle a preset district
  const togglePreset = (d: string) => {
    setPresetSelected((prev) => {
      const n = new Set(prev);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });
  };

  // Custom districts
  const addCustomDistrict = () => {
    const v = customDistrictInput.trim();
    if (!v) return;
    setCustomDistricts((a) => (a.includes(v) ? a : [...a, v]));
    setCustomDistrictInput("");
  };
  const removeCustomDistrict = (idx: number) => {
    setCustomDistricts((a) => a.filter((_, i) => i !== idx));
  };

  // Farms
  const updateFarm = (i: number, patch: Partial<FarmRow>) => {
    setFarms((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const addFarm = () =>
    setFarms((rows) => [...rows, { name: "", accountNumber: "", district: "", otherDistrict: "" }]);
  const removeFarm = (i: number) => setFarms((rows) => rows.filter((_, idx) => idx !== i));

  // Build suggested farm district options (presets + customs + empty)
  const suggestedFarmDistricts = React.useMemo(() => {
    return uniqStrings(["", ...PRESET_DISTRICTS, ...customDistricts]);
  }, [customDistricts]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setSuccess(null);
    setError(null);

    // Gather districts: presets + customs
    const selectedDistricts = Array.from(presetSelected);
    for (const d of customDistricts) if (!selectedDistricts.includes(d)) selectedDistricts.push(d);

    // Normalize farms
    const farmsPayload = farms
      .map((f) => ({
        name: (f.name || "").trim(),
        accountNumber: (f.accountNumber || "").trim(),
        district: f.district === "__OTHER__" ? (f.otherDistrict || "").trim() : (f.district || "").trim(),
      }))
      .filter((f) => f.name || f.accountNumber || f.district);

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          address,
          email,
          phone,
          cellPhone,
          smsOptIn,
          districts: selectedDistricts,
          farms: farmsPayload,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSuccess("Profile saved.");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-2xl p-6">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
      <p className="mt-1 text-slate-600">Update your contact info, districts, and farms.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        {/* Name */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="firstName">First Name *</label>
            <input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="lastName">Last Name *</label>
            <input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="phone">Phone</label>
            <input
              id="phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="cellPhone">Cell Phone</label>
            <input
              id="cellPhone"
              inputMode="tel"
              value={cellPhone}
              onChange={(e) => setCellPhone(e.target.value)}
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

        {/* Water Districts */}
        <div>
          <div className="text-sm font-medium text-slate-700">Water Districts (select all that apply)</div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PRESET_DISTRICTS.map((d) => (
              <label key={d} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={presetSelected.has(d)}
                  onChange={() => togglePreset(d)}
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

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-700">{success}</p>}

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
