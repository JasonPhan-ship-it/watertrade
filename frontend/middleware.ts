// middleware.ts
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
  path.startsWith("/sign-up") ||
  path.startsWith("/privacy"); // add any other public pages here

export default withClerkMiddleware((req) => {
  const { pathname } = req.nextUrl;
  if (isStatic(pathname) || isApi(pathname) || isPublic(pathname)) {
    return NextResponse.next();
  }

  const { userId, sessionClaims } = getAuth(req);

  if (!userId) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const onboardedFromClerk =
    (sessionClaims?.publicMetadata as any)?.onboarded === true;

  // NEW: cookie must equal the *current* Clerk userId
  const onboardedCookie = req.cookies.get("onboarded")?.value;
  const cookieMatchesUser = onboardedCookie === userId;

  if (!onboardedFromClerk && !cookieMatchesUser && pathname !== "/onboarding") {
    const url = req.nextUrl.clone();
    url.pathname = "/onboarding";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if ((onboardedFromClerk || cookieMatchesUser) && pathname === "/onboarding") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)"],
};
