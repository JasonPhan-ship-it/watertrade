// middleware.ts - Simplified version to fix TypeScript errors
import { withClerkMiddleware, getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Simplified route classification
const isStatic = (pathname: string) =>
  pathname.startsWith("/_next") ||
  pathname.startsWith("/favicon") ||
  pathname.startsWith("/api") ||
  /\.(?:png|jpg|jpeg|gif|svg|ico|css|js|txt|woff2?)$/i.test(pathname);

const isPublic = (pathname: string) =>
  pathname === "/" ||
  pathname.startsWith("/sign-in") ||
  pathname.startsWith("/sign-up") ||
  pathname.startsWith("/privacy") ||
  pathname.startsWith("/terms") ||
  pathname.startsWith("/pricing");

const isProtected = (pathname: string) =>
  pathname.startsWith("/dashboard") ||
  pathname.startsWith("/listings") ||
  pathname.startsWith("/create-listing") ||
  pathname.startsWith("/analytics") ||
  pathname.startsWith("/profile") ||
  pathname.startsWith("/admin");

export default withClerkMiddleware((req) => {
  const { pathname } = req.nextUrl;
  
  // Allow static files and public routes
  if (isStatic(pathname) || isPublic(pathname)) {
    return NextResponse.next();
  }

  try {
    const { userId } = getAuth(req);

    // Simplified auth check - just redirect if not signed in
    if (isProtected(pathname) && !userId) {
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect_url", pathname);
      return NextResponse.redirect(signInUrl);
    }

    // Let the app handle onboarding in client components
    // Remove complex middleware onboarding logic
    return NextResponse.next();
    
  } catch (error) {
    console.error("Middleware error:", error);
    
    // On any error, redirect to sign-in for protected routes
    if (isProtected(pathname)) {
      const signInUrl = new URL("/sign-in", req.url);
      return NextResponse.redirect(signInUrl);
    }
    
    return NextResponse.next();
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)"],
};
