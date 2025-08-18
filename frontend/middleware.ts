// middleware.ts - Enhanced version with better routing and security
import { authMiddleware } from "@clerk/nextjs";
import { NextResponse } from "next/server";

// Static file patterns - improved regex and added more file types
const isStaticFile = (pathname: string): boolean => {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/brand") ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/icons/") ||
    /\.(?:png|jpe?g|gif|svg|ico|css|js|txt|woff2?|ttf|otf|eot|map|json|xml|pdf)$/i.test(pathname)
  );
};

// API routes that should be handled separately
const isApiRoute = (pathname: string): boolean => {
  return pathname.startsWith("/api/");
};

// Public routes that don't require authentication
const isPublicRoute = (pathname: string): boolean => {
  const publicPaths = [
    "/",
    "/about",
    "/how-it-works",
    "/pricing",
    "/privacy",
    "/terms",
    "/contact",
    "/marketplace", // Allow public browsing of marketplace
    "/listings", // Allow viewing individual listings
  ];
  
  return (
    publicPaths.includes(pathname) ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/sso-callback")
  );
};

// Routes that require authentication
const isProtectedRoute = (pathname: string): boolean => {
  const protectedPrefixes = [
    "/dashboard",
    "/profile",
    "/onboarding",
    "/create-listing",
    "/my-listings",
    "/transactions",
    "/offers",
    "/analytics",
    "/admin",
    "/settings",
  ];
  
  return protectedPrefixes.some(prefix => pathname.startsWith(prefix));
};

// Admin-only routes
const isAdminRoute = (pathname: string): boolean => {
  return pathname.startsWith("/admin");
};

// Routes that require completed onboarding
const requiresOnboarding = (pathname: string): boolean => {
  const onboardingRequiredPaths = [
    "/dashboard",
    "/create-listing",
    "/my-listings",
    "/transactions",
    "/offers",
    "/analytics",
    "/settings",
  ];
  
  return onboardingRequiredPaths.some(path => pathname.startsWith(path));
};

export default authMiddleware({
  // Public routes that Clerk should ignore
  publicRoutes: [
    "/",
    "/about",
    "/how-it-works",
    "/pricing", 
    "/privacy",
    "/terms",
    "/contact",
    "/marketplace(.*)",
    "/listings(.*)",
    "/api/webhooks(.*)",
    "/api/health",
  ],
  
  // Routes that should be ignored by Clerk entirely
  ignoredRoutes: [
    "/((?!api|trpc))(_next.*|.+\\.[\\w]+$)",
    "/api/webhooks(.*)",
  ],

  // Custom middleware logic
  beforeAuth: (req) => {
    const { pathname } = req.nextUrl;
    
    // Skip middleware for static files
    if (isStaticFile(pathname)) {
      return NextResponse.next();
    }
    
    // Handle API routes separately if needed
    if (isApiRoute(pathname)) {
      // Add any API-specific logic here
      return NextResponse.next();
    }
  },

  afterAuth: (auth, req) => {
    const { pathname } = req.nextUrl;
    const { userId, sessionClaims } = auth;
    
    // Skip processing for static files and API routes
    if (isStaticFile(pathname) || isApiRoute(pathname)) {
      return NextResponse.next();
    }

    // Handle unauthenticated users
    if (!userId) {
      // Allow access to public routes
      if (isPublicRoute(pathname)) {
        return NextResponse.next();
      }
      
      // Redirect to sign-in for protected routes
      if (isProtectedRoute(pathname)) {
        const signInUrl = new URL("/sign-in", req.url);
        signInUrl.searchParams.set("redirect_url", pathname);
        return NextResponse.redirect(signInUrl);
      }
      
      return NextResponse.next();
    }

    // User is authenticated - handle protected routes
    if (userId) {
      // Check admin access
      if (isAdminRoute(pathname)) {
        const userRole = sessionClaims?.metadata?.role || sessionClaims?.publicMetadata?.role;
        if (userRole !== "ADMIN") {
          return NextResponse.redirect(new URL("/dashboard", req.url));
        }
      }

      // Check onboarding status for routes that require it
      if (requiresOnboarding(pathname)) {
        const isOnboarded = sessionClaims?.metadata?.onboarded || sessionClaims?.publicMetadata?.onboarded;
        
        if (!isOnboarded && !pathname.startsWith("/onboarding")) {
          return NextResponse.redirect(new URL("/onboarding", req.url));
        }
      }

      // Redirect from auth pages if already signed in
      if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) {
        const isOnboarded = sessionClaims?.metadata?.onboarded || sessionClaims?.publicMetadata?.onboarded;
        const redirectTo = isOnboarded ? "/dashboard" : "/onboarding";
        return NextResponse.redirect(new URL(redirectTo, req.url));
      }
    }

    return NextResponse.next();
  },

  // Enable debug logs in development
  debug: process.env.NODE_ENV === "development",
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
