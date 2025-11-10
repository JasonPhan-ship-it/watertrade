// app/onboarding/page.tsx - Fixed version with pricing redirect
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";

const PRESET_DISTRICTS = [
  "Westlands Water District",
  "San Luis Water District",
  "Panoche Water District",
  "Arvin Edison Water District",
] as const;

type FarmRow = {
  name: string;
  accountNumber: string;
  district: string;
  otherDistrict?: string;
};

type WestlandsIntegration = {
  id: string;
  status: "PENDING" | "CONNECTED" | "DECLINED" | "ERROR";
  consentedAt: string | null;
  lastSyncedAt: string | null;
  balanceAf: number | null;
  balanceUpdatedAt: string | null;
  errorMessage: string | null;
};

export default function OnboardingPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const force = sp?.get("force") === "1";
  const nextPath = sp?.get("next") ?? "/dashboard";

  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();

  const [submitting, setSubmitting] = React.useState(false);
  const [loadingProfile, setLoadingProfile] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [debugInfo, setDebugInfo] = React.useState<string[]>([]);

  const [presetSelected, setPresetSelected] = React.useState<Set<string>>(new Set());
  const [customDistricts, setCustomDistricts] = React.useState<string[]>([]);
  const [customDistrictInput, setCustomDistrictInput] = React.useState("");

  const [farms, setFarms] = React.useState<FarmRow[]>([
    { name: "", accountNumber: "", district: "", otherDistrict: "" },
  ]);

  const [westlandsIntegration, setWestlandsIntegration] = React.useState<WestlandsIntegration | null>(null);
  const [loadingWestlands, setLoadingWestlands] = React.useState(true);
  const [westlandsError, setWestlandsError] = React.useState<string | null>(null);
  const [westlandsConsentChoice, setWestlandsConsentChoice] = React.useState<"YES" | "NO" | null>(null);
  const [westlandsAccountNumber, setWestlandsAccountNumber] = React.useState("");
  const [westlandsSyncing, setWestlandsSyncing] = React.useState(false);

  const parseErrorResponse = React.useCallback(async (res: Response, fallback: string) => {
    try {
      const data = await res.json();
      if (data?.error) return String(data.error);
      return fallback;
    } catch {
      try {
        const text = await res.text();
        return text || fallback;
      } catch {
        return fallback;
      }
    }
  }, []);

  const fetchWestlandsStatus = React.useCallback(async () => {
    setLoadingWestlands(true);
    setWestlandsError(null);
    try {
      const res = await fetch("/api/integrations/westlands", {
        cache: "no-store",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, "Failed to load Westlands integration"));
      }

      const data = await res.json();
      const integration = (data?.integration ?? null) as WestlandsIntegration | null;
      setWestlandsIntegration(integration);

      if (integration?.status === "CONNECTED") {
        setWestlandsConsentChoice("YES");
      } else if (integration?.status === "DECLINED") {
        setWestlandsConsentChoice("NO");
      } else {
        setWestlandsConsentChoice(null);
      }
    } catch (err: any) {
      console.error("[onboarding] Failed to load Westlands integration", err);
      setWestlandsError(err?.message || "Failed to load Westlands integration");
    } finally {
      setLoadingWestlands(false);
    }
  }, [parseErrorResponse]);

  React.useEffect(() => {
    fetchWestlandsStatus();
  }, [fetchWestlandsStatus]);

  const declineWestlands = React.useCallback(async () => {
    setWestlandsSyncing(true);
    setWestlandsError(null);
    try {
      const res = await fetch("/api/integrations/westlands", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: false }),
      });

      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, "Unable to update preference"));
      }

      const data = await res.json();
      const integration = (data?.integration ?? null) as WestlandsIntegration | null;
      setWestlandsIntegration(integration);
      setWestlandsConsentChoice("NO");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("westlands-integration-updated"));
      }
    } catch (err: any) {
      setWestlandsError(err?.message || "Unable to update preference");
      setWestlandsConsentChoice(null);
    } finally {
      setWestlandsSyncing(false);
    }
  }, [parseErrorResponse]);

  const connectWestlands = React.useCallback(async () => {
    setWestlandsSyncing(true);
    setWestlandsError(null);
    try {
      const res = await fetch("/api/integrations/westlands", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, accountNumber: westlandsAccountNumber || undefined }),
      });

      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, "Failed to sync Westlands balance"));
      }

      const data = await res.json();
      const integration = (data?.integration ?? null) as WestlandsIntegration | null;
      setWestlandsIntegration(integration);
      setWestlandsConsentChoice("YES");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("westlands-integration-updated"));
      }
    } catch (err: any) {
      setWestlandsError(err?.message || "Failed to sync Westlands balance");
    } finally {
      setWestlandsSyncing(false);
    }
  }, [parseErrorResponse, westlandsAccountNumber]);

  const openWestlandsPortal = React.useCallback(() => {
    if (typeof window !== "undefined") {
      window.open("https://wwd.ca.gov/", "_blank", "noopener,noreferrer");
    }
  }, []);
  
  // Debug helper
  const addDebug = (msg: string) => {
    console.log(`[ONBOARDING DEBUG]: ${msg}`);
    setDebugInfo(prev => [...prev.slice(-4), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  // Single navigation ref to prevent multiple redirects
  const hasNavigated = React.useRef(false);
  const isCheckingStatus = React.useRef(false);

  // Main onboarding check effect
  React.useEffect(() => {
    if (isCheckingStatus.current) {
      addDebug("Already checking status, skipping...");
      return;
    }

    addDebug(`Starting onboarding check - authLoaded: ${authLoaded}, userLoaded: ${userLoaded}`);
    
    if (!authLoaded || !userLoaded) {
      addDebug("Waiting for auth/user to load...");
      return;
    }

    // Not signed in -> redirect to sign-in
    if (!isSignedIn) {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        const ret = `/onboarding?next=${encodeURIComponent(nextPath)}`;
        const signInUrl = `/sign-in?redirect_url=${encodeURIComponent(ret)}`;
        addDebug(`Not signed in, redirecting to: ${signInUrl}`);
        router.replace(signInUrl);
      }
      return;
    }

    // Check Clerk metadata first - if onboarded and not forced, skip
    const clerkOnboarded = user?.publicMetadata?.onboarded === true;
    addDebug(`Clerk onboarded status: ${clerkOnboarded}, force: ${force}`);

    if (!force && clerkOnboarded) {
      if (!hasNavigated.current) {
        hasNavigated.current = true;
        addDebug("Already onboarded according to Clerk, going to next page");
        router.replace(nextPath);
      }
      return;
    }

    // Set flag to prevent concurrent checks
    isCheckingStatus.current = true;

    // Check server onboarding status with timeout
    const timeoutId = setTimeout(() => {
      addDebug("Timeout reached, showing form");
      setLoadingProfile(false);
      isCheckingStatus.current = false;
    }, 8000); // 8 second timeout

    const checkServerStatus = async () => {
      try {
        addDebug("Checking server onboarding status via /api/onboarding/init");
        
        const res = await fetch("/api/onboarding/init", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        addDebug(`API response status: ${res.status}`);

        if (res.status === 401) {
          if (!hasNavigated.current) {
            hasNavigated.current = true;
            const ret = `/onboarding?next=${encodeURIComponent(nextPath)}`;
            const signInUrl = `/sign-in?redirect_url=${encodeURIComponent(ret)}`;
            addDebug(`API unauthorized, redirecting to: ${signInUrl}`);
            router.replace(signInUrl);
          }
          return;
        }

        if (!res.ok) {
          const errorText = await res.text();
          addDebug(`API error: ${res.status} - ${errorText}`);
          
          setTimeout(() => {
            addDebug("API error, showing onboarding form");
            setLoadingProfile(false);
          }, 1000);
          return;
        }

        const { onboarded } = await res.json();
        addDebug(`Server onboarded status: ${onboarded}`);
        
        if (!force && onboarded) {
          if (!hasNavigated.current) {
            hasNavigated.current = true;
            addDebug("Server says user is onboarded, navigating to next page");
            router.replace(nextPath);
          }
          return;
        }
        
        addDebug("User needs onboarding, showing form");
        setLoadingProfile(false);

      } catch (err: any) {
        addDebug(`Fetch error: ${err.message}`);
        
        setTimeout(() => {
          addDebug("Network error, showing onboarding form");
          setLoadingProfile(false);
        }, 1000);
      } finally {
        clearTimeout(timeoutId);
        isCheckingStatus.current = false;
      }
    };

    checkServerStatus();

    return () => {
      clearTimeout(timeoutId);
      isCheckingStatus.current = false;
    };
  }, [authLoaded, userLoaded, isSignedIn, user?.publicMetadata?.onboarded, user?.id, force, nextPath, router]);

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
  
  const addFarm = () =>
    setFarms((rows) => [...rows, { name: "", accountNumber: "", district: "", otherDistrict: "" }]);
  
  const removeFarm = (i: number) => setFarms((rows) => rows.filter((_, idx) => idx !== i));

  // Submit handler
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const firstName = String(fd.get("firstName") || "").trim();
    const lastName  = String(fd.get("lastName") || "").trim();
    const address   = String(fd.get("address") || "").trim();
    const email     = String(fd.get("email") || "").trim();
    const phone     = String(fd.get("phone") || "").trim();
    const cellPhone = String(fd.get("cellPhone") || "").trim();
    const smsOptIn  = fd.get("smsOptIn") === "on";

    const selectedDistricts = Array.from(presetSelected);
    for (const d of customDistricts) if (!selectedDistricts.includes(d)) selectedDistricts.push(d);

    const farmsPayload = farms
      .map((f) => ({
        name: (f.name || "").trim(),
        accountNumber: (f.accountNumber || "").trim(),
        district: f.district === "__OTHER__" ? (f.otherDistrict || "").trim() : (f.district || "").trim(),
      }))
      .filter((f) => f.name || f.accountNumber || f.district);

    if (!firstName || !lastName || !email) {
      setSubmitting(false);
      setError("First name, last name, and email are required.");
      return;
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const payload = {
      fullName,
      email,
      phone,
      address,
      smsOptIn,
      districts: selectedDistricts,
      farms: farmsPayload,
    };

    try {
      addDebug("Submitting onboarding form...");
      
      const res = await fetch("/api/onboarding/init", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) {
        let msg = "Failed to save profile";
        try { 
          const errorData = await res.json();
          msg = errorData?.error || msg; 
        } catch { 
          msg = await res.text(); 
        }
        throw new Error(msg);
      }

      addDebug("Form submitted successfully");
      addDebug("Clerk metadata will be updated server-side");

      // ⬇️ CHANGED: go straight to pricing (no membership step), preserve next
      addDebug("Navigating to pricing");
      router.push(`/pricing?next=${encodeURIComponent(nextPath)}`);
      
    } catch (err: any) {
      addDebug(`Submit error: ${err.message}`);
      setError(err?.message || "Failed to save profile");
    } finally {
      setSubmitting(false);
    }
  }

  // Loading screen with debug info and escape hatches
  if (loadingProfile) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#004434] mx-auto mb-4"></div>
            <p className="mb-4">Loading your profile...</p>
            
            {/* Debug information with better escape hatches */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg text-left text-sm">
              <h3 className="font-semibold mb-2">Debug Info:</h3>
              <div className="space-y-1 text-xs text-gray-600 font-mono max-h-32 overflow-y-auto">
                {debugInfo.map((info, i) => (
                  <div key={i}>{info}</div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                <button
                  onClick={() => {
                    addDebug("User forced form display");
                    hasNavigated.current = false;
                    isCheckingStatus.current = false;
                    setLoadingProfile(false);
                  }}
                  className="w-full px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                >
                  Show Onboarding Form
                </button>
                <button
                  onClick={() => {
                    addDebug("User skipped to dashboard");
                    hasNavigated.current = true;
                    router.push("/dashboard");
                  }}
                  className="w-full px-3 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                >
                  Skip to Dashboard
                </button>
                {/* ⬇️ CHANGED: "Go to Pricing" (no membership) */}
                <button
                  onClick={() => {
                    addDebug("User went to pricing");
                    hasNavigated.current = true;
                    router.push(`/pricing?next=${encodeURIComponent(nextPath)}`);
                  }}
                  className="w-full px-3 py-2 bg-purple-500 text-white text-sm rounded hover:bg-purple-600"
                >
                  Go to Pricing
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const suggestedFarmDistricts = Array.from(new Set(["", ...PRESET_DISTRICTS, ...customDistricts]));

  const westlandsBalanceDisplay = React.useMemo(() => {
    if (typeof westlandsIntegration?.balanceAf !== "number") return null;
    return `${westlandsIntegration.balanceAf.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} AF`;
  }, [westlandsIntegration?.balanceAf]);

  const westlandsUpdatedDisplay = React.useMemo(() => {
    if (!westlandsIntegration?.balanceUpdatedAt) return null;
    try {
      return new Date(westlandsIntegration.balanceUpdatedAt).toLocaleString();
    } catch {
      return westlandsIntegration.balanceUpdatedAt;
    }
  }, [westlandsIntegration?.balanceUpdatedAt]);

  const westlandsStatus = westlandsIntegration?.status ?? "PENDING";

  const westlandsLastSyncedDisplay = React.useMemo(() => {
    if (!westlandsIntegration?.lastSyncedAt) return null;
    try {
      return new Date(westlandsIntegration.lastSyncedAt).toLocaleString();
    } catch {
      return westlandsIntegration.lastSyncedAt;
    }
  }, [westlandsIntegration?.lastSyncedAt]);
  
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Complete your profile</h1>
      <p className="mt-1 text-slate-600">Tell us a bit about you to personalize Water Traders.</p>

      {/* Show debug info if there were issues */}
      {debugInfo.length > 0 && (
        <details className="mt-4 p-3 bg-yellow-50 rounded-lg text-sm">
          <summary className="cursor-pointer font-medium text-yellow-800">
            Debug Information (click to expand)
          </summary>
          <div className="mt-2 space-y-1 text-xs text-yellow-700 font-mono">
            {debugInfo.map((info, i) => (
              <div key={i}>{info}</div>
            ))}
          </div>
        </details>
      )}

      <section className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white/60 p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Connect your Westlands Water District account</h2>
          <p className="mt-1 text-sm text-slate-600">
            With your consent we can pull your current allocation directly from the official Westlands portal so your dashboard is
            always up to date.
          </p>
        </div>

        {loadingWestlands ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" aria-hidden />
            Loading Westlands status…
          </div>
        ) : (
          <div className="space-y-4">
            {westlandsError && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{westlandsError}</div>
            )}

            {westlandsStatus === "CONNECTED" ? (
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-medium">Westlands account connected</p>
                {westlandsBalanceDisplay && (
                  <p>
                    Current balance: <span className="font-semibold">{westlandsBalanceDisplay}</span>
                    {westlandsUpdatedDisplay && (
                      <span className="ml-1 text-xs text-emerald-800">(updated {westlandsUpdatedDisplay})</span>
                    )}
                  </p>
                )}
                {westlandsLastSyncedDisplay && (
                  <p className="text-xs text-emerald-800">Last synced {westlandsLastSyncedDisplay}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openWestlandsPortal}
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 px-3 py-1.5 text-sm text-emerald-900 hover:bg-emerald-100"
                  >
                    Visit wwd.ca.gov
                  </button>
                  <button
                    type="button"
                    onClick={connectWestlands}
                    disabled={westlandsSyncing}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {westlandsSyncing ? "Syncing…" : "Refresh balance"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-700">
                    Would you like Water Traders to access your Westlands Water District account so we can display your live water
                    balance?
                  </p>
                  {westlandsStatus === "DECLINED" && (
                    <p className="mt-1 text-xs text-slate-500">
                      You can change your preference at any time—select “Yes” below whenever you&apos;re ready.
                    </p>
                  )}
                  {westlandsStatus === "ERROR" && westlandsIntegration?.errorMessage && (
                    <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {westlandsIntegration.errorMessage}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setWestlandsConsentChoice("YES");
                        setWestlandsError(null);
                      }}
                      disabled={westlandsSyncing}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                        westlandsConsentChoice === "YES"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                      }`}
                    >
                      Yes, connect my account
                    </button>
                    <button
                      type="button"
                      onClick={declineWestlands}
                      disabled={westlandsSyncing}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                        westlandsConsentChoice === "NO"
                          ? "border-slate-500 bg-slate-100 text-slate-700"
                          : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                      }`}
                    >
                      No thanks
                    </button>
                  </div>
                </div>

                {westlandsConsentChoice === "YES" && (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white/80 p-4">
                    <p className="text-sm text-slate-700">
                      We&apos;ll redirect you to the official Westlands Water District website in a new tab so you can sign in. Once you
                      finish signing in, return here and click “Sync balance” to pull your latest figures.
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-slate-600" htmlFor="westlands-account">
                        Westlands water account number (optional)
                      </label>
                      <input
                        id="westlands-account"
                        value={westlandsAccountNumber}
                        onChange={(e) => setWestlandsAccountNumber(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Enter your account number"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Sharing your account number helps us confirm we&apos;re capturing the correct balance.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={openWestlandsPortal}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Visit wwd.ca.gov
                      </button>
                      <button
                        type="button"
                        onClick={connectWestlands}
                        disabled={westlandsSyncing}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#004434] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#00392f] disabled:opacity-60"
                      >
                        {westlandsSyncing ? "Syncing…" : "Sync balance"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

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

        {/* Water Districts */}
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
