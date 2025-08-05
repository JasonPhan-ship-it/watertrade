import { useAuth } from '@clerk/nextjs';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface Listing {
  id: string;
  title: string;
  description: string;
  type: 'SALE' | 'BUY_REQUEST';
  quantity: number;
  unit: string;
  price: number;
  district: string;
  status: 'ACTIVE' | 'SOLD' | 'CANCELLED' | 'EXPIRED';
  userId: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    district: string | null;
  };
}

export interface Trade {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  quantity: number;
  price: number;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
  createdAt: string;
  updatedAt: string;
  listing: Listing;
  buyer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    district: string | null;
  };
  seller: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    district: string | null;
  };
}

export interface CreateListingData {
  title: string;
  description: string;
  type: 'SALE' | 'BUY_REQUEST';
  quantity: number;
  unit: string;
  price: number;
  district: string;
}

export interface CreateTradeData {
  listingId: string;
  quantity: number;
}

export interface UpdateTradeStatusData {
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
}

class ApiClient {
  private async getAuthToken(): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    
    // In a real app, you'd get this from Clerk
    // For now, we'll use a simple approach
    return localStorage.getItem('authToken');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getAuthToken();
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // Listings
  async getListings(params?: {
    type?: 'SALE' | 'BUY_REQUEST';
    district?: string;
    status?: string;
  }): Promise<Listing[]> {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.append('type', params.type);
    if (params?.district) searchParams.append('district', params.district);
    if (params?.status) searchParams.append('status', params.status);

    return this.request<Listing[]>(`/api/listings?${searchParams.toString()}`);
  }

  async createListing(data: CreateListingData): Promise<Listing> {
    return this.request<Listing>('/api/listings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateListing(id: string, data: Partial<CreateListingData>): Promise<Listing> {
    return this.request<Listing>(`/api/listings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteListing(id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/listings/${id}`, {
      method: 'DELETE',
    });
  }

  // Trades
  async getTrades(): Promise<Trade[]> {
    return this.request<Trade[]>('/api/trades');
  }

  async createTrade(data: CreateTradeData): Promise<Trade> {
    return this.request<Trade>('/api/trades', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTradeStatus(id: string, data: UpdateTradeStatusData): Promise<Trade> {
    return this.request<Trade>(`/api/trades/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient(); 