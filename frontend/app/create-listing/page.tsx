"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export default function CreateListingPage() {
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setMessage(null);
    try {
      const payload = {
        title: String(formData.get("title") || ""),
        description: String(formData.get("description") || ""),
        volumeAF: Number(formData.get("volumeAF") || 0),
        pricePerAF: Number(formData.get("pricePerAF") || 0),
        type: String(formData.get("type") || "sell"),
      };
      await api("/listings", { method: "POST", body: JSON.stringify(payload) });
      setMessage("Listing created!");
    } catch (e: any) {
      setMessage(e.message || "Failed to create listing.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Listing</CardTitle>
        </CardHeader>
        <form action={onSubmit} className="contents">
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" placeholder="e.g., 50 AF transfer in Westlands" required />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="volumeAF">Volume (AF)</Label>
                <Input id="volumeAF" name="volumeAF" type="number" min={0} step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pricePerAF">Price per AF ($)</Label>
                <Input id="pricePerAF" name="pricePerAF" type="number" min={0} step="0.01" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select id="type" name="type" defaultValue="sell">
                <option value="sell">Sell</option>
                <option value="buy">Buy</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" placeholder="Add context, district, timing, terms..." />
            </div>
          </CardContent>
          <CardFooter className="flex items-center gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? "Submitting..." : "Create"}
            </Button>
            {message && <p className="text-sm text-gray-600">{message}</p>}
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
