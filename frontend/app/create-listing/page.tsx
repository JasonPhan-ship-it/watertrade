"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// Optional: common districts for suggestions (free-text still allowed)
const DISTRICTS = [
  "Westlands Water District",
  "San Luis Water District",
  "Panoche Water District",
  "Arvin Edison Water District",
];

export default function CreateListingPage() {
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [isAuction, setIsAuction] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const formEl = e.currentTarget;

    try {
      const formData = new FormData(formEl);

      const payload: any = {
        title: String(formData.get("title") || ""),
        description: String(formData.get("description") || ""),
        volumeAF: Number(formData.get("volumeAF") || 0),
        pricePerAF: Number(formData.get("pricePerAF") || 0),
        waterType: String(formData.get("waterType") || ""),
        district: String(formData.get("district") || ""),
        isAuction,
      };

      if (isAuction) {
        payload.startingBid = Number(formData.get("startingBid") || 0);
        payload.reservePrice = Number(formData.get("reservePrice") || 0);
        payload.endDate = String(formData.get("endDate") || "");
      }

      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setMessage("Listing created successfully!");
        formEl.reset();
        setIsAuction(false);
      } else {
        const error = await res.text();
        setMessage(error || "Failed to create listing.");
      }
    } catch (err: any) {
      setMessage(err.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Listing</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={4} required />
            </div>
            <div>
              <Label htmlFor="volumeAF">Volume (acre-feet)</Label>
              <Input
                id="volumeAF"
                name="volumeAF"
                type="number"
                step="1.00"
                required
              />
            </div>
            <div>
              <Label htmlFor="pricePerAF">Price per AF ($)</Label>
              <Input
                id="pricePerAF"
                name="pricePerAF"
                type="number"
                step="0.01"
                required
              />
            </div>
            <div>
              <Label htmlFor="waterType">Water Type</Label>
              <Input id="waterType" name="waterType" required />
            </div>
            <div>
              <Label htmlFor="district">Water District</Label>
              <Input
                id="district"
                name="district"
                list="district-options"
                required
              />
              <datalist id="district-options">
                {DISTRICTS.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>

            {/* Auction toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isAuction"
                checked={isAuction}
                onChange={(e) => setIsAuction(e.target.checked)}
              />
              <Label htmlFor="isAuction">Sell via Auction</Label>
            </div>

            {isAuction && (
              <div className="space-y-4 border rounded-md p-4 bg-slate-50">
                <div>
                  <Label htmlFor="startingBid">Starting Bid ($)</Label>
                  <Input
                    id="startingBid"
                    name="startingBid"
                    type="number"
                    step="0.01"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="reservePrice">Reserve Price ($)</Label>
                  <Input
                    id="reservePrice"
                    name="reservePrice"
                    type="number"
                    step="1.00"
                  />
                </div>
                <div>
                  <Label htmlFor="endDate">Auction End Date</Label>
                  <Input id="endDate" name="endDate" type="datetime-local" required />
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Listing"}
            </Button>
          </CardFooter>
        </form>
      </Card>
      {message && <p className="mt-4 text-sm">{message}</p>}
    </div>
  );
}
