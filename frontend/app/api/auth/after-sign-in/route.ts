// app/api/auth/after-sign-in/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { userId, sessionId } = auth();
    if (!userId || !sessionId) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    const { searchParams } = new URL(req.url);
    const nextPath = searchParams.get("next") || "/dashboard";

    // Get user from Clerk
    const clerkUser = await clerkClient.users.getUser(userId).catch(() => null);
    
    // Check if user is already onboarded via Clerk metadata
    const clerkOnboarded = clerkUser?.publicMetadata?.onboarded === true;
    
    if (clerkOnboarded) {
      // User already onboarded, go to intended destination
      return NextResponse.redirect(new URL(nextPath, req.url));
    }

    // Check database onboarding status
    let user = await prisma.user.findUnique({ 
      where: { clerkId: userId },
      include: {
        profile: {
          select: { acceptTerms: true }
        }
      }
    });

    // If user doesn't exist in our DB, create them
    if (!user) {
      const email = clerkUser?.emailAddresses?.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress 
        || clerkUser?.emailAddresses?.[0]?.emailAddress 
        || `${userId}@example.invalid`;

      user = await prisma.user.create({
        data: {
          email,
          name: [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || null,
          clerkId: userId,
        },
        include: {
          profile: {
            select: { acceptTerms: true }
          }
        }
      });
    }

    // Check if user has completed onboarding in database
    const dbOnboarded = user.profile?.acceptTerms === true;
    
    if (dbOnboarded) {
      // Sync Clerk metadata if it's out of date
      if (!clerkOnboarded) {
        await clerkClient.users.updateUser(userId, {
          publicMetadata: { 
            ...clerkUser?.publicMetadata,
            onboarded: true 
          },
        });
      }
      
      // Set cookie for faster future checks
      const response = NextResponse.redirect(new URL(nextPath, req.url));
      response.cookies.set("onboarded", userId, {
        path: "/",
        maxAge: 1800, // 30 minutes
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      
      return response;
    }

    // User needs onboarding
    const onboardingUrl = `/onboarding?next=${encodeURIComponent(nextPath)}`;
    return NextResponse.redirect(new URL(onboardingUrl, req.url));

  } catch (error) {
    console.error("After sign-in redirect error:", error);
    // Fallback to onboarding on any error
    const { searchParams } = new URL(req.url);
    const nextPath = searchParams.get("next") || "/dashboard";
    const onboardingUrl = `/onboarding?next=${encodeURIComponent(nextPath)}`;
    return NextResponse.redirect(new URL(onboardingUrl, req.url));
  }
}
