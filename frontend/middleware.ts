// middleware.ts
import { withClerkMiddleware, getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Public and protected route checks
const PUBLIC_ROUTES: (string | RegExp)[] = [
  "/", "/onboarding", /^\/sign-in(.*)/, /^\/sign-up(.*)/,
];

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/listings",
  "/create-listing",
  "/analytics",
];

function isPublic(pathname: string) {
  return PUBLIC_ROUTES.some((p) =>
    typeof p === "string" ? p === pathname : p.test(pathname)
  );
}

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
}

export default withClerkMiddleware((req) => {
  const { userId, sessionClaims } = getAuth(req);
  const { pathname } = req.nextUrl;

  // Never redirect APIs (but Clerk still runs so getAuth works there)
  if (pathname.startsWith("/api")) return NextResponse.next();

  // Skip onboarding guard on public pages
  if (isPublic(pathname)) return NextResponse.next();

  // Only guard protected pages
  if (!isProtected(pathname)) return NextResponse.next();

  // Not signed in: let Clerk handle auth flow
  if (!userId) return NextResponse.next();

  // Gate on onboarding flag stored in Clerk public metadata
  const onboarded = (sessionClaims?.publicMetadata as any)?.onboarded === true;
  if (!onboarded && pathname !== "/onboarding") {
    const url = req.nextUrl.clone();
    url.pathname = "/onboarding";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // Run on all routes except Next internals & static assets
  matcher: ["/((?!_next|.*\\..*).*)"],
};
