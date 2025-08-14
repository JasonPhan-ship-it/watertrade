// app/onboarding/page.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession, useUser } from "@clerk/nextjs";

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
  const { session, isLoaded: sessionLoaded } = useSession();
  const { user, isLoaded: userLoaded } = useUser();

  const [submitting, setSubmitting] = React.useState(false);
  const [loadingProfile, setLoadingProfile] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // --- helpers ---
  function withTimeout<T>(p: Promise<T>, ms = 15000) {
    const t = setTimeout(() => {}, ms);
    return Promise.race([
      p,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Request timed out")), ms)),
    ]).finally(() => clearTimeout(t));
  }

  // One-shot redirect
  const redirectedRef = React.useRef(false);
  const goDashboard = React.useCallback(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace("/dashboard");
  }, [router]);

  // Persist onboarded in Clerk (unsafeMetadata) + cookie, then refresh session and go
  const markOnboardedAndProceed = React.useCallback(
    async (uid?: string | null) => {
      try {
        const current = (user?.unsafeMetadata ?? {}) as Record<string, unknown>;
        await user?.update?.({ unsafeMetadata: { ...current, onboarded: true } });
      } catch {
        // Non-fatal: middleware also accepts cookie fallback
      }

      // Cookie fallback for your middleware (optional)
      if (uid) {
        try {
          document.cookie = `onboarded=${uid}; Path=/; Max-Age=1800; SameSite=Lax`;
        } catch {}
      }

      try {
        await session?.reload?.();
      } catch {}

      goDashboard();
    },
    [goDashboard, session, user]
  );

  // If profile exists -> skip form
  React.useEffect(() => {
    if (!sessionLoaded || !userLoaded) return;
    let live = true;

    (async () => {
      try {
        const res = await withTimeout(
          fetch("/api/profile", { cache: "no-store", credentials: "include" }),
          10000
        );
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        if (!live) return;

        if (json?.profile) {
          await markOnboardedAndProceed(user?.id);
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
  }, [sessionLoaded, userLoaded, user?.id, markOnboardedAndProceed]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const payload = {
      fullName: String(fd.get("fullName") || "").trim(),
      company: String(fd.get("company") || ""),
      role: String(fd.get("role") || ""),
      phone: String(fd.get("phone") || ""),
      primaryDistrict: String(fd.get("primaryDistrict") || ""),
      waterTypes: Array.from(fd.getAll("waterTypes")) as string[],
      acceptTerms: fd.get("acceptTerms") === "on",
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
          msg = (j as any)?.error || msg;
        } catch {
          try {
            msg = await res.text();
          } catch {}
        }
        throw new Error(msg);
      }

      await markOnboardedAndProceed(user?.id);
    } catch (err: any) {
      setError(err?.message || "Failed to save profile");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingProfile) {
    return <div className="mx-auto max-w-2xl p-6">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Complete your profile</h1>
      <p className="mt-1 text-slate-600">Tell us a bit about you to personalize Water Traders.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="fullName">
              Full name *
            </label>
            <input
              id="fullName"
              name="fullName"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="company">
              Company
            </label>
            <input
              id="company"
              name="company"
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
              name="role"
              required
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
              name="phone"
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
              name="primaryDistrict"
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
              {WATER_TYPES.map((wt) => (
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
          disabled={submitting}
          className="rounded-xl bg-[#004434] px-5 py-2 text-white hover:bg-[#003a2f] disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save & Continue"}
        </button>
      </form>
    </div>
  );
}
