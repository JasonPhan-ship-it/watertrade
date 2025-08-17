// app/api/billing/checkout/route.ts
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
    const { plan, successUrl } = body;

    if (plan !== "premium") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Get or create user in database
    let user = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!user) {
      const cu = await clerkClient.users.getUser(userId).catch(() => null);
      const email = cu?.emailAddresses?.find(e => e.id === cu?.primaryEmailAddressId)?.emailAddress 
        || cu?.emailAddresses?.[0]?.emailAddress 
        || `${userId}@example.invalid`;

      user = await prisma.user.create({
        data: {
          email,
          name: [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || null,
          clerkId: userId,
        },
      });
    }

    // If Stripe is configured, create checkout session
    if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID) {
      try {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
          apiVersion: "2024-06-20",
        });

        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          line_items: [
            {
              price: process.env.STRIPE_PRICE_ID,
              quantity: 1,
            },
          ],
          success_url: `${process.env.NEXT_PUBLIC_APP_URL}${successUrl || '/dashboard'}?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
          customer_email: user.email.endsWith("@example.invalid") ? undefined : user.email,
          client_reference_id: user.id,
          metadata: {
            clerkId: userId,
            userId: user.id,
          },
          subscription_data: {
            metadata: {
              clerkId: userId,
              userId: user.id,
            },
          },
        });

        // Save Stripe customer ID if returned
        if (session.customer) {
          await prisma.user.update({
            where: { id: user.id },
            data: { stripeCustomerId: session.customer as string },
          });
        }

        return NextResponse.json({ url: session.url });
      } catch (stripeError) {
        console.error("Stripe checkout error:", stripeError);
        // Fall through to fallback
      }
    }

    // Fallback: redirect to pricing page with contact message
    const fallbackUrl = `/pricing?message=${encodeURIComponent("Please contact us to upgrade to Premium. We'll set up a custom plan for your needs.")}`;
    return NextResponse.json({ url: fallbackUrl });

  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

// ---

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
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { stripeCustomerId: true }
    });

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
