"use client";

import { useUser, SignInButton, SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { User, LogOut, LogIn } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function Navigation() {
  const { user, isSignedIn } = useUser();

  return (
    <nav className="bg-white shadow-sm border-b mt-8 sm:mt-10 md:mt-14 pb-4 md:pb-6">
      <div className="container mx-auto px-4">
        {/* Taller header */}
        <div className="flex items-center justify-between h-20 md:h-24">
          {/* Logo lockup: icon + PNG wordmark */}
          <Link href="/" className="flex items-center gap-3" aria-label="Water Traders home">
            <Image
              src="/brand.svg"              // existing icon
              alt="Water Traders icon"
              width={120}
              height={120}
              priority
              className="h-10 w-auto md:h-12 shrink-0"
            />
            <Image
              src="/wordmark.png"           // <-- your PNG wordmark here
              alt="Water Traders"
              width={520}
              height={120}
              className="h-8 w-auto md:h-10 shrink-0"
            />
          </Link>

          {/* Links */}
          <div className="flex items-center gap-5 md:gap-6">
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

          {/* Auth */}
          <div className="flex items-center gap-3">
            {isSignedIn ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center text-sm text-gray-700">
                  <User className="w-4 h-4 mr-1" />
                  {user?.firstName || "User"}
                </div>
                <SignOutButton>
                  <Button variant="outline">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </SignOutButton>
              </div>
            ) : (
              <SignInButton mode="modal" afterSignInUrl="/dashboard">
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
