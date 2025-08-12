// app/onboarding/page.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@clerk/nextjs";

type ExistingProfile = {
  fullName: string;
  company?: string | null;
  tradeRole: "BUYER" | "SELLER" | "BOTH" | "DISTRICT_ADMIN";
  phone?: string | null;
  primaryDistrict?: string | null;
  waterTypes: string[];
  acceptTerms: boolean;
};

const DISTRICTS = [
  "",
  "Westlands Water District",
  "San Luis Water District",
  "Panoche Water District",
  "Arvin Edison Water District",
] as const;

const WATER_TYPES = ["CVP Allocation", "Pumping Credits", "Supplemental Water"] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { session } = useSession(); // <- we'll reload this after saving

  const [submitting, setSubmitting] = React.useState(false);
  const [prefill, setPrefill] = React.useState<ExistingProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Prefill if a profile already exists
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        if (mounted && json?.profile) {
          setPrefill(json.profile as ExistingProfile);
        }
      } catch {
        // first-time users: no profile yet
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const fd = new FormData(e.currentTarget);

    // enum-safe role values to match Prisma ProfileRole
    const role = String(fd.get("role") || "");
    const acceptTerms = fd.get("acceptTerms") === "on";

    const payload = {
      fullName: String(fd.get("fullName") || "").trim(),
      company: String(fd.get("company") || ""),
      role, // BUYER | SELLER | BOTH | DISTRICT_ADMIN
      phone: String(fd.get("phone") || ""),
      primaryDistrict: String(fd.get("primaryDistrict") || ""),
      waterTypes: Array.from(fd.getAll("waterTypes")) as string[],
      acceptTerms,
    };

    // small helper so a stuck request doesn't spin forever
    const withTimeout = <T,>(p: Promise<T>, ms = 15000) =>
      Promise.race([
        p,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Request timed out")), ms)),
      ]);

    try {
      const res = await withTimeout(
        fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      );

      if (!res.ok) {
        let msg = "Failed to save profile";
        try {
          const j = await (res as Response).json();
          msg = j?.error || msg;
        } catch {
          msg = await (res as Response).text();
        }
        throw new Error(msg || "Failed to save profile");
      }

      // ✅ Refresh Clerk session so middleware sees publicMetadata.onboarded = true
      await session?.reload();

      // and go to dashboard
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Failed to save profile");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingProfile) {
    return <div className="mx-auto max-w-2xl p-6">Loading…</div>;
  }

  const defaultWaterTypes = new Set(prefill?.waterTypes || []);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Complete your profile</h1>
      <p className="mt-1 text-slate-600">Tell us a bit about you to personalize Water Traders.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="fullName">Full name *</label>
            <input
              id="fullName"
              name="fullName"
              required
              defaultValue={prefill?.fullName || ""}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="company">Company</label>
            <input
              id="company"
              name="company"
              defaultValue={prefill?.company || ""}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="role">Role *</label>
            <select
              id="role"
              name="role"
              required
              defaultValue={prefill?.tradeRole || ""}
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
            <label className="block text-sm text-slate-600" htmlFor="phone">Phone</label>
            <input
              id="phone"
              name="phone"
              defaultValue={prefill?.phone || ""}
              inputMode="tel"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="primaryDistrict">Primary District</label>
            <select
              id="primaryDistrict"
              name="primaryDistrict"
              defaultValue={prefill?.primaryDistrict || ""}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>{d ? d : "Select…"}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600">Water Types</label>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {WATER_TYPES.map((wt) => (
                <label key={wt} className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="waterTypes"
                    value={wt}
                    defaultChecked={defaultWaterTypes.has(wt)}
                  />
                  <span>{wt}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            id="acceptTerms"
            name="acceptTerms"
            type="checkbox"
            required
            defaultChecked={prefill?.acceptTerms ?? false}
          />
          <span>I agree to the Terms and acknowledge the Privacy Policy *</span>
        </label>

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
