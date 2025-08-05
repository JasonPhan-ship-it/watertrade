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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";

export default function CreateListingPage() {
  const { isSignedIn } = useUser();

  if (!isSignedIn) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-earth-800 mb-4">
            Please Sign In
          </h1>
          <p className="text-earth-600 mb-6">
            You need to be signed in to create a listing.
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
        <div className="flex items-center gap-4 mb-4">
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-earth-800 mb-2">
          Create New Listing
        </h1>
        <p className="text-earth-600">
          Post a water listing for sale or create a buy request
        </p>
      </div>

      {/* Form */}
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-water-600" />
              Listing Details
            </CardTitle>
            <CardDescription>
              Fill in the details for your water listing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Listing Type */}
            <div className="space-y-2">
              <Label htmlFor="type">Listing Type</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select listing type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SALE">For Sale</SelectItem>
                  <SelectItem value="BUY_REQUEST">Buy Request</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g., Premium Water Credits Available"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe your water listing, including quality, source, and any special conditions..."
                rows={4}
              />
            </div>

            {/* Quantity and Unit */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input id="quantity" type="number" placeholder="100" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACRE_FEET">Acre Feet</SelectItem>
                    <SelectItem value="GALLONS">Gallons</SelectItem>
                    <SelectItem value="CREDITS">Credits</SelectItem>
                    <SelectItem value="ALLOCATION">Allocation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Price */}
            <div className="space-y-2">
              <Label htmlFor="price">Price per Unit</Label>
              <Input id="price" type="number" placeholder="150.00" />
            </div>

            {/* District */}
            <div className="space-y-2">
              <Label htmlFor="district">District</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select district" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CENTRAL_VALLEY">Central Valley</SelectItem>
                  <SelectItem value="NORTHERN_CALIFORNIA">
                    Northern California
                  </SelectItem>
                  <SelectItem value="SOUTHERN_CALIFORNIA">
                    Southern California
                  </SelectItem>
                  <SelectItem value="EASTERN_CALIFORNIA">
                    Eastern California
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Contact Information */}
            <div className="space-y-2">
              <Label htmlFor="contact">Contact Information</Label>
              <Input id="contact" placeholder="Phone number or email" />
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <Button
                className="w-full bg-water-600 hover:bg-water-700"
                disabled
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Listing (Coming Soon)
              </Button>
              <p className="text-sm text-earth-500 mt-2 text-center">
                Backend integration coming soon. This is a demo version.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
