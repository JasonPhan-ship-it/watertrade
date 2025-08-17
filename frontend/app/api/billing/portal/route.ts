// app/api/billing/portal/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const { userId, sessionId } = auth();
    if (!userId || !sessionId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user with Stripe customer ID
    let user;
    try {
      user = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { stripeCustomerId: true }
      });
    } catch (prismaError: any) {
      // If stripeCustomerId field doesn't exist in schema
      if (prismaError.message?.includes("Unknown field")) {
        return NextResponse.json(
          { error: "Billing portal not available - subscription fields not configured" },
          { status: 503 }
        );
      }
      throw prismaError;
    }

    if (!user?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No billing account found" },
        { status: 404 }
      );
    }

    // Create Stripe billing portal session
    if (process.env.STRIPE_SECRET_KEY) {
      try {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
          apiVersion: "2024-06-20",
        });

        const session = await stripe.billingPortal.sessions.create({
          customer: user.stripeCustomerId,
          return_url: `${process.env.NEXT_PUBLIC_APP_URL}/profile`,
        });

        return NextResponse.json({ url: session.url });
      } catch (stripeError) {
        console.error("Stripe portal error:", stripeError);
        return NextResponse.json(
          { error: "Failed to create billing portal session" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: "Billing portal not available" },
      { status: 503 }
    );

  } catch (error) {
    console.error("Billing portal error:", error);
    return NextResponse.json(
      { error: "Failed to access billing portal" },
      { status: 500 }
    );
  }
}
