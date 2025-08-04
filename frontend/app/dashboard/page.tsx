'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient, Listing, Trade } from '@/lib/api';
import { formatPrice, formatQuantity, formatDate } from '@/lib/utils';
import { Droplets, MapPin, Calendar, User, Edit, Trash2, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { user, isSignedIn } = useUser();
  const [listings, setListings] = useState<Listing[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'listings' | 'trades'>('listings');

  useEffect(() => {
    if (isSignedIn) {
      loadDashboardData();
    }
  }, [isSignedIn]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [listingsData, tradesData] = await Promise.all([
        apiClient.getListings(),
        apiClient.getTrades(),
      ]);
      
      // Filter listings to only show user's own listings
      const userListings = listingsData.filter(listing => listing.userId === user?.id);
      setListings(userListings);
      setTrades(tradesData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteListing = async (listingId: string) => {
    if (!confirm('Are you sure you want to delete this listing?')) return;
    
    try {
      await apiClient.deleteListing(listingId);
      setListings(prev => prev.filter(listing => listing.id !== listingId));
      alert('Listing deleted successfully!');
    } catch (error) {
      console.error('Error deleting listing:', error);
      alert('Failed to delete listing. Please try again.');
    }
  };

  const handleUpdateTradeStatus = async (tradeId: string, status: 'COMPLETED' | 'CANCELLED') => {
    try {
      await apiClient.updateTradeStatus(tradeId, { status });
      setTrades(prev => prev.map(trade => 
        trade.id === tradeId ? { ...trade, status } : trade
      ));
      alert('Trade status updated successfully!');
    } catch (error) {
      console.error('Error updating trade status:', error);
      alert('Failed to update trade status. Please try again.');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'CANCELLED':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'PENDING':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'DISPUTED':
        return <AlertCircle className="w-4 h-4 text-orange-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'text-green-600 bg-green-100';
      case 'CANCELLED':
        return 'text-red-600 bg-red-100';
      case 'PENDING':
        return 'text-yellow-600 bg-yellow-100';
      case 'DISPUTED':
        return 'text-orange-600 bg-orange-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  if (!isSignedIn) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>
              Please sign in to access your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/sign-in">
              <Button>Sign In</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-earth-800 mb-2">Dashboard</h1>
        <p className="text-earth-600 text-lg">
          Manage your listings and track your trades
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-white rounded-lg p-1 shadow-sm border mb-6">
        <button
          onClick={() => setActiveTab('listings')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'listings'
              ? 'bg-water-600 text-white'
              : 'text-earth-600 hover:text-earth-800'
          }`}
        >
          My Listings ({listings.length})
        </button>
        <button
          onClick={() => setActiveTab('trades')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'trades'
              ? 'bg-water-600 text-white'
              : 'text-earth-600 hover:text-earth-800'
          }`}
        >
          Trade History ({trades.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-water-600"></div>
        </div>
      ) : (
        <>
          {/* Listings Tab */}
          {activeTab === 'listings' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-earth-800">My Listings</h2>
                <Link href="/create-listing">
                  <Button className="bg-water-600 hover:bg-water-700">
                    Create New Listing
                  </Button>
                </Link>
              </div>

              {listings.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <Droplets className="w-16 h-16 text-earth-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-earth-800 mb-2">No listings yet</h3>
                    <p className="text-earth-600 mb-4">Create your first listing to start trading water resources</p>
                    <Link href="/create-listing">
                      <Button className="bg-water-600 hover:bg-water-700">
                        Create Listing
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {listings.map((listing) => (
                    <Card key={listing.id} className="hover:shadow-lg transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg mb-2">{listing.title}</CardTitle>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              listing.type === 'SALE' ? 'text-green-600 bg-green-100' : 'text-blue-600 bg-blue-100'
                            }`}>
                              {listing.type === 'SALE' ? '💧 For Sale' : '🛒 Buy Request'}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline">
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => handleDeleteListing(listing.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
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
                            <Calendar className="w-4 h-4" />
                            <span>{formatDate(listing.createdAt)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Trades Tab */}
          {activeTab === 'trades' && (
            <div>
              <h2 className="text-2xl font-semibold text-earth-800 mb-6">Trade History</h2>

              {trades.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <Droplets className="w-16 h-16 text-earth-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-earth-800 mb-2">No trades yet</h3>
                    <p className="text-earth-600">Start trading to see your transaction history here</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {trades.map((trade) => (
                    <Card key={trade.id}>
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg">{trade.listing.title}</h3>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(trade.status)}`}>
                                {getStatusIcon(trade.status)} {trade.status}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-earth-600">
                              <div>
                                <span className="font-medium">Quantity:</span> {formatQuantity(trade.quantity, trade.listing.unit)}
                              </div>
                              <div>
                                <span className="font-medium">Total Price:</span> {formatPrice(trade.price)}
                              </div>
                              <div>
                                <span className="font-medium">Date:</span> {formatDate(trade.createdAt)}
                              </div>
                            </div>

                            <div className="mt-3 text-sm text-earth-600">
                              <div className="flex items-center gap-4">
                                <span>
                                  <span className="font-medium">Buyer:</span> {trade.buyer.firstName} {trade.buyer.lastName}
                                </span>
                                <span>
                                  <span className="font-medium">Seller:</span> {trade.seller.firstName} {trade.seller.lastName}
                                </span>
                              </div>
                            </div>
                          </div>

                          {trade.status === 'PENDING' && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleUpdateTradeStatus(trade.id, 'COMPLETED')}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                Complete
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUpdateTradeStatus(trade.id, 'CANCELLED')}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
} 