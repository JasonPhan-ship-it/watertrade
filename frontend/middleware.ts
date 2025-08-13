// middleware.ts — Clerk v4-compatible + onboarding gate
import { withClerkMiddleware, getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Static assets we never want to auth-gate
const isStatic = (path: string) =>
  path.startsWith("/_next") ||
  path.startsWith("/favicon") ||
  path.startsWith("/images") ||
  path.startsWith("/assets") ||
  path === "/brand.svg" ||
  /\.(?:png|jpg|jpeg|gif|svg|ico|css|js|txt|woff2?)$/i.test(path);

// Public (unauthenticated) routes
const isPublic = (path: string) =>
  path === "/" ||
  path.startsWith("/sign-in") ||
  path.startsWith("/sign-up");

// APIs: let them through here; protect specific admin APIs inside those route handlers if needed
const isApi = (path: string) => path.startsWith("/api");

export default withClerkMiddleware((req) => {
  const { pathname } = req.nextUrl;

  // Allow static files, public routes, and APIs
  if (isStatic(pathname) || isPublic(pathname) || isApi(pathname)) {
    return NextResponse.next();
  }

  // Clerk auth
  const { userId, sessionClaims } = getAuth(req);

  // Not signed in → redirect to sign-in
  if (!userId) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Onboarding gate:
  // - Either Clerk publicMetadata.onboarded === true
  // - Or a short-lived cookie "onboarded=1" set by your onboarding completion API
  const onboardedFromClerk =
    (sessionClaims?.publicMetadata as any)?.onboarded === true;

  const onboardedCookie = req.cookies.get("onboarded")?.value === "1";

  // If not onboarded, force them through /onboarding
  if (!onboardedFromClerk && !onboardedCookie && pathname !== "/onboarding") {
    const url = req.nextUrl.clone();
    url.pathname = "/onboarding";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // If already onboarded and they hit /onboarding, push them to dashboard
  if ((onboardedFromClerk || onboardedCookie) && pathname === "/onboarding") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

// Run on all routes except files and Next internals
export const config = {
  matcher: ["/((?!.*\\..*|_next).*)"],
};
