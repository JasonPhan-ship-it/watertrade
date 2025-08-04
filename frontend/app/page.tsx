'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { apiClient, Listing } from '@/lib/api';
import { formatPrice, formatQuantity, formatDate } from '@/lib/utils';
import { Droplets, MapPin, Calendar, User, Plus, Filter } from 'lucide-react';
import Link from 'next/link';

export default function MarketplacePage() {
  const { user, isSignedIn } = useUser();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    type: '',
    district: '',
  });

  useEffect(() => {
    loadListings();
  }, [filters]);

  const loadListings = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getListings({
        type: filters.type as 'SALE' | 'BUY_REQUEST' | undefined,
        district: filters.district || undefined,
        status: 'ACTIVE',
      });
      setListings(data);
    } catch (error) {
      console.error('Error loading listings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTrade = async (listingId: string, quantity: number) => {
    try {
      await apiClient.createTrade({ listingId, quantity });
      alert('Trade initiated successfully!');
      loadListings(); // Refresh listings
    } catch (error) {
      console.error('Error creating trade:', error);
      alert('Failed to create trade. Please try again.');
    }
  };

  const getTypeColor = (type: string) => {
    return type === 'SALE' ? 'text-green-600 bg-green-100' : 'text-blue-600 bg-blue-100';
  };

  const getTypeIcon = (type: string) => {
    return type === 'SALE' ? '💧' : '🛒';
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold text-earth-800 mb-2">
              💧 Water Trading Platform
            </h1>
            <p className="text-earth-600 text-lg">
              Connect with farmers to buy and sell water resources
            </p>
          </div>
          {isSignedIn && (
            <Link href="/create-listing">
              <Button className="bg-water-600 hover:bg-water-700">
                <Plus className="w-4 h-4 mr-2" />
                Create Listing
              </Button>
            </Link>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex items-center gap-4">
            <Filter className="w-5 h-5 text-earth-600" />
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                value={filters.type}
                onValueChange={(value) => setFilters({ ...filters, type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Types</SelectItem>
                  <SelectItem value="SALE">For Sale</SelectItem>
                  <SelectItem value="BUY_REQUEST">Buy Request</SelectItem>
                </SelectContent>
              </Select>

              <Input
                placeholder="Filter by district..."
                value={filters.district}
                onChange={(e) => setFilters({ ...filters, district: e.target.value })}
              />

              <Button
                variant="outline"
                onClick={() => setFilters({ type: '', district: '' })}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Listings Grid */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-water-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {listings.map((listing) => (
            <Card key={listing.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-2">{listing.title}</CardTitle>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(listing.type)}`}>
                        {getTypeIcon(listing.type)} {listing.type === 'SALE' ? 'For Sale' : 'Buy Request'}
                      </span>
                    </div>
                  </div>
                </div>
                <CardDescription className="line-clamp-2">
                  {listing.description}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Droplets className="w-4 h-4 text-water-600" />
                    <span className="font-medium">
                      {formatQuantity(listing.quantity, listing.unit)}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-lg text-earth-800">
                      {formatPrice(listing.price)}
                    </span>
                    <span className="text-earth-600">per {listing.unit}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-earth-600">
                    <MapPin className="w-4 h-4" />
                    <span>{listing.district}</span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-earth-600">
                    <User className="w-4 h-4" />
                    <span>
                      {listing.user.firstName} {listing.user.lastName}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-earth-600">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDate(listing.createdAt)}</span>
                  </div>
                </div>
              </CardContent>

              <CardFooter>
                {isSignedIn && listing.userId !== user?.id && (
                  <Button
                    className="w-full bg-water-600 hover:bg-water-700"
                    onClick={() => handleTrade(listing.id, listing.quantity)}
                  >
                    {listing.type === 'SALE' ? 'Buy Now' : 'Respond to Request'}
                  </Button>
                )}
                {!isSignedIn && (
                  <Link href="/sign-in" className="w-full">
                    <Button className="w-full bg-water-600 hover:bg-water-700">
                      Sign in to Trade
                    </Button>
                  </Link>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {!loading && listings.length === 0 && (
        <div className="text-center py-12">
          <Droplets className="w-16 h-16 text-earth-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-earth-800 mb-2">No listings found</h3>
          <p className="text-earth-600">Try adjusting your filters or create the first listing!</p>
        </div>
      )}
    </div>
  );
} 