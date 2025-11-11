"use client";

import { useUser, SignInButton, SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { User, LogOut, Loader2 } from "lucide-react"; // ⬅️ removed Crown
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";

export default function Navigation() {
  const router = useRouter();
  const { user, isSignedIn } = useUser();
  const [isPremium, setIsPremium] = useState(false);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [westlandsBalance, setWestlandsBalance] = useState<{ amount: number; updatedAt: string | null } | null>(null);
  const [westlandsLoading, setWestlandsLoading] = useState(false);

  useEffect(() => {
    if (!isSignedIn || !user) return;

    const checkPremiumStatus = async () => {
      setPremiumLoading(true);
      try {
        const clerkPremium = Boolean(user?.publicMetadata?.premium);

        let dbPremium = false;
        try {
          const response = await fetch("/api/subscription/status", {
            credentials: "include",
            cache: "no-store",
          });
          if (response.ok) {
            const data = await response.json();
            dbPremium = data.isPremium || false;
          }
        } catch {
          console.log("Subscription API not available, using Clerk metadata only");
        }

        setIsPremium(clerkPremium || dbPremium);
      } catch (error) {
        console.error("Failed to check premium status:", error);
        setIsPremium(Boolean(user?.publicMetadata?.premium));
      } finally {
        setPremiumLoading(false);
      }
    };

    checkPremiumStatus();
  }, [isSignedIn, user]);

  const refreshWestlandsBalance = useCallback(async () => {
    if (!isSignedIn) {
      setWestlandsBalance(null);
      setWestlandsLoading(false);
      return;
    }

    setWestlandsLoading(true);
    try {
      const res = await fetch("/api/integrations/westlands", {
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Failed to load Westlands balance");

      const data = await res.json();
      const integration = (data?.integration ?? null) as
        | {
            status?: string | null;
            balanceAf?: number | null;
            balanceUpdatedAt?: string | null;
            lastSyncedAt?: string | null;
          }
        | null;

      if (
        integration?.status === "CONNECTED" &&
        typeof integration?.balanceAf === "number"
      ) {
        setWestlandsBalance({
          amount: integration.balanceAf,
          updatedAt: integration.balanceUpdatedAt ?? integration.lastSyncedAt ?? null,
        });
      } else {
        setWestlandsBalance(null);
      }
    } catch (error) {
      console.warn("Failed to load Westlands balance", error);
      setWestlandsBalance(null);
    } finally {
      setWestlandsLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    refreshWestlandsBalance();

    if (typeof window === "undefined") return;

    const handler = () => {
      refreshWestlandsBalance();
    };

    window.addEventListener("westlands-integration-updated", handler);
    return () => {
      window.removeEventListener("westlands-integration-updated", handler);
    };
  }, [refreshWestlandsBalance]);

  const westlandsDisplay = useMemo(() => {
    if (!westlandsBalance) return null;
    const amount = westlandsBalance.amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    let updated: string | null = null;
    if (westlandsBalance.updatedAt) {
      try {
        updated = new Date(westlandsBalance.updatedAt).toLocaleString(undefined, {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
      } catch {
        updated = westlandsBalance.updatedAt;
      }
    }

    return { amount, updated };
  }, [westlandsBalance]);

  const openBillingPortal = useCallback(async () => {
    try {
      setPortalLoading(true);
      // Typical Stripe portal endpoint pattern; adjust if your route differs
      const resp = await fetch("/api/subscription/portal", {
        method: "POST",
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Failed to create portal session");
      const data = await resp.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No portal URL returned");
      }
    } catch (err) {
      console.error(err);
      // Fallback: send to a generic billing page if you have one
      window.location.href = "/billing";
    } finally {
      setPortalLoading(false);
    }
  }, []);

  const premiumBadge = premiumLoading ? (
    <div className="h-7 w-20 rounded-full bg-slate-200/80 animate-pulse" />
  ) : isPremium ? (
    <button
      onClick={openBillingPortal}
      disabled={portalLoading}
      title="Manage billing"
      aria-label="Manage billing"
      className="inline-flex items-center rounded-full bg-gradient-to-r from-[#0E6A59] to-[#004434] px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:brightness-110 active:brightness-95 disabled:opacity-70"
    >
      Premium
      {portalLoading && <span className="ml-2 animate-pulse">…</span>}
    </button>
  ) : (
    <Link
      href="/pricing"
      className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-200"
      title="Upgrade to Premium"
    >
      Upgrade
    </Link>
  );

  const westlandsSection = (
    <div className="w-full min-w-[220px] max-w-[280px] rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-right shadow-sm">
      {westlandsLoading ? (
        <div className="flex items-center justify-end gap-2 text-xs font-medium text-emerald-700">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Syncing Westlands…
        </div>
      ) : westlandsDisplay ? (
        <div className="space-y-1 text-emerald-900">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            Westlands balance
          </div>
          <div className="text-lg font-semibold">{westlandsDisplay.amount} AF</div>
          {westlandsDisplay.updated && (
            <div className="text-[11px] text-emerald-700">Updated {westlandsDisplay.updated}</div>
          )}
        </div>
      ) : (
        <div className="text-[11px] font-medium text-emerald-700">
          Connect your Westlands account to see live balances.
        </div>
      )}
    </div>
  );

  return (
    <nav className="border-b bg-white shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap items-center justify-between gap-4 py-5 md:py-6">
          {/* Logo */}
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex items-center gap-3" aria-label="Water Traders home">
              <Image
                src="/brand.svg"
                alt="Water Traders icon"
                width={120}
                height={120}
                priority
                className="h-10 w-auto shrink-0 md:h-12"
              />
              <Image
                src="/wordmark.png"
                alt="Water Traders"
                width={1080}
                height={480}
                className="-ml-20 h-auto w-64 sm:w-72 md:w-96"
              />
            </Link>
          </div>

          {/* Authenticated actions */}
          <div className="flex flex-1 items-center justify-end gap-4 md:flex-none">
            {isSignedIn ? (
              <div className="flex w-full flex-col items-end gap-3 text-right sm:w-auto sm:flex-row sm:items-center sm:gap-4">
                <div className="flex flex-col items-end gap-2">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Link
                      href="/profile"
                      className="flex items-center text-sm font-medium text-gray-700 transition hover:text-gray-900"
                    >
                      <User className="mr-1 h-4 w-4" />
                      {user?.firstName || user?.username || "Profile"}
                    </Link>
                    {premiumBadge}
                  </div>
                  {westlandsSection}
                </div>

                <SignOutButton signOutCallback={() => router.push("/?logout=success")}>
                  <Button variant="outline" className="px-3 py-2 text-sm">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </Button>
                </SignOutButton>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <SignInButton mode="modal" afterSignInUrl="/api/auth/after-sign-in?next=/dashboard">
                  <Button className="bg-[#004434] text-white hover:bg-[#00392f]">
                    Login
                  </Button>
                </SignInButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
