"use client";

import { useState } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation"; // 🆕 Added router import
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
  const { getToken } = useAuth();
  const router = useRouter(); // 🆕 Initialize router

  const [form, setForm] = useState({
    type: "",
    title: "",
    description: "",
    quantity: "",
    unit: "",
    price: "",
    district: "",
    contact: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleChange = (field: string, value: string) => {
    setForm({ ...form, [field]: value });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setMessage("");

    try {
      const token = await getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/listings`, // 🆕 Changed env var
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: form.title,
            description: form.description,
            type: form.type,        // 🆕 Added
            quantity: parseFloat(form.quantity),
            unit: form.unit,        // 🆕 Added
            price: parseFloat(form.price),
            district: form.district, // 🆕 Added
            contact: form.contact,   // 🆕 Added
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to create listing");

      setMessage("✅ Listing created successfully!");

      setTimeout(() => {
        router.push("/dashboard"); // 🆕 Redirect to dashboard
      }, 1000);

      setForm({
        type: "",
        title: "",
        description: "",
        quantity: "",
        unit: "",
        price: "",
        district: "",
        contact: "",
      });
    } catch (error) {
      console.error(error);
      setMessage("❌ Error creating listing. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
              <Select
                value={form.type}
                onValueChange={(v) => handleChange("type", v)}
              >
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
                value={form.title}
                onChange={(e) => handleChange("title", e.target.value)}
                placeholder="e.g., Premium Water Credits Available"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="Describe your water listing, including quality, source, and any special conditions..."
                rows={4}
              />
            </div>

            {/* Quantity and Unit */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={form.quantity}
                  onChange={(e) => handleChange("quantity", e.target.value)}
                  placeholder="100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Select
                  value={form.unit}
                  onValueChange={(v) => handleChange("unit", v)}
                >
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
              <Input
                id="price"
                type="number"
                value={form.price}
                onChange={(e) => handleChange("price", e.target.value)}
                placeholder="150.00"
              />
            </div>

            {/* District */}
            <div className="space-y-2">
              <Label htmlFor="district">District</Label>
              <Select
                value={form.district}
                onValueChange={(v) => handleChange("district", v)}
              >
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
              <Input
                id="contact"
                value={form.contact}
                onChange={(e) => handleChange("contact", e.target.value)}
                placeholder="Phone number or email"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <Button
                className="w-full bg-water-600 hover:bg-water-700"
                onClick={handleSubmit}
                disabled={loading}
              >
                <Plus className="w-4 h-4 mr-2" />
                {loading ? "Creating..." : "Create Listing"}
              </Button>
              {message && (
                <p className="text-sm text-earth-500 mt-2 text-center">
                  {message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
