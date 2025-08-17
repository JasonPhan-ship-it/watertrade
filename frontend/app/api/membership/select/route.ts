// app/api/membership/select/route.ts
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
    // For premium, this would typically be handled by webhook after payment
    if (plan === "free") {
      // Update Clerk metadata to mark as onboarded with free plan
      await clerkClient.users.updateUser(userId, {
        publicMetadata: { 
          onboarded: true, 
          premium: false,
          plan: "free"
        },
      });

      // Optionally update database subscription status
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: "free",
          subscriptionUpdatedAt: new Date(),
        }
      });

      return NextResponse.json({ 
        ok: true, 
        plan: "free",
        message: "Free plan activated successfully"
      });
    }

    // For premium, redirect to billing (this shouldn't be called directly for premium)
    return NextResponse.json({ 
      error: "Premium plan should be handled through billing checkout" 
    }, { status: 400 });

  } catch (e: any) {
    console.error("Membership select error:", e);
    return NextResponse.json({ 
      error: e?.message || "Failed to select membership plan" 
    }, { status: 500 });
  }
}

// ---

// app/api/subscription/status/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { userId, sessionId } = auth();
    if (!userId || !sessionId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: {
        id: true,
        subscriptionStatus: true,
        subscriptionUpdatedAt: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      }
    });

    if (!user) {
      return NextResponse.json({ 
        isPremium: false, 
        plan: "free", 
        status: "no_user" 
      });
    }

    // Check if user has active premium subscription
    let isPremium = false;
    let subscriptionDetails = null;

    // Check database subscription status
    const dbStatus = user.subscriptionStatus;
    if (dbStatus === "active" || dbStatus === "premium") {
      isPremium = true;
    }

    // If user has Stripe subscription ID, verify with Stripe
    if (user.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
      try {
        // Only import Stripe if we need it
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
          apiVersion: "2024-06-20",
        });

        const subscription = await stripe.subscriptions.retrieve(
          user.stripeSubscriptionId
        );

        subscriptionDetails = {
          id: subscription.id,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        };

        // Update isPremium based on Stripe status
        isPremium = subscription.status === "active" || subscription.status === "trialing";

        // Update database if status changed
        if ((isPremium && dbStatus !== "active") || (!isPremium && dbStatus === "active")) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              subscriptionStatus: isPremium ? "active" : "inactive",
              subscriptionUpdatedAt: new Date(),
            },
          });
        }
      } catch (stripeError) {
        console.error("Stripe subscription check failed:", stripeError);
        // Fall back to database status if Stripe check fails
      }
    }

    return NextResponse.json({
      isPremium,
      plan: isPremium ? "premium" : "free",
      status: user.subscriptionStatus || "free",
      subscriptionDetails,
      lastUpdated: user.subscriptionUpdatedAt,
    });

  } catch (error) {
    console.error("Subscription status check error:", error);
    return NextResponse.json(
      { error: "Failed to check subscription status" },
      { status: 500 }
    );
  }
}
