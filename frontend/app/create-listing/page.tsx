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

    try {
      const formData = new FormData(e.currentTarget);
      const payload = {
        title: String(formData.get("title") || ""),
        description: String(formData.get("description") || ""),
        volumeAF: Number(formData.get("volumeAF") || 0),
        pricePerAF: Number(formData.get("pricePerAF") || 0),
        type: String(formData.get("type") || "sell"),
      };

      const url = "/api/listings";
      if (typeof window !== "undefined") console.log("POST", url, payload); // prove exact path

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API ${res.status}: ${res.statusText}${text ? " - " + text.slice(0, 200) : ""}`);
      }

      setMessage("Listing created!");
      e.currentTarget.reset();
    } catch (err: any) {
      setMessage(err?.message || "Failed to create listing.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader><CardTitle>Create Listing</CardTitle></CardHeader>
        <form onSubmit={handleSubmit} className="contents">
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

            {/* native <select> so FormData includes "type" */}
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                name="type"
                defaultValue="sell"
                required
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="sell">Sell</option>
                <option value="buy">Buy</option>
              </select>
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
            {message && <p className="text-sm text-gray-600" aria-live="polite">{message}</p>}
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
