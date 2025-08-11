"use client";

import { useUser, SignInButton, SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Droplets, User, LogOut, LogIn } from "lucide-react";
import Link from "next/link";

export default function Navigation() {
  const { user, isSignedIn } = useUser();

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <Droplets className="w-5 h-5 text-water-600" />
            <span className="font-semibold">Water Traders</span>
          </Link>

          {/* Links */}
          <div className="flex items-center gap-4">
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
