// lib/monitoring.ts - Fixed version for deployment
import { NextRequest } from 'next/server';

// Use hrtime for Node.js environment compatibility
const getPerformanceTime = (): number => {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }
  // Fallback for Node.js environment
  const hrTime = process.hrtime();
  return hrTime[0] * 1000 + hrTime[1] / 1e6;
};

// Performance monitoring
class AppPerformanceMonitor {
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
    const start = getPerformanceTime();
    
    try {
      const result = await handler(...args);
      const duration = getPerformanceTime() - start;
      
      AppPerformanceMonitor.recordMetric(`api.${name}.duration`, duration);
      AppPerformanceMonitor.recordMetric(`api.${name}.success`, 1);
      
      return result;
    } catch (error) {
      const duration = getPerformanceTime() - start;
      
      AppPerformanceMonitor.recordMetric(`api.${name}.duration`, duration);
      AppPerformanceMonitor.recordMetric(`api.${name}.error`, 1);
      
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
    const start = getPerformanceTime();
    
    try {
      const result = await queryFn(...args);
      const duration = getPerformanceTime() - start;
      
      AppPerformanceMonitor.recordMetric(`db.${queryName}.duration`, duration);
      
      // Log slow queries (>1000ms)
      if (duration > 1000) {
        console.warn(`Slow query detected: ${queryName} took ${duration.toFixed(2)}ms`);
      }
      
      return result;
    } catch (error) {
      AppPerformanceMonitor.recordMetric(`db.${queryName}.error`, 1);
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

// Export the performance monitor with a different name to avoid conflicts
export const PerformanceMonitor = AppPerformanceMonitor;
