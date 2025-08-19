// app/create-listing/page.tsx
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function CreateListingPage() {
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const formEl = e.currentTarget;

    try {
      const formData = new FormData(formEl);

      // --- Extract fields BEFORE validation
      const title = String(formData.get("title") ?? "").trim();
      const description = String(formData.get("description") ?? "").trim();
      const district = String(formData.get("district") ?? "").trim();

      // numeric fields
      const volumeAF = Number(formData.get("volumeAF") ?? 0);
      const pricePerAF = Number(formData.get("pricePerAF") ?? 0); // dollars
      const auction = String(formData.get("auction") ?? "") === "on";

      // --- Basic validation
      if (!title) throw new Error("Title is required.");
      if (!district) throw new Error("Water District is required.");
      if (!volumeAF || volumeAF <= 0) throw new Error("Volume (AF) must be greater than 0.");
      if (!auction && (!pricePerAF || pricePerAF <= 0)) {
        throw new Error("Price / AF must be greater than 0 (or enable Auction).");
      }

      // Build payload; convert price to cents on server if you prefer
      const payload = {
        title,
        description,
        district,
        volumeAF,
        pricePerAF, // assume dollars here; convert on API route to cents if needed
        auction,
      };

      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to create listing.");
      }

      setMessage("Listing created successfully.");
      formEl.reset();
    } catch (err: any) {
      setMessage(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Create Listing</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" placeholder="e.g., Westlands 150 AF (2025 Window)" />
            </div>

            {/* District */}
            <div className="grid gap-2">
              <Label htmlFor="district">Water District</Label>
              <Input
                id="district"
                name="district"
                placeholder="e.g., Westlands Water District"
                autoComplete="organization"
              />
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Notes about timing, transfer constraints, etc."
                rows={4}
              />
            </div>

            {/* Numbers row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="volumeAF">Volume (AF)</Label>
                <Input
                  id="volumeAF"
                  name="volumeAF"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="e.g., 150"
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pricePerAF">Price / AF</Label>
                  <div className="flex items-center gap-2">
                    <input id="auction" name="auction" type="checkbox" className="h-4 w-4" />
                    <Label htmlFor="auction" className="text-xs text-slate-600">
                      Auction
                    </Label>
                  </div>
                </div>
                <Input
                  id="pricePerAF"
                  name="pricePerAF"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="e.g., 425.00"
                />
              </div>

              <div className="grid gap-2">
                <Label className="invisible">Spacer</Label>
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving..." : "Create Listing"}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
        {message ? (
          <CardFooter>
            <p className="text-sm">{message}</p>
          </CardFooter>
        ) : null}
      </Card>
    </div>
  );
}
