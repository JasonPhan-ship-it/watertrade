"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const payload = {
      fullName: String(fd.get("fullName") || ""),
      company: String(fd.get("company") || ""),
      role: String(fd.get("role") || ""),
      phone: String(fd.get("phone") || ""),
      primaryDistrict: String(fd.get("primaryDistrict") || ""),
      waterTypes: Array.from(fd.getAll("waterTypes")) as string[],
      acceptTerms: fd.get("acceptTerms") === "on",
    };

    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      // success → send to dashboard (or wherever)
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Failed to save profile");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Complete your profile</h1>
      <p className="mt-1 text-slate-600">Tell us a bit about you to personalize Water Traders.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="fullName">Full name *</label>
            <input id="fullName" name="fullName" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="company">Company</label>
            <input id="company" name="company" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="role">Role *</label>
            <select id="role" name="role" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">Select…</option>
              <option>Buyer</option>
              <option>Seller</option>
              <option>Both</option>
              <option>District Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="phone">Phone</label>
            <input id="phone" name="phone" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="primaryDistrict">Primary District</label>
            <select id="primaryDistrict" name="primaryDistrict" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">Select…</option>
              <option>Westlands Water District</option>
              <option>San Luis Water District</option>
              <option>Panoche Water District</option>
              <option>Arvin Edison Water District</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600">Water Types</label>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {["CVP Allocation", "Pumping Credits", "Supplemental Water"].map((wt) => (
                <label key={wt} className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" name="waterTypes" value={wt} />
                  <span>{wt}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-sm">
          <input id="acceptTerms" name="acceptTerms" type="checkbox" required />
          <span>I agree to the Terms and acknowledge the Privacy Policy *</span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-[#004434] px-5 py-2 text-white hover:bg-[#003a2f] disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save & Continue"}
        </button>
      </form>
    </div>
  );
}
