// middleware.ts
import { withClerkMiddleware, getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Static assets, next internals, and typical file extensions
const isStatic = (pathname: string) =>
  pathname.startsWith("/_next") ||
  pathname.startsWith("/favicon") ||
  pathname.startsWith("/api") ||
  /\.(?:png|jpg|jpeg|gif|svg|ico|css|js|txt|woff2?)$/i.test(pathname);

// Public routes that never require auth
const isPublic = (pathname: string) =>
  pathname === "/" ||
  pathname.startsWith("/sign-in") ||
  pathname.startsWith("/sign-up") ||
  pathname.startsWith("/privacy") ||
  pathname.startsWith("/terms") ||
  pathname.startsWith("/pricing");

// App areas that require auth
const isProtected = (pathname: string) =>
  pathname.startsWith("/dashboard") ||
  pathname.startsWith("/listings") ||
  pathname.startsWith("/create-listing") ||
  pathname.startsWith("/analytics") ||
  pathname.startsWith("/profile") ||
  pathname.startsWith("/admin");

// Bypass flag (used by Cancel -> do not trigger any onboarding redirects)
const hasNoCreateBypass = (req: NextRequest) =>
  req.nextUrl.searchParams.get("nocreate") === "1";

export default withClerkMiddleware((req) => {
  const { pathname, searchParams } = req.nextUrl;

  // Allow static files and public routes
  if (isStatic(pathname) || isPublic(pathname)) {
    return NextResponse.next();
  }

  try {
    const { userId } = getAuth(req);

    // Auth gate for protected routes
    if (isProtected(pathname) && !userId) {
      const signInUrl = new URL("/sign-in", req.url);
      // Preserve full path + query so we can return the user correctly
      signInUrl.searchParams.set(
        "redirect_url",
        `${pathname}${searchParams.toString() ? `?${searchParams}` : ""}`
      );
      return NextResponse.redirect(signInUrl);
    }

    // ---- Cancel bypass & deterministic listings tab ----
    // If user intentionally includes ?nocreate=1, never do onboarding redirects here.
    if (pathname === "/dashboard" && hasNoCreateBypass(req)) {
      // Send them directly to the listings tab
      const url = new URL("/dashboard/listings", req.url);
      url.searchParams.set("nocreate", "1");
      return NextResponse.redirect(url);
    }
    // If they already hit the listings tab with nocreate, just let it pass
    if (pathname.startsWith("/dashboard/listings") && hasNoCreateBypass(req)) {
      return NextResponse.next();
    }

    // No other opinionated redirects here—let pages handle normal routing.
    return NextResponse.next();
  } catch (error) {
    console.error("Middleware error:", error);

    // On any error, block protected routes to sign-in (preserving destination)
    if (isProtected(pathname)) {
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set(
        "redirect_url",
        `${pathname}${searchParams.toString() ? `?${searchParams}` : ""}`
      );
      return NextResponse.redirect(signInUrl);
    }

    return NextResponse.next();
  }
});

export const config = {
  // Run on all pages except next internals & files
  matcher: ["/((?!.*\\..*|_next).*)"],
};
