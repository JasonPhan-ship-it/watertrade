// frontend/middleware.ts
import { authMiddleware } from "@clerk/nextjs";

/**
 * We don’t need to list public routes here because we’ll scope the middleware
 * to protected paths via `config.matcher` below. Anything matched here and not
 * listed as public will require auth automatically.
 */
export default authMiddleware({
  // Keep APIs public (and skip auth logic entirely for them)
  publicRoutes: ["/api/(.*)", "/sign-in(.*)", "/sign-up(.*)"],
  ignoredRoutes: ["/api/(.*)"],
});

/**
 * Run the middleware ONLY on these paths. Since they are not in `publicRoutes`,
 * Clerk will require authentication and redirect to /sign-in if needed.
 */
export const config = {
  matcher: [
    "/dashboard(.*)",
    "/create-listing(.*)",
  ],
};
