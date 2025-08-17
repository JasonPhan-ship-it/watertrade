// lib/api-utils.ts - Centralized API utilities

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

// Standard API error responses
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function createErrorResponse(error: unknown, defaultMessage = "Internal server error") {
  console.error("API Error:", error);
  
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { 
        error: "Validation error", 
        details: error.issues.map(i => ({ path: i.path, message: i.message }))
      },
      { status: 400 }
    );
  }
  
  // Database errors
  if (error && typeof error === 'object' && 'code' in error) {
    const dbError = error as { code: string; message: string };
    
    switch (dbError.code) {
      case 'P2002':
        return NextResponse.json(
          { error: "A record with this information already exists" },
          { status: 409 }
        );
      case 'P2025':
        return NextResponse.json(
          { error: "Record not found" },
          { status: 404 }
        );
      case 'P2003':
        return NextResponse.json(
          { error: "Referenced record does not exist" },
          { status: 400 }
        );
      default:
        break;
    }
  }
  
  return NextResponse.json(
    { error: defaultMessage },
    { status: 500 }
  );
}

// Auth helper with better error handling
export async function requireAuth() {
  const { userId, sessionId } = auth();
  
  if (!userId || !sessionId) {
    throw new ApiError(401, "Authentication required");
  }
  
  return { userId, sessionId };
}

// Validation helper
export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw error; // Will be handled by createErrorResponse
    }
    throw new ApiError(400, "Invalid request body");
  }
}

// Rate limiting helper (simple in-memory)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(
  identifier: string, 
  maxRequests = 100, 
  windowMs = 60000 // 1 minute
): boolean {
  const now = Date.now();
  const current = rateLimitMap.get(identifier);
  
  if (!current || now > current.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (current.count >= maxRequests) {
    return false;
  }
  
  current.count++;
  return true;
}

// Generic API handler wrapper
export function apiHandler<T = any>(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse | T>
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    try {
      const result = await handler(req, context);
      return result instanceof NextResponse ? result : NextResponse.json(result);
    } catch (error) {
      return createErrorResponse(error);
    }
  };
}

// Example usage:
// export const POST = apiHandler(async (req) => {
//   const { userId } = await requireAuth();
//   const body = validateBody(createListingSchema, await req.json());
//   // ... rest of handler
//   return { success: true };
// });
