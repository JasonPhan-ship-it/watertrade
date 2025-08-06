"use client";

import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, Droplets, TrendingUp, Calendar, User } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { user, isSignedIn } = useUser();

  if (!isSignedIn) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-earth-800 mb-4">
            Please Sign In
          </h1>
          <p className="text-earth-600 mb-6">
            You need to be signed in to access your dashboard.
          </p>
          <Button className="bg-water-600 hover:bg-water-700">Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-earth-800 mb-2">
          Welcome back, {user?.firstName || "Farmer"}! 👋
        </h1>
        <p className="text-earth-600">
          Manage your water trading activities and track your portfolio.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-water-600" />
              Create Listing
            </CardTitle>
            <CardDescription>
              Post a new water listing for sale or create a buy request
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/create-listing">
              <Button className="w-full bg-water-600 hover:bg-water-700">
                Create New Listing
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Droplets className="w-5 h-5 text-blue-600" />
              Browse Market
            </CardTitle>
            <CardDescription>
              Explore available water listings and market opportunities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button
                variant="outline"
                className="w-full border-water-600 text-water-600 hover:bg-water-50"
              >
                View Marketplace
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              Market Insights
            </CardTitle>
            <CardDescription>
              Track water prices and market trends
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" disabled>
              Coming Soon
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Stats Overview */}
      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-earth-600">
                  Active Listings
                </p>
                <p className="text-2xl font-bold text-earth-800">0</p>
              </div>
              <Droplets className="w-8 h-8 text-water-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-earth-600">
                  Total Trades
                </p>
                <p className="text-2xl font-bold text-earth-800">0</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-earth-600">
                  Water Credits
                </p>
                <p className="text-2xl font-bold text-earth-800">0</p>
              </div>
              <Calendar className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-earth-600">
                  Account Status
                </p>
                <p className="text-2xl font-bold text-green-600">Active</p>
              </div>
              <User className="w-8 h-8 text-earth-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>
            Your latest water trading activities and updates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Droplets className="w-16 h-16 text-earth-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-earth-800 mb-2">
              No activity yet
            </h3>
            <p className="text-earth-600 mb-4">
              Start by creating your first listing or browsing the marketplace.
            </p>
            <div className="flex gap-4 justify-center">
              <Link href="/create-listing">
                <Button className="bg-water-600 hover:bg-water-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Listing
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline">Browse Market</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
