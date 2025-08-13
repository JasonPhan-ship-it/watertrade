// middleware.ts (Clerk v4-compatible + cookie bypass)
import { withClerkMiddleware, getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

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
  path.startsWith("/sign-up");

export default withClerkMiddleware((req) => {
  const { pathname } = req.nextUrl;

  // Let static files, APIs, and public routes through
  if (isStatic(pathname) || isApi(pathname) || isPublic(pathname)) {
    return NextResponse.next();
  }

  // Clerk auth (v4 style)
  const { userId, sessionClaims } = getAuth(req);

  // If not signed in, send to sign-in
  if (!userId) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Onboarding check
  const onboardedFromClerk =
    (sessionClaims?.publicMetadata as any)?.onboarded === true;

  // ✅ Short-lived cookie set by /api/profile after successful onboarding
  const onboardedCookie = req.cookies.get("onboarded")?.value === "1";

  // Gate: must complete onboarding unless cookie bypass is present
  if (!onboardedFromClerk && !onboardedCookie && pathname !== "/onboarding") {
    const url = req.nextUrl.clone();
    url.pathname = "/onboarding";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // If already onboarded (or bypass cookie present) and they hit /onboarding, send them onward
  if ((onboardedFromClerk || onboardedCookie) && pathname === "/onboarding") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // Run on all routes except static assets
  matcher: ["/((?!.*\\..*|_next).*)"],
};
