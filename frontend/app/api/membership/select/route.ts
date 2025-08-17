// app/api/membership/select/route.ts - Safe version without subscription fields
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { userId, sessionId } = auth();
    if (!userId || !sessionId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { plan } = body;

    if (plan !== "free" && plan !== "premium") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Get or create local user
    let user = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!user) {
      const cu = await clerkClient.users.getUser(userId).catch(() => null);
      const email =
        cu?.emailAddresses?.find((e) => e.id === cu?.primaryEmailAddressId)?.emailAddress ??
        cu?.emailAddresses?.[0]?.emailAddress ??
        `${userId}@example.invalid`;

      user = await prisma.user.create({
        data: {
          email,
          name: [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || null,
          clerkId: userId,
        },
      });
    }

    // For free plan, we just mark them as having completed onboarding
    if (plan === "free") {
      try {
        // Update Clerk metadata to mark as onboarded with free plan
        await clerkClient.users.updateUser(userId, {
          publicMetadata: { 
            onboarded: true, 
            premium: false,
            plan: "free"
          },
        });

        // Try to update database subscription status (only if columns exist)
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              subscriptionStatus: "free",
              subscriptionUpdatedAt: new Date(),
            }
          });
        } catch (prismaError: any) {
          // If subscription fields don't exist, just log and continue
          if (prismaError.message?.includes("does not exist") || 
              prismaError.message?.includes("Unknown field") ||
              prismaError.code === "P2000") {
            console.log("Subscription fields not found in database schema, skipping database update");
          } else {
            // Re-throw if it's a different error
            throw prismaError;
          }
        }

        return NextResponse.json({ 
          ok: true, 
          plan: "free",
          message: "Free plan activated successfully"
        });

      } catch (clerkError) {
        console.error("Failed to update Clerk metadata:", clerkError);
        // Still return success if Clerk update fails
        return NextResponse.json({ 
          ok: true, 
          plan: "free",
          message: "Free plan activated (some settings may sync later)",
          warning: "Profile sync incomplete"
        });
      }
    }

    // For premium, this endpoint should not be used
    if (plan === "premium") {
      return NextResponse.json({ 
        error: "Premium upgrades must go through the checkout flow",
        redirectTo: "/pricing/checkout"
      }, { status: 400 });
    }

    return NextResponse.json({ 
      error: "Invalid plan selection" 
    }, { status: 400 });

  } catch (e: any) {
    console.error("Membership select error:", e);
    
    // Provide more specific error messages
    if (e.code === "P2002") {
      return NextResponse.json({ 
        error: "User already exists with this information" 
      }, { status: 409 });
    }
    
    if (e.code === "P2025") {
      return NextResponse.json({ 
        error: "User not found" 
      }, { status: 404 });
    }

    return NextResponse.json({ 
      error: e?.message || "Failed to select membership plan" 
    }, { status: 500 });
  }
}

// Optional: Add a GET endpoint to check current plan status
export async function GET() {
  try {
    const { userId, sessionId } = auth();
    if (!userId || !sessionId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's current plan from Clerk
    const cu = await clerkClient.users.getUser(userId).catch(() => null);
    const clerkPlan = cu?.publicMetadata?.plan || "free";
    const clerkPremium = Boolean(cu?.publicMetadata?.premium);

    // Try to get from database too (safely)
    let dbPlan = "free";
    try {
      const user = await prisma.user.findUnique({ 
        where: { clerkId: userId },
        select: { subscriptionStatus: true }
      });
      dbPlan = user?.subscriptionStatus || "free";
    } catch (prismaError) {
      // Database might not have subscription fields yet, that's OK
      console.log("Subscription fields not available in database");
    }

    return NextResponse.json({
      currentPlan: clerkPlan,
      isPremium: clerkPremium,
      dbStatus: dbPlan,
      onboarded: Boolean(cu?.publicMetadata?.onboarded)
    });

  } catch (e: any) {
    return NextResponse.json({ 
      error: e?.message || "Failed to get plan status" 
    }, { status: 500 });
  }
}
