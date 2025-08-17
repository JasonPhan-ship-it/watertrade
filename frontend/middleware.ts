// middleware.ts
import { withClerkMiddleware, getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/** ---------- Route helpers ---------- */
const isStatic = (pathname: string) =>
  pathname.startsWith("/_next") ||
  pathname.startsWith("/favicon") ||
  pathname.startsWith("/images") ||
  pathname.startsWith("/assets") ||
  /\.(?:png|jpg|jpeg|gif|svg|ico|css|js|txt|woff2?)$/i.test(pathname);

// Let all API routes pass through middleware quickly (auth happens in handlers)
const isApi = (pathname: string) => pathname.startsWith("/api");

// Public, unauthenticated routes
const isPublic = (pathname: string) =>
  pathname === "/" ||
  pathname.startsWith("/sign-in") ||
  pathname.startsWith("/sign-up") ||
  pathname.startsWith("/privacy") ||
  pathname.startsWith("/terms") ||
  pathname.startsWith("/pricing"); // Add pricing to public routes

// Onboarding flow
const isOnboarding = (pathname: string) => pathname.startsWith("/onboarding");

// Auth-required app surfaces
const isProtected = (pathname: string) =>
  pathname.startsWith("/dashboard") ||
  pathname.startsWith("/listings") ||
  pathname.startsWith("/create-listing") ||
  pathname.startsWith("/analytics") ||
  pathname.startsWith("/account") ||
  pathname.startsWith("/profile") ||
  pathname.startsWith("/admin");

/** Build a redirect preserving the intended destination */
function redirectTo(url: URL, to: string, nextPathWithQuery: string) {
  const dest = new URL(to, url);
  dest.searchParams.set("redirect_url", nextPathWithQuery);
  return NextResponse.redirect(dest);
}

export default withClerkMiddleware((req) => {
  const { pathname, search } = req.nextUrl;
  const nextPathWithQuery = `${pathname}${search || ""}`;

  // Always allow these through
  if (isStatic(pathname) || isApi(pathname) || isPublic(pathname)) {
    return NextResponse.next();
  }

  try {
    const { userId, sessionId, sessionClaims } = getAuth(req);

    // If a protected page is hit without auth, send to sign-in and return here
    if (isProtected(pathname) && (!userId || !sessionId)) {
      return redirectTo(req.nextUrl, "/sign-in", nextPathWithQuery);
    }

    // Single source of truth for onboarding (avoid ping-pong):
    // Prefer Clerk publicMetadata; cookie only as a soft helper.
    const onboardedFromClerk =
      (sessionClaims?.publicMetadata as Record<string, unknown> | undefined)?.onboarded === true;

    const cookieVal = req.cookies.get("onboarded")?.value;
    const cookieMatchesUser = !!userId && cookieVal === userId;

    const isOnboarded = onboardedFromClerk || cookieMatchesUser;

    // If user tries to visit onboarding after being onboarded, route to dashboard
    if (isOnboarding(pathname) && isOnboarded) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // If user hits a protected route but isn't onboarded yet, send to onboarding and come back
    if (isProtected(pathname) && userId && !isOnboarded) {
      return redirectTo(req.nextUrl, "/onboarding", nextPathWithQuery);
    }

    // Otherwise allow
    return NextResponse.next();
  } catch (error) {
    // Log middleware errors but don't crash
    console.error("Middleware error:", error);
    
    // For protected routes with errors, redirect to sign-in
    if (isProtected(pathname)) {
      return redirectTo(req.nextUrl, "/sign-in", nextPathWithQuery);
    }
    
    // For other routes, allow through
    return NextResponse.next();
  }
});

export const config = {
  // Run on all routes except static assets and Next internals
  matcher: ["/((?!.*\\..*|_next).*)"],
};
