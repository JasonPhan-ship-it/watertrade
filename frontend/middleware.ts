// frontend/middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Only these routes require authentication.
 * Everything else remains public.
 */
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/create-listing(.*)",
]);

export default clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) {
    // If user isn't signed in, Clerk will redirect to /sign-in
    auth().protect();
  }
});

/**
 * Run the middleware on all "app" routes except Next internals and static files.
 * (We still only *enforce* auth for routes matched above.)
 */
export const config = {
  matcher: [
    // Skip Next.js internals and static assets
    "/((?!_next|.*\\..*).*)",
    "/",
  ],
};
