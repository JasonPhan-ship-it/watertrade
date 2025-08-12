// app/listings/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Listing = {
  id: string;
  district: string;
  acreFeet: number;
  pricePerAf: number;
  availabilityStart: string;
  availabilityEnd: string;
  waterType: string;
  createdAt: string;
};

export default function ListingDetailPage() {
  // ✅ Tell TS what params exist
  const { id } = useParams<{ id: string }>();
  const listingId = Array.isArray(id) ? id[0] : id; // extra-safe

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listingId) return;
    setLoading(true);
    fetch(`/api/listings/${encodeURIComponent(listingId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => setListing(data))
      .catch((e) => setError(e.message || "Failed to load listing"))
      .finally(() => setLoading(false));
  }, [listingId]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!listing) return <div className="p-6">No listing found.</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">{listing.district}</h1>
      <p className="text-slate-500 mt-1">Water Type: {listing.waterType}</p>

      <div className="mt-4 border-t pt-4">
        <p><strong>Acre-Feet:</strong> {listing.acreFeet}</p>
        <p><strong>Price per AF:</strong> ${listing.pricePerAf}</p>
        <p><strong>Availability:</strong> {listing.availabilityStart} – {listing.availabilityEnd}</p>
      </div>

      <div className="mt-6">
        <a href="/dashboard" className="text-blue-600 hover:underline">← Back to Listings</a>
      </div>
    </div>
  );
}
