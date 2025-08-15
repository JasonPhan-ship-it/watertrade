// app/onboarding/page.tsx
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, useUser } from "@clerk/nextjs";

// Preset districts (you can expand this list)
const PRESET_DISTRICTS = [
  "Westlands Water District",
  "San Luis Water District",
  "Panoche Water District",
  "Arvin Edison Water District",
] as const;

type FarmRow = {
  name: string;
  accountNumber: string;
  district: string; // value or "__OTHER__"
  otherDistrict?: string; // if district === "__OTHER__"
};

export default function OnboardingPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const nextPath = sp?.get("next") ?? "/dashboard"; // used only if user already onboarded

  const { session, isLoaded: sessionLoaded } = useSession();
  const { user, isLoaded: userLoaded } = useUser();

  const [submitting, setSubmitting] = React.useState(false);
  const [loadingProfile, setLoadingProfile] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // District selection state
  const [presetSelected, setPresetSelected] = React.useState<Set<string>>(new Set());
  const [customDistricts, setCustomDistricts] = React.useState<string[]>([]);
  const [customDistrictInput, setCustomDistrictInput] = React.useState("");

  // Farms
  const [farms, setFarms] = React.useState<FarmRow[]>([
    { name: "", accountNumber: "", district: "", otherDistrict: "" },
  ]);

  // helper: timeout wrapper so we don't hang forever
  function withTimeout<T>(p: Promise<T>, ms = 15000) {
    const t = setTimeout(() => {
      // just race-reject; the fetch below doesn't take an AbortSignal here
    }, ms);
    return Promise.race([
      p,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Request timed out")), ms)),
    ]).finally(() => clearTimeout(t));
  }

  // One-shot redirect
  const redirectedRef = React.useRef(false);
  const goNext = React.useCallback(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace(nextPath);
  }, [router, nextPath]);

  // If profile exists -> skip onboarding
  React.useEffect(() => {
    if (!sessionLoaded || !userLoaded) return;
    let live = true;
    (async () => {
      try {
        const res = await withTimeout(fetch("/api/profile", { cache: "no-store", credentials: "include" }), 10000);
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        if (!live) return;

        if (json?.profile) {
          if (user?.id) document.cookie = `onboarded=${user.id}; Path=/; Max-Age=1800; SameSite=Lax`;
          session?.reload?.().catch(() => {});
          goNext();
          return;
        }
      } catch {
        // no profile -> show form
      } finally {
        if (live) setLoadingProfile(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [sessionLoaded, userLoaded, session, user?.id, goNext]);

  // District helpers
  const togglePreset = (d: string) => {
    setPresetSelected((prev) => {
      const n = new Set(prev);
      if (n.has(d)) n.delete(d); else n.add(d);
      return n;
    });
  };

  const addCustomDistrict = () => {
    const v = customDistrictInput.trim();
    if (!v) return;
    if (!customDistricts.includes(v)) setCustomDistricts((a) => [...a, v]);
    setCustomDistrictInput("");
  };

  const removeCustomDistrict = (idx: number) => {
    setCustomDistricts((a) => a.filter((_, i) => i !== idx));
  };

  // Farm helpers
  const updateFarm = (i: number, patch: Partial<FarmRow>) => {
    setFarms((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const addFarm = () => setFarms((rows) => [...rows, { name: "", accountNumber: "", district: "", otherDistrict: "" }]);
  const removeFarm = (i: number) => setFarms((rows) => rows.filter((_, idx) => idx !== i));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const fd = new FormData(e.currentTarget);

    const firstName = String(fd.get("firstName") || "").trim();
    const lastName = String(fd.get("lastName") || "").trim();
    const address = String(fd.get("address") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const phone = String(fd.get("phone") || "").trim();
    const cellPhone = String(fd.get("cellPhone") || "").trim();
    const smsOptIn = fd.get("smsOptIn") === "on";

    // Selected districts = presets + customs
    const selectedDistricts = Array.from(presetSelected);
    for (const d of customDistricts) if (!selectedDistricts.includes(d)) selectedDistricts.push(d);

    // Normalize farms: keep only meaningful rows
    const farmsPayload = farms
      .map((f) => ({
        name: f.name?.trim() || "",
        accountNumber: f.accountNumber?.trim() || "",
        district: f.district === "__OTHER__" ? (f.otherDistrict || "").trim() : (f.district || "").trim(),
      }))
      .filter((f) => f.name || f.accountNumber || f.district);

    // Basic validation
    if (!firstName || !lastName || !email) {
      setSubmitting(false);
      setError("First name, last name, and email are required.");
      return;
    }

    const payload = {
      firstName,
      lastName,
      address,
      email,
      phone,
      cellPhone,
      smsOptIn,
      districts: selectedDistricts,
      farms: farmsPayload, // [{ name, accountNumber, district }]
    };

    try {
      const res = await withTimeout(
        fetch("/api/profile", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        15000
      );

      if (!res.ok) {
        let msg = "Failed to save profile";
        try {
          const j = await res.json();
          msg = j?.error || msg;
        } catch {
          msg = await res.text();
        }
        throw new Error(msg);
      }

      if (user?.id) document.cookie = `onboarded=${user.id}; Path=/; Max-Age=1800; SameSite=Lax`;
      session?.reload?.().catch(() => {});
      // After initial onboarding, go to Membership selection step
      router.push("/onboarding/membership");
    } catch (err: any) {
      setError(err?.message || "Failed to save profile");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingProfile) {
    return <div className="mx-auto max-w-2xl p-6">Loading…</div>;
  }

  // Build a suggested list for farm district selects
  const suggestedFarmDistricts = Array.from(new Set(["", ...PRESET_DISTRICTS, ...customDistricts]));

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Complete your profile</h1>
      <p className="mt-1 text-slate-600">Tell us a bit about you to personalize Water Traders.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        {/* Name */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="firstName">First Name *</label>
            <input id="firstName" name="firstName" required defaultValue={user?.firstName || ""} autoComplete="given-name" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="lastName">Last Name *</label>
            <input id="lastName" name="lastName" required defaultValue={user?.lastName || ""} autoComplete="family-name" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
        </div>

        {/* Address */}
        <div>
          <label className="block text-sm text-slate-600" htmlFor="address">Address</label>
          <input id="address" name="address" placeholder="Street, City, State ZIP" autoComplete="street-address" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        {/* Contact */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="email">Email *</label>
            <input id="email" name="email" type="email" required defaultValue={user?.primaryEmailAddress?.emailAddress || ""} autoComplete="email" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="phone">Phone</label>
            <input id="phone" name="phone" inputMode="tel" autoComplete="tel" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="cellPhone">Cell Phone</label>
            <input id="cellPhone" name="cellPhone" inputMode="tel" autoComplete="tel-national" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm">
              <input id="smsOptIn" name="smsOptIn" type="checkbox" />
              <span>SMS Opt-In</span>
            </label>
          </div>
        </div>

        {/* Water Districts (multi with customs) */}
        <div>
          <div className="text-sm font-medium text-slate-700">Water Districts (select all that apply)</div>
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
              <button type="button" onClick={addCustomDistrict} className="rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50">
                Add
              </button>
            </div>
            {customDistricts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {customDistricts.map((d, i) => (
                  <span key={`${d}-${i}`} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs">
                    {d}
                    <button type="button" onClick={() => removeCustomDistrict(i)} aria-label={`Remove ${d}`} className="-mr-1 rounded-full px-1 hover:bg-slate-200">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Farms */}
        <div>
          <div className="text-sm font-medium text-slate-700">Farms</div>
          <p className="mt-1 text-xs text-slate-500">Add each farm you own with its water account number and the district it sits in.</p>

          <div className="mt-3 space-y-4">
            {farms.map((f, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs text-slate-600" htmlFor={`farm-name-${i}`}>Farm Name</label>
                    <input
                      id={`farm-name-${i}`}
                      value={f.name}
                      onChange={(e) => updateFarm(i, { name: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600" htmlFor={`farm-acct-${i}`}>Water Account #</label>
                    <input
                      id={`farm-acct-${i}`}
                      value={f.accountNumber}
                      onChange={(e) => updateFarm(i, { accountNumber: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600" htmlFor={`farm-district-${i}`}>District</label>
                    <select
                      id={`farm-district-${i}`}
                      value={f.district}
                      onChange={(e) => updateFarm(i, { district: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {suggestedFarmDistricts.map((d, idx) => (
                        <option key={`${d}-${idx}`} value={d}>{d || "Select…"}</option>
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
            <button type="button" onClick={addFarm} className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">+ Add another farm</button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-[#004434] px-5 py-2 text-white hover:bg-[#003a2f] disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save & Continue"}
        </button>
      </form>
    </div>
  );
}
