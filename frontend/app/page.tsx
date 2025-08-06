"use client";

import { useEffect, useState } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";

export default function DashboardPage() {
  const { isSignedIn } = useUser();
  const { getToken } = useAuth();

  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({ district: "", type: "", sort: "createdAt", order: "desc" });

  const fetchListings = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const query = new URLSearchParams({
        page: page.toString(),
        limit: "5",
        district: filters.district,
        type: filters.type,
        sort: filters.sort,
        order: filters.order,
      }).toString();

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/listings?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to fetch listings");
      const data = await res.json();

      setListings(data.data);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSignedIn) fetchListings();
  }, [isSignedIn, page, filters]);

  if (!isSignedIn) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-3xl font-bold mb-4">Please Sign In</h1>
        <Button className="bg-water-600 hover:bg-water-700">Sign In</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Link href="/create-listing">
          <Button className="bg-water-600 hover:bg-water-700">+ Create Listing</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <Select value={filters.district} onValueChange={(v) => setFilters({ ...filters, district: v })}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by District" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="CENTRAL_VALLEY">Central Valley</SelectItem>
            <SelectItem value="NORTHERN_CALIFORNIA">Northern California</SelectItem>
            <SelectItem value="SOUTHERN_CALIFORNIA">Southern California</SelectItem>
            <SelectItem value="EASTERN_CALIFORNIA">Eastern California</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="SALE">For Sale</SelectItem>
            <SelectItem value="BUY_REQUEST">Buy Request</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.sort} onValueChange={(v) => setFilters({ ...filters, sort: v })}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Sort By" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt">Newest</SelectItem>
            <SelectItem value="price">Price</SelectItem>
            <SelectItem value="quantity">Quantity</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.order} onValueChange={(v) => setFilters({ ...filters, order: v })}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Order" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Descending</SelectItem>
            <SelectItem value="asc">Ascending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Listings */}
      {loading ? (
        <p>Loading listings...</p>
      ) : (
        <div className="grid gap-4">
          {listings.map((listing) => (
            <Card key={listing.id}>
              <CardHeader>
                <CardTitle>{listing.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{listing.description}</p>
                <p className="text-sm text-gray-500">Type: {listing.type}</p>
                <p className="text-sm text-gray-500">
                  {listing.quantity} {listing.unit} @ ${listing.price}
                </p>
                <p className="text-sm text-gray-500">District: {listing.district}</p>
                <p className="text-sm text-gray-500">Contact: {listing.contact}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex justify-center mt-6 gap-2">
        <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          Previous
        </Button>
        <span className="self-center">Page {page} of {totalPages}</span>
        <Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
          Next
        </Button>
      </div>
    </div>
  );
}
