"use client";

import { useUser, SignInButton, SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { User, LogOut } from "lucide-react"; // ⬅️ removed Crown
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";

export default function Navigation() {
  const { user, isSignedIn } = useUser();
  const [isPremium, setIsPremium] = useState(false);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

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

  return (
    <nav className="bg-white shadow-sm border-b pb-4 md:pb-6">
      <div className="container mx-auto px-4">
        <div className="flex items-center h-20 md:h-24">
          {/* Left: Logo */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Link href="/" className="flex items-center gap-3" aria-label="Water Traders home">
              <Image
                src="/brand.svg"
                alt="Water Traders icon"
                width={120}
                height={120}
                priority
                className="h-10 w-auto md:h-12 shrink-0"
              />
              <Image
                src="/wordmark.png"
                alt="Water Traders"
                width={1080}
                height={480}
                className="w-64 sm:w-72 md:w-96 h-auto -ml-20"
              />
            </Link>
          </div>

          {/* Right side: Auth */}
          <div className="flex items-center gap-3 flex-1 justify-end">
            {isSignedIn ? (
              <div className="flex items-center gap-3">
                {/* Profile link */}
                <Link
                  href="/profile"
                  className="flex items-center text-sm text-gray-700 hover:text-gray-900"
                >
                  <User className="w-4 h-4 mr-1" />
                  {user?.firstName || user?.username || "Profile"}
                </Link>

                {/* Premium badge / upgrade */}
                {premiumLoading ? (
                  <div className="animate-pulse bg-gray-200 rounded-full px-2.5 py-1 w-16 h-6" />
                ) : isPremium ? (
                  <button
                    onClick={openBillingPortal}
                    disabled={portalLoading}
                    title="Manage billing"
                    aria-label="Manage billing"
                    className="inline-flex items-center rounded-full bg-gradient-to-r from-[#0E6A59] to-[#004434] px-3 py-1 text-[11px] font-semibold text-white shadow-sm hover:brightness-110 active:brightness-95 transition disabled:opacity-70"
                  >
                    {/* icon removed per request */}
                    Premium
                    {portalLoading && (
                      <span className="ml-2 animate-pulse">…</span>
                    )}
                  </button>
                ) : (
                  <Link
                    href="/pricing"
                    className="inline-flex items-center rounded-full bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors"
                    title="Upgrade to Premium"
                  >
                    Upgrade
                  </Link>
                )}

                {/* Sign out */}
                <SignOutButton>
                  <Button variant="outline" className="px-3 py-2 text-sm">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </SignOutButton>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <SignInButton mode="modal" afterSignInUrl="/api/auth/after-sign-in?next=/dashboard">
                  <Button className="bg-[#004434] hover:bg-[#00392f] text-white">
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
