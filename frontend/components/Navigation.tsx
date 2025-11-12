"use client";

import { useUser, SignInButton, SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function Navigation() {
  const router = useRouter();
  const { user, isSignedIn } = useUser();
  const [isPremium, setIsPremium] = useState(false);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!isSignedIn || !user) {
      return;
    }

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

  const openBillingPortal = useCallback(async () => {
    try {
      setPortalLoading(true);
      // Typical Stripe portal endpoint pattern; adjust if your route differs
      const resp = await fetch("/api/subscription/portal", {
        method: "POST",
        credentials: "include",
      });
      if (!resp.ok) {
        throw new Error("Failed to create portal session");
      }
      
      const data = await resp.json();
      if (data?.url) {
        window.location.href = data.url;
        return;

      }
      throw new Error("No portal URL returned");
    } catch (error) {
      console.error(error);
      
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

  return (
    <nav className="border-b bg-white shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap items-center justify-between gap-2 py-2 md:py-2">
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

          <div className="flex flex-1 items-center justify-end gap-4 md:flex-none">
            {isSignedIn ? (
              <div className="flex w-full flex-col items-end gap-3 text-right sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-6">
                <div className="flex flex-wrap items-center justify-end gap-2 sm:justify-start">
                  <Link
                    href="/profile"
                    className="flex items-center text-sm font-medium text-gray-700 transition hover:text-gray-900"
                  >
                    <User className="mr-1 h-4 w-4" />
                    {user?.firstName || user?.username || "Profile"}
                  </Link>
                  {premiumBadge}
                </div>
                <SignOutButton signOutCallback={() => router.push("/?logout=success")}>
                  <Button className="bg-[#004434] text-white hover:bg-[#00392f]">Logout</Button>
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
