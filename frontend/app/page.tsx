'use client';

import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Droplets, Users, TrendingUp, Shield } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const { isSignedIn } = useUser();

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold text-earth-800 mb-4">
          💧 Water Trading Platform
        </h1>
        <p className="text-xl text-earth-600 mb-8 max-w-2xl mx-auto">
          Connect with farmers to buy and sell water resources. A sustainable marketplace for water trading and management.
        </p>
        {isSignedIn ? (
          <div className="flex gap-4 justify-center">
            <Link href="/dashboard">
              <Button className="bg-water-600 hover:bg-water-700 text-white px-8 py-3">
                Go to Dashboard
              </Button>
            </Link>
            <Link href="/create-listing">
              <Button variant="outline" className="border-water-600 text-water-600 hover:bg-water-50 px-8 py-3">
                <Plus className="w-4 h-4 mr-2" />
                Create Listing
              </Button>
            </Link>
          </div>
        ) : (
          <Button className="bg-water-600 hover:bg-water-700 text-white px-8 py-3">
            Get Started
          </Button>
        )}
      </div>

      {/* Features Section */}
      <div className="grid md:grid-cols-3 gap-8 mb-12">
        <Card className="text-center p-6">
          <div className="w-12 h-12 bg-water-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Droplets className="w-6 h-6 text-water-600" />
          </div>
          <CardTitle className="text-xl mb-2">Water Resources</CardTitle>
          <CardDescription>
            Buy and sell water credits, allocations, and physical water resources with ease.
          </CardDescription>
        </Card>

        <Card className="text-center p-6">
          <div className="w-12 h-12 bg-earth-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-6 h-6 text-earth-600" />
          </div>
          <CardTitle className="text-xl mb-2">Farmer Network</CardTitle>
          <CardDescription>
            Connect with a network of farmers and water resource managers across districts.
          </CardDescription>
        </Card>

        <Card className="text-center p-6">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-6 h-6 text-green-600" />
          </div>
          <CardTitle className="text-xl mb-2">Market Insights</CardTitle>
          <CardDescription>
            Track water prices, availability, and market trends in real-time.
          </CardDescription>
        </Card>
      </div>

      {/* How It Works */}
      <div className="bg-white rounded-lg p-8 shadow-sm border mb-12">
        <h2 className="text-3xl font-bold text-earth-800 mb-6 text-center">How It Works</h2>
        <div className="grid md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-water-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 font-bold">
              1
            </div>
            <h3 className="font-semibold mb-2">Sign Up</h3>
            <p className="text-earth-600 text-sm">Create your account and verify your identity</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-water-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 font-bold">
              2
            </div>
            <h3 className="font-semibold mb-2">Browse Listings</h3>
            <p className="text-earth-600 text-sm">Find water resources or create your own listing</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-water-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 font-bold">
              3
            </div>
            <h3 className="font-semibold mb-2">Make a Trade</h3>
            <p className="text-earth-600 text-sm">Negotiate and execute water trades securely</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-water-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 font-bold">
              4
            </div>
            <h3 className="font-semibold mb-2">Manage</h3>
            <p className="text-earth-600 text-sm">Track your trades and manage your portfolio</p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="text-center bg-gradient-to-r from-water-50 to-earth-50 rounded-lg p-8">
        <h2 className="text-3xl font-bold text-earth-800 mb-4">Ready to Start Trading?</h2>
        <p className="text-earth-600 mb-6">
          Join thousands of farmers who are already using our platform to manage their water resources.
        </p>
        {isSignedIn ? (
          <Link href="/dashboard">
            <Button className="bg-water-600 hover:bg-water-700 text-white px-8 py-3">
              Go to Dashboard
            </Button>
          </Link>
        ) : (
          <Button className="bg-water-600 hover:bg-water-700 text-white px-8 py-3">
            Get Started Today
          </Button>
        )}
      </div>
    </div>
  );
} 