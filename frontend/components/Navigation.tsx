"use client";

import { useUser, SignInButton, SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { User, LogOut, LogIn } from "lucide-react"; // removed Droplets
import Image from "next/image";
import Link from "next/link";

export default function Navigation() {
  const { user, isSignedIn } = useUser();

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo lockup (image includes logo + name) */}
          <Link href="/" className="flex items-center">
            <Image
              src="/brand.svg"       // <-- place your file in /public as brand.svg
              alt="Water Traders, LLC"
              width={240}
              height={40}
              priority
              className="h-9 w-auto sm:h-10"  /* adjust size here */
            />
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
