'use client';

import { useUser, SignInButton, SignOutButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Droplets, User, LogOut, LogIn } from 'lucide-react';
import Link from 'next/link';

export default function Navigation() {
  const { user, isSignedIn } = useUser();

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <Droplets className="w-8 h-8 text-water-600" />
            <span className="text-xl font-bold text-earth-800">Water Trading</span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-6">
            <Link href="/" className="text-earth-600 hover:text-earth-800 transition-colors">
              Marketplace
            </Link>
            {isSignedIn && (
              <Link href="/dashboard" className="text-earth-600 hover:text-earth-800 transition-colors">
                Dashboard
              </Link>
            )}
            {isSignedIn && (
              <Link href="/create-listing" className="text-earth-600 hover:text-earth-800 transition-colors">
                Create Listing
              </Link>
            )}
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            {isSignedIn ? (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4 text-earth-600" />
                  <span className="text-sm text-earth-600">
                    {user?.firstName} {user?.lastName}
                  </span>
                </div>
                <SignOutButton>
                  <Button variant="outline" size="sm">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </SignOutButton>
              </div>
            ) : (
              <SignInButton>
                <Button className="bg-water-600 hover:bg-water-700">
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