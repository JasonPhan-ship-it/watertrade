// app/api/billing/stripe-webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  
  if (!whSecret || !key) {
    return NextResponse.json({ error: "Stripe env missing" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();

  try {
    const StripeMod = await import("stripe");
    const Stripe = StripeMod.default || StripeMod;
    const stripe = new Stripe(key, { apiVersion: "2024-06-20" });

    const evt = stripe.webhooks.constructEvent(raw, sig!, whSecret);

    switch (evt.type) {
      case "checkout.session.completed": {
        const session = evt.data.object;
        const clerkId = session.metadata?.clerkId;
        const localUserId = session.client_reference_id;

        console.log("Checkout completed:", { clerkId, localUserId, customerId: session.customer });

        // Update user subscription status in database
        if (localUserId) {
          await prisma.user.update({
            where: { id: localUserId },
            data: {
              subscriptionStatus: "active",
              subscriptionUpdatedAt: new Date(),
              stripeCustomerId: session.customer as string,
            },
          });
        }

        // Update Clerk metadata
        if (clerkId) {
          await clerkClient.users.updateUser(clerkId, {
            publicMetadata: { 
              premium: true,
              onboarded: true, // Ensure they're marked as onboarded too
              plan: "premium"
            },
          });
        }

        // Send welcome email (optional)
        try {
          const { sendEmail, appUrl } = await import("@/lib/email");
          const email = session.customer_details?.email;
          
          if (email) {
            await sendEmail({
              to: email,
              subject: "Welcome to Water Traders Premium! 🎉",
              html: `
                <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #004434; margin-bottom: 20px;">Welcome to Premium!</h2>
                  <p>Your Water Traders Premium subscription is now active. You now have access to:</p>
                  <ul style="margin: 16px 0; padding-left: 20px;">
                    <li>Early access to new listings</li>
                    <li>Advanced analytics & historical pricing</li>
                    <li>District window alerts (email/SMS)</li>
                    <li>Saved searches & instant notifications</li>
                    <li>Bulk bid tools & offer history</li>
                    <li>Priority support</li>
                  </ul>
                  <p style="margin: 20px 0;">
                    <a href="${appUrl("/dashboard")}" 
                       style="background: #004434; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
                      Go to Dashboard
                    </a>
                  </p>
                  <p style="color: #666; font-size: 14px; margin-top: 30px;">
                    If you have any questions, please contact our support team.
                  </p>
                </div>
              `,
            });
          }
        } catch (emailError) {
          console.error("Failed to send welcome email:", emailError);
          // Don't fail the webhook for email errors
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = evt.data.object;
        const subscriptionId = invoice.subscription;
        
        if (subscriptionId) {
          // Update subscription status for recurring payments
          const user = await prisma.user.findFirst({
            where: { stripeSubscriptionId: subscriptionId as string }
          });
          
          if (user) {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                subscriptionStatus: "active",
                subscriptionUpdatedAt: new Date(),
              },
            });

            // Update Clerk metadata
            if (user.clerkId) {
              await clerkClient.users.updateUser(user.clerkId, {
                publicMetadata: { premium: true, plan: "premium" },
              });
            }
          }
        }
        break;
      }

      case "customer.subscription.created": {
        const subscription = evt.data.object;
        const customerId = subscription.customer;
        
        // Link subscription ID to user
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId as string }
        });
        
        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: { 
              stripeSubscriptionId: subscription.id,
              subscriptionStatus: subscription.status === "active" ? "active" : "pending",
              subscriptionUpdatedAt: new Date(),
            },
          });
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = evt.data.object;
        const user = await prisma.user.findFirst({
          where: { stripeSubscriptionId: subscription.id }
        });

        if (user) {
          const isActive = subscription.status === "active" || subscription.status === "trialing";
          
          await prisma.user.update({
            where: { id: user.id },
            data: {
              subscriptionStatus: isActive ? "active" : "inactive",
              subscriptionUpdatedAt: new Date(),
            },
          });

          // Update Clerk metadata
          if (user.clerkId) {
            await clerkClient.users.updateUser(user.clerkId, {
              publicMetadata: { 
                premium: isActive,
                plan: isActive ? "premium" : "free"
              },
            });
          }
        }
        break;
      }

      default:
        console.log(`Unhandled webhook event type: ${evt.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return NextResponse.json(
      { error: "Webhook handler error" }, 
      { status: 400 }
    );
  }
}
