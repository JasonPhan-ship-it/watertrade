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
    if (user.stripeSubscriptionId) {
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
