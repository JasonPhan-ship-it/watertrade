import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  // Routes that can be accessed while signed out
  publicRoutes: ["/", "/api/listings"],
  // Routes that can always be accessed, and have
  // no authentication information
  ignoredRoutes: ["/api/health"],
});

// ✅ Merge matchers and runtime into a single config export
export const config = {
  matcher: [
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
    "/(api|trpc)(.*)",
    "/((?!_next/static|_next/image|favicon.ico).*)"
  ],
  runtime: "nodejs",
};

