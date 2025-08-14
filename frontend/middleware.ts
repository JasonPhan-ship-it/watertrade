// middleware.ts
import { withClerkMiddleware, getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/** ---------- Route helpers ---------- */
const isStatic = (path: string) =>
  path.startsWith("/_next") ||
  path.startsWith("/favicon") ||
  path.startsWith("/images") ||
  path.startsWith("/assets") ||
  /\.(?:png|jpg|jpeg|gif|svg|ico|css|js|txt|woff2?)$/i.test(path);

const isApi = (path: string) => path.startsWith("/api");

const isPublic = (path: string) =>
  path === "/" ||
  path.startsWith("/sign-in") ||
  path.startsWith("/sign-up") ||
  path.startsWith("/privacy");

/** ONLY routes that should require auth + onboarding */
const isProtected = (path: string) =>
  path.startsWith("/dashboard") ||
  path.startsWith("/listings") ||
  path.startsWith("/account"); // add/remove as needed
  path.startsWith("/admin"); // ✅

const isOnboarding = (path: string) => path.startsWith("/onboarding");

export default withClerkMiddleware((req) => {
  const { pathname } = req.nextUrl;

  // Always allow these through
  if (isStatic(pathname) || isApi(pathname) || isPublic(pathname)) {
    return NextResponse.next();
  }

  const { userId, sessionClaims } = getAuth(req);

  // If onboarding page without auth -> sign in
  if (isOnboarding(pathname) && !userId) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // If a protected page is hit without auth, send to sign-in
  if (isProtected(pathname) && !userId) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Determine onboarding status (read from unsafeMetadata)
  const claims = sessionClaims as any;
  const onboardedFromClerk = claims?.unsafeMetadata?.onboarded === true;

  // Optional cookie fallback (kept from your version)
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
