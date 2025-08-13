// app/api/auth/after-sign-in/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { userId, sessionClaims } = auth();
    const url = new URL(req.url);
    const next = url.searchParams.get("next") || "/dashboard";

    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    // Look up local user & profile
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    });

    const profile = user
      ? await prisma.userProfile.findUnique({
          where: { userId: user.id },
          select: { id: true },
        })
      : null;

    const clerkOnboarded =
      (sessionClaims?.publicMetadata as any)?.onboarded === true;

    const isOnboarded = !!profile || clerkOnboarded;

    // Redirect accordingly + set cookie when onboarded
    const dest = isOnboarded ? next : "/onboarding";
    const res = NextResponse.redirect(new URL(dest, req.url), 303);

    if (isOnboarded) {
      res.headers.append(
        "Set-Cookie",
        [
          "onboarded=1",
          "Path=/",
          "Max-Age=2592000", // 30 days
          "HttpOnly",
          "SameSite=Lax",
          process.env.NODE_ENV === "production" ? "Secure" : "",
        ]
          .filter(Boolean)
          .join("; ")
      );
    }

    return res;
  } catch {
    // Fall back to onboarding if anything is odd
    return NextResponse.redirect(new URL("/onboarding", req.url), 303);
  }
}
