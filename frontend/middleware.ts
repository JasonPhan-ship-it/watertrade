// middleware.ts - Enhanced security middleware
import { withClerkMiddleware, getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Security headers
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// CSP for production
const contentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.clerk.dev https://*.stripe.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data: https://*.clerk.dev https://images.unsplash.com;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://*.clerk.dev https://api.stripe.com wss://*.clerk.dev;
  frame-src https://*.stripe.com;
`.replace(/\s{2,}/g, ' ').trim();

/** Route classification helpers */
const isStatic = (pathname: string) =>
  pathname.startsWith("/_next") ||
  pathname.startsWith("/favicon") ||
  pathname.startsWith("/images") ||
  pathname.startsWith("/assets") ||
  /\.(?:png|jpg|jpeg|gif|svg|ico|css|js|txt|woff2?)$/i.test(pathname);

const isApi = (pathname: string) => pathname.startsWith("/api");

const isPublic = (pathname: string) =>
  pathname === "/" ||
  pathname.startsWith("/sign-in") ||
  pathname.startsWith("/sign-up") ||
  pathname.startsWith("/privacy") ||
  pathname.startsWith("/terms") ||
  pathname.startsWith("/pricing") ||
  pathname.startsWith("/billing-policy");

const isOnboarding = (pathname: string) => pathname.startsWith("/onboarding");

const isProtected = (pathname: string) =>
  pathname.startsWith("/dashboard") ||
  pathname.startsWith("/listings") ||
  pathname.startsWith("/create-listing") ||
  pathname.startsWith("/analytics") ||
  pathname.startsWith("/account") ||
  pathname.startsWith("/profile") ||
  pathname.startsWith("/admin");

// Rate limiting by IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function isRateLimited(ip: string, limit = 100, windowMs = 60000): boolean {
  const now = Date.now();
  const current = rateLimitMap.get(ip);
  
  if (!current || now > current.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return false;
  }
  
  if (current.count >= limit) {
    return true;
  }
  
  current.count++;
  return false;
}

function redirectTo(url: URL, to: string, nextPathWithQuery: string) {
  const dest = new URL(to, url);
  dest.searchParams.set("redirect_url", nextPathWithQuery);
  return NextResponse.redirect(dest);
}

export default withClerkMiddleware((req) => {
  const { pathname, search } = req.nextUrl;
  const nextPathWithQuery = `${pathname}${search || ""}`;
  
  // Apply security headers to all responses
  const response = NextResponse.next();
  
  // Add security headers
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  // Add CSP in production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  }
  
  // Rate limiting for API routes
  if (isApi(pathname)) {
    const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown';
    if (isRateLimited(ip, 1000, 60000)) { // 1000 requests per minute for API
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: Object.fromEntries(response.headers) }
      );
    }
  }
  
  // Allow static files and public routes
  if (isStatic(pathname) || isApi(pathname) || isPublic(pathname)) {
    return response;
  }

  try {
    const { userId, sessionId, sessionClaims } = getAuth(req);

    // Protected routes require authentication
    if (isProtected(pathname) && (!userId || !sessionId)) {
      return redirectTo(req.nextUrl, "/sign-in", nextPathWithQuery);
    }

    // Onboarding logic
    const onboardedFromClerk =
      (sessionClaims?.publicMetadata as Record<string, unknown> | undefined)?.onboarded === true;

    const cookieVal = req.cookies.get("onboarded")?.value;
    const cookieMatchesUser = !!userId && cookieVal === userId;
    const isOnboarded = onboardedFromClerk || cookieMatchesUser;

    // Redirect to dashboard if already onboarded and trying to access onboarding
    if (isOnboarding(pathname) && isOnboarded) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // Redirect to onboarding if not onboarded and accessing protected routes
    if (isProtected(pathname) && userId && !isOnboarded) {
      return redirectTo(req.nextUrl, "/onboarding", nextPathWithQuery);
    }

    return response;
  } catch (error) {
    console.error("Middleware error:", error);
    
    if (isProtected(pathname)) {
      return redirectTo(req.nextUrl, "/sign-in", nextPathWithQuery);
    }
    
    return response;
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)"],
};

// lib/security.ts - Additional security utilities
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .trim();
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePhoneNumber(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
  return phoneRegex.test(phone);
}

// CSRF protection for forms
export function generateCSRFToken(): string {
  return crypto.randomUUID();
}

export function validateCSRFToken(token: string, sessionToken: string): boolean {
  return token === sessionToken;
}
