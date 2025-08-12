// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtected = createRouteMatcher([
  "/dashboard(.*)",
  "/listings(.*)",
  "/create-listing(.*)",
  "/analytics(.*)",
]);

const isPublic = createRouteMatcher([
  "/",
  "/onboarding",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = auth();
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Always run Clerk on API routes (for auth()), but never redirect them.
  if (pathname.startsWith("/api")) return;

  // Public routes don’t need onboarding
  if (isPublic(req)) return;

  // If the route isn’t protected, do nothing
  if (!isProtected(req)) return;

  // If not signed in, let Clerk handle the redirect to sign-in
  if (!userId) return;

  // Check Clerk public metadata flag set during onboarding
  const onboarded = (sessionClaims?.publicMetadata as any)?.onboarded === true;

  // Force onboarding for first-time users
  if (!onboarded && pathname !== "/onboarding") {
    url.pathname = "/onboarding";
    url.search = "";
    return Response.redirect(url);
  }
});

export const config = {
  // Run on all routes except Next internals and static files.
  // Keep /api included so Clerk auth works there (we just don't redirect APIs above).
  matcher: ["/((?!_next|.*\\..*).*)"],
};
