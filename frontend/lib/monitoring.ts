// lib/monitoring.ts - Application monitoring
import { NextRequest } from 'next/server';

// Performance monitoring
export class PerformanceMonitor {
  private static metrics = new Map<string, number[]>();

  static recordMetric(name: string, value: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const values = this.metrics.get(name)!;
    values.push(value);
    
    // Keep only last 100 measurements
    if (values.length > 100) {
      values.shift();
    }
  }

  static getMetrics() {
    const result: Record<string, { avg: number; min: number; max: number }> = {};
    
    this.metrics.forEach((values, name) => {
      if (values.length > 0) {
        result[name] = {
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
        };
      }
    });
    
    return result;
  }
}

// API performance middleware
export function withPerformanceMonitoring<T extends (...args: any[]) => Promise<any>>(
  handler: T,
  name: string
): T {
  return (async (...args) => {
    const start = performance.now();
    
    try {
      const result = await handler(...args);
      const duration = performance.now() - start;
      
      PerformanceMonitor.recordMetric(`api.${name}.duration`, duration);
      PerformanceMonitor.recordMetric(`api.${name}.success`, 1);
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      
      PerformanceMonitor.recordMetric(`api.${name}.duration`, duration);
      PerformanceMonitor.recordMetric(`api.${name}.error`, 1);
      
      throw error;
    }
  }) as T;
}

// Database query monitoring
export function withQueryMonitoring<T extends (...args: any[]) => Promise<any>>(
  queryFn: T,
  queryName: string
): T {
  return (async (...args) => {
    const start = performance.now();
    
    try {
      const result = await queryFn(...args);
      const duration = performance.now() - start;
      
      PerformanceMonitor.recordMetric(`db.${queryName}.duration`, duration);
      
      // Log slow queries (>1000ms)
      if (duration > 1000) {
        console.warn(`Slow query detected: ${queryName} took ${duration.toFixed(2)}ms`);
      }
      
      return result;
    } catch (error) {
      PerformanceMonitor.recordMetric(`db.${queryName}.error`, 1);
      throw error;
    }
  }) as T;
}

// Error tracking
export class ErrorTracker {
  private static errors: Array<{
    timestamp: Date;
    error: string;
    stack?: string;
    context?: Record<string, any>;
  }> = [];

  static trackError(error: Error, context?: Record<string, any>) {
    this.errors.push({
      timestamp: new Date(),
      error: error.message,
      stack: error.stack,
      context,
    });

    // Keep only last 50 errors
    if (this.errors.length > 50) {
      this.errors.shift();
    }

    // In production, you'd send this to an external service like Sentry
    if (process.env.NODE_ENV === 'production') {
      console.error('Application Error:', {
        message: error.message,
        stack: error.stack,
        context,
      });
    }
  }

  static getErrors() {
    return this.errors;
  }

  static getErrorSummary() {
    const errorCounts: Record<string, number> = {};
    
    this.errors.forEach(({ error }) => {
      errorCounts[error] = (errorCounts[error] || 0) + 1;
    });
    
    return errorCounts;
  }
}

// Health check endpoint
// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PerformanceMonitor, ErrorTracker } from '@/lib/monitoring';

export async function GET() {
  const start = performance.now();
  
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;
    
    const dbDuration = performance.now() - start;
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          status: 'healthy',
          responseTime: `${dbDuration.toFixed(2)}ms`,
        },
      },
      metrics: PerformanceMonitor.getMetrics(),
      errors: ErrorTracker.getErrorSummary(),
    };
    
    return NextResponse.json(health);
  } catch (error) {
    ErrorTracker.trackError(error as Error, { endpoint: '/api/health' });
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      },
      { status: 503 }
    );
  }
}

// Performance analytics component
// components/admin/PerformanceMetrics.tsx
'use client';

import { useEffect, useState } from 'react';

interface Metrics {
  [key: string]: {
    avg: number;
    min: number;
    max: number;
  };
}

export default function PerformanceMetrics() {
  const [metrics, setMetrics] = useState<Metrics>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch('/api/health');
        const data = await response.json();
        setMetrics(data.metrics || {});
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Update every 30s

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="p-4">Loading metrics...</div>;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Performance Metrics</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(metrics).map(([name, values]) => (
          <div key={name} className="p-4 bg-slate-50 rounded-lg">
            <h4 className="font-medium text-sm text-slate-700 mb-2">{name}</h4>
            <div className="space-y-1 text-xs">
              <div>Avg: {values.avg.toFixed(2)}ms</div>
              <div>Min: {values.min.toFixed(2)}ms</div>
              <div>Max: {values.max.toFixed(2)}ms</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Usage in API routes:
// export const GET = withPerformanceMonitoring(async (req: NextRequest) => {
//   const listings = await withQueryMonitoring(
//     () => prisma.listing.findMany(),
//     'listing.findMany'
//   )();
//   
//   return NextResponse.json({ listings });
// }, 'listings.get');
