// app/api/auth/after-sign-in/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

function safeNext(raw: string | null | undefined): string {
  // Only allow relative paths on this origin. Block // and absolute URLs.
  const fallback = "/dashboard";
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

function onboardedCookie(value: string) {
  return [
    `onboarded=${encodeURIComponent(value)}`,
    "Path=/",
    "Max-Age=2592000", // 30 days
    "HttpOnly",
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export async function GET(req: Request) {
  try {
    const { userId } = auth();
    const url = new URL(req.url);
    const nextPath = safeNext(url.searchParams.get("next"));

    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", url.origin), 303);
    }

    // Look up local user & profile
    const localUser = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    });

    const profileExists = localUser
      ? !!(await prisma.userProfile.findUnique({
          where: { userId: localUser.id },
          select: { id: true },
        }))
      : false;

    // If no profile, check Clerk publicMetadata as a secondary signal
    let clerkOnboarded = false;
    if (!profileExists) {
      const cu = await clerkClient.users.getUser(userId).catch(() => null);
      clerkOnboarded = cu?.publicMetadata?.onboarded === true;
    }

    const isOnboarded = profileExists || clerkOnboarded;

    if (!isOnboarded) {
      // Send new users to onboarding, preserving intended destination
      return NextResponse.redirect(
        new URL(`/onboarding?next=${encodeURIComponent(nextPath)}`, url.origin),
        303
      );
    }

    // Onboarded: set cookie and continue to next
    const res = NextResponse.redirect(new URL(nextPath, url.origin), 303);
    res.headers.append("Set-Cookie", onboardedCookie(userId));
    return res;
  } catch {
    // Fall back to onboarding if anything is odd
    const url = new URL(req.url);
    return NextResponse.redirect(new URL("/onboarding", url.origin), 303);
  }
}
