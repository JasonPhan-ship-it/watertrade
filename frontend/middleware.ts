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

const isApi = (pathname: string) => pathname.startsWith("/api");

const isPublic = (pathname: string) =>
  pathname === "/" ||
  pathname.startsWith("/sign-in") ||
  pathname.startsWith("/sign-up") ||
  pathname.startsWith("/privacy");

/** ONLY routes that should require auth + onboarding */
const isProtected = (pathname: string) =>
  pathname.startsWith("/dashboard") ||
  pathname.startsWith("/listings") ||
  pathname.startsWith("/account") ||
  pathname.startsWith("/admin"); // ← keep this inside the expression

const isOnboarding = (pathname: string) => pathname.startsWith("/onboarding");

export default withClerkMiddleware((req) => {
  const { pathname } = req.nextUrl;

  // Always allow these through
  if (isStatic(pathname) || isApi(pathname) || isPublic(pathname)) {
    return NextResponse.next();
  }

  const { userId, sessionClaims } = getAuth(req);

  // If a protected page is hit without auth, send to sign-in
  if (isProtected(pathname) && !userId) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Determine onboarding status
  const onboardedFromClerk =
    (sessionClaims?.publicMetadata as Record<string, unknown> | undefined)?.onboarded === true;

  // Optional cookie fallback
  const cookieVal = req.cookies.get("onboarded")?.value;
  const cookieMatchesUser = !!userId && cookieVal === userId;

  // If user is already onboarded but tries to visit onboarding, push to dashboard
  if (isOnboarding(pathname) && (onboardedFromClerk || cookieMatchesUser)) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // If user hits a protected route but isn't onboarded yet, send to onboarding
  if (isProtected(pathname) && !(onboardedFromClerk || cookieMatchesUser)) {
    const url = req.nextUrl.clone();
    url.pathname = "/onboarding";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Otherwise allow
  return NextResponse.next();
});

export const config = {
  // Run on all routes except static assets and Next internals
  matcher: ["/((?!.*\\..*|_next).*)"],
};
