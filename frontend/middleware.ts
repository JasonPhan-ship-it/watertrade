// middleware.ts
import { authMiddleware } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import type { NextMiddleware, NextRequest } from "next/server";

const WESTLANDS_LOGIN_URL = "https://cs.westlandswater.org/cacct/login.asp";
const DEFAULT_WESTLANDS_RETURN = "/onboarding?next=/dashboard";

function buildWestlandsLoginUrl(callbackUrl: string) {
  const westlandsUrl = new URL(WESTLANDS_LOGIN_URL);
  westlandsUrl.searchParams.set("ReturnUrl", callbackUrl);
  westlandsUrl.searchParams.set("ReturnURL", callbackUrl);
  return westlandsUrl.toString();
}

// ---------- Helpers ----------
const isStatic = (pathname: string) =>
  pathname.startsWith("/_next") ||
  pathname.startsWith("/favicon") ||
  pathname.startsWith("/api") ||
  /\.(?:png|jpg|jpeg|gif|svg|ico|css|js|txt|woff2?)$/i.test(pathname);

const publicRoutes = [
  "/",
  "/sign/:path*",
  "/sign-in",
  "/sign-up",
  "/privacy",
  "/terms",
  "/pricing",
];

const isPublic = (pathname: string) =>
  pathname === "/" ||
  pathname.startsWith("/sign/") || // ensure /sign/* remains public
  pathname.startsWith("/sign-in") ||
  pathname.startsWith("/sign-up") ||
  pathname.startsWith("/privacy") ||
  pathname.startsWith("/terms") ||
  pathname.startsWith("/pricing");

const isProtected = (pathname: string) =>
  pathname.startsWith("/dashboard") ||
  pathname.startsWith("/listings") ||
  pathname.startsWith("/create-listing") ||
  pathname.startsWith("/analytics") ||
  pathname.startsWith("/profile") ||
  pathname.startsWith("/admin");

const hasNoCreateBypass = (req: NextRequest) =>
  req.nextUrl.searchParams.get("nocreate") === "1";

// CSP used only for /sign/*
function signCsp(): string {
  // Include both demo (*.docusign.net) and prod (*.docusign.com) hosts.
  // Keep Clerk for auth widgets.
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",

    [
      "connect-src 'self'",
      "https://demo.docusign.net",
      "https://app.docusign.com",
      "https://account-d.docusign.com",
      "https://account.docusign.com",
      "https://*.docusign.net",
      "https://*.docusign.com",
      "https://*.clerk.com",
      "https://*.clerk.dev",
      "https://*.clerk.accounts.dev",
    ].join(" "),

    [
      "frame-src 'self'",
      "https://demo.docusign.net",
      "https://app.docusign.com",
      "https://*.docusign.net",
      "https://*.docusign.com",
    ].join(" "),

    "form-action 'self' https://*.docusign.net https://*.docusign.com",
    "img-src 'self' data: blob: https://*.docusign.net https://*.docusign.com",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",

    [
      "script-src 'self' 'unsafe-inline'",
      "https://*.clerk.com",
      "https://*.clerk.dev",
      "https://*.clerk.accounts.dev",
    ].join(" "),

    "worker-src 'self' blob:",
  ].join("; ");
}

const rawSecretKey =
  (process.env.CLERK_SECRET_KEY ?? process.env.CLERK_API_KEY ?? "").trim();
const rawFrontendKey =
  (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_CLERK_FRONTEND_API ??
    "").trim();

const clerkMiddlewareEnabled = rawSecretKey.length > 0 && rawFrontendKey.length > 0;

let loggedMissingConfig = false;

const logMissingClerkConfig = () => {
  if (loggedMissingConfig) return;
  loggedMissingConfig = true;
  console.warn(
    "[middleware] Clerk keys missing – skipping auth middleware. Set CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to enable it.",
  );
};

type AuthContext = {
  userId?: string | null;
};

const handleRequest = (req: NextRequest, auth: AuthContext) => {
  const { pathname, searchParams } = req.nextUrl;

  // Always allow static files and public routes
  if (isStatic(pathname) || isPublic(pathname)) {
    const res = NextResponse.next();

    // For /sign/* add CSP header (mirrors next.config.mjs, but applied at edge too)
    if (pathname.startsWith("/sign/")) {
      res.headers.set("Content-Security-Policy", signCsp());
      // Ensure nothing upstream adds a blocking X-Frame-Options on these pages
      res.headers.delete("X-Frame-Options");
    }

    return res;
  }

  // Server-side redirect to the official Westlands portal
  if (pathname === "/westlands/connect") {
    const callbackUrl = new URL("/westlands/callback", req.url);
    const nextParam = searchParams.get("next") ?? DEFAULT_WESTLANDS_RETURN;
    callbackUrl.searchParams.set("next", nextParam);

    const westlandsUrl = buildWestlandsLoginUrl(callbackUrl.toString());
    return NextResponse.redirect(westlandsUrl);
  }

  // Skip Clerk enforcement entirely when not configured
  if (!clerkMiddlewareEnabled) {
    logMissingClerkConfig();
    return NextResponse.next();
  }

  const { userId } = auth;

  // Auth gate for protected routes
  if (isProtected(pathname) && !userId) {
    const signInUrl = new URL("/sign-in", req.url);
    const originalPath = `${pathname}${searchParams.toString() ? `?${searchParams}` : ""}`;
    const afterSignInUrl = `/api/auth/after-sign-in?next=${encodeURIComponent(originalPath)}`;
    signInUrl.searchParams.set("redirect_url", afterSignInUrl);
    return NextResponse.redirect(signInUrl);
  }

  // ---- Cancel bypass & deterministic listings tab ----
  if (pathname === "/dashboard" && hasNoCreateBypass(req)) {
    const url = new URL("/dashboard/listings", req.url);
    url.searchParams.set("nocreate", "1");
    return NextResponse.redirect(url);
  }  

  if (pathname.startsWith("/dashboard/listings") && hasNoCreateBypass(req)) {
    return NextResponse.next();
  }
};

const clerkMiddleware: NextMiddleware = clerkMiddlewareEnabled
  ? authMiddleware({
      publicRoutes,
      async afterAuth(auth, req) {
        return handleRequest(req, auth);
      },
    })
  : (req) => handleRequest(req, {});

export default clerkMiddleware;

export const config = {
  // Run on all pages except next internals & files
  matcher: ["/((?!.*\\..*|_next).*)"],
};
