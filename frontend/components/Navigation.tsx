// components/Navigation.tsx
"use client";

import { useUser, SignInButton, SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { User, LogOut, LogIn, Crown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Navigation() {
  const { user, isSignedIn } = useUser();
  const [isPremium, setIsPremium] = useState(false);
  const [premiumLoading, setPremiumLoading] = useState(false);

  // Check premium status from both Clerk metadata and database
  useEffect(() => {
    if (!isSignedIn || !user) return;

    const checkPremiumStatus = async () => {
      setPremiumLoading(true);
      try {
        // First check Clerk metadata (quick)
        const clerkPremium = Boolean(user?.publicMetadata?.premium);
        
        // Also check database for active subscription
        const response = await fetch("/api/subscription/status", {
          credentials: "include",
          cache: "no-store"
        });
        
        let dbPremium = false;
        if (response.ok) {
          const data = await response.json();
          dbPremium = data.isPremium || false;
        }

        // User is premium if either source says so
        const finalPremiumStatus = clerkPremium || dbPremium;
        setIsPremium(finalPremiumStatus);

        // If there's a mismatch, sync Clerk metadata with DB status
        if (clerkPremium !== dbPremium && response.ok) {
          console.log("Premium status mismatch detected, may need sync");
        }
      } catch (error) {
        console.error("Failed to check premium status:", error);
        // Fallback to Clerk metadata only
        setIsPremium(Boolean(user?.publicMetadata?.premium));
      } finally {
        setPremiumLoading(false);
      }
    };

    checkPremiumStatus();
  }, [isSignedIn, user]);

  return (
    <nav className="bg-white shadow-sm border-b mt-8 sm:mt-10 md:mt-14 pb-4 md:pb-6">
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

          {/* Center: Links */}
          {isSignedIn && (
            <div className="flex items-center gap-5 md:gap-6 justify-center">
              <Link href="/dashboard" className="text-sm text-gray-700 hover:text-gray-900">
                Dashboard
              </Link>
              <Link href="/create-listing" className="text-sm text-gray-700 hover:text-gray-900">
                Create Listing
              </Link>
              <Link href="/analytics" className="text-sm text-gray-700 hover:text-gray-900">
                Analytics
              </Link>
            </div>
          )}

          {/* Right: Auth */}
          <div className="flex items-center gap-3 flex-1 justify-end">
            {isSignedIn ? (
              <div className="flex items-center gap-3">
                <Link href="/profile" className="flex items-center text-sm text-gray-700 hover:text-gray-900">
                  <User className="w-4 h-4 mr-1" />
                  {user?.firstName || user?.username || "Profile"}
                </Link>

                {/* Premium Badge */}
                {premiumLoading ? (
                  <div className="animate-pulse bg-gray-200 rounded-full px-2.5 py-1 w-16 h-6"></div>
                ) : isPremium ? (
                  <span
                    title="Premium subscription active"
                    className="inline-flex items-center rounded-full bg-gradient-to-r from-[#0E6A59] to-[#004434] px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm"
                  >
                    <Crown className="w-3 h-3 mr-1" />
                    Premium
                  </span>
                ) : (
                  <Link
                    href="/pricing"
                    className="inline-flex items-center rounded-full bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors"
                    title="Upgrade to Premium"
                  >
                    Upgrade
                  </Link>
                )}

                <SignOutButton>
                  <Button variant="outline" size="sm">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </SignOutButton>
              </div>
            ) : (
              <SignInButton mode="modal" afterSignInUrl="/api/auth/after-sign-in?next=/dashboard">
                <Button className="bg-[#004434] hover:bg-[#00392f] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#004434]">
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign In
                </Button>
              </SignInButton>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
