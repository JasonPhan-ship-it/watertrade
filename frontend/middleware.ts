// middleware.ts
import { clerkMiddleware, getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = auth();
  const url = req.nextUrl;

  // ✅ Allow public routes without checks
  if (url.pathname.startsWith("/api") || 
      url.pathname.startsWith("/_next") || 
      url.pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // If not signed in, send to sign-in page
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  // ✅ Cookie bypass for just-onboarded users
  const onboardedCookie = req.cookies.get("onboarded");
  if (onboardedCookie?.value === "1") {
    return NextResponse.next();
  }

  // Check Clerk publicMetadata for onboarding
  const hasOnboarded = sessionClaims?.publicMetadata?.onboarded === true;

  // If they haven't onboarded and aren't on /onboarding, redirect them
  if (!hasOnboarded && url.pathname !== "/onboarding") {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!.*\\..*|_next).*)", // all paths except static files
    "/", 
    "/(api|trpc)(.*)",
  ],
};
