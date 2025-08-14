// app/api/billing/stripe-webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";
import { sendEmail, appUrl } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!secret || !stripeKey) {
    return NextResponse.json({ error: "Stripe webhook env missing" }, { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();

  let evt: Stripe.Event;
  try {
    evt = stripe.webhooks.constructEvent(raw, sig!, secret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err?.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (evt.type === "checkout.session.completed") {
      const s = evt.data.object as Stripe.Checkout.Session;
      const clerkId = (s.metadata?.clerkId as string) || null;
      const localUserId = (s.client_reference_id as string) || null;

      // Mark user as premium (Clerk publicMetadata) and optionally log notification
      if (clerkId) {
        await clerkClient.users.updateUser(clerkId, {
          publicMetadata: { premium: true },
        });
      }

      // Send confirmation email
      const email =
        (s.customer_details?.email as string) ||
        (await (async () => {
          if (!localUserId) return null;
          const user = await prisma.user.findUnique({ where: { id: localUserId } });
          return user?.email ?? null;
        })());

      if (email) {
        await sendEmail({
          to: email,
          subject: "Your Water Traders Premium subscription is active",
          html: `
            <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;">
              <h2>Welcome to Premium 🎉</h2>
              <p>Thanks for upgrading. You now have access to full listings, early access alerts, and advanced analytics.</p>
              <p>
                <a href="${appUrl("/dashboard")}" target="_blank">Go to your dashboard</a>
              </p>
            </div>
          `,
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }
}
