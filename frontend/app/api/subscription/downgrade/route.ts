import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  getStripeClient,
  findStripeCustomer,
  getActiveSubscription,
} from "../_shared";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const atPeriodEnd = body?.atPeriodEnd !== false; // default true

    const stripe = getStripeClient();
    const { stripeCustomerId, localUser, email } = await findStripeCustomer(stripe, userId);

    if (!localUser?.id) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updateLocal = async (data: Record<string, unknown>) => {
      await prisma.user
        .update({
          where: { id: localUser.id! },
          data: {
            subscriptionUpdatedAt: new Date(),
            ...data,
          },
        })
        .catch(() => {});
    };

    const updateClerk = async (metadata: Record<string, unknown>) => {
      await clerkClient.users
        .updateUser(userId, {
          publicMetadata: metadata,
        })
        .catch(() => {});
    };

    const markFree = async (reason: string, changed: boolean) => {
      await updateLocal({ subscriptionStatus: "free", stripeSubscriptionId: null });
      await updateClerk({ premium: false, plan: "free", downgradeScheduled: false });
      return NextResponse.json({ ok: true, changed, reason }, { status: 200 });
    };

    if (!stripe) {
      return await markFree("stripe_not_configured", false);
    }

    if (!stripeCustomerId) {
      return await markFree("no_stripe_customer", false);
    }

    let sub = await getActiveSubscription(stripe, stripeCustomerId);
    if (!sub) {
      const trialing = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: "trialing",
        limit: 1,
      });
      sub = trialing.data?.[0] || null;
    }

    if (!sub) {
      return await markFree("no_active_subscription", false);
    }

    let result;
    if (atPeriodEnd) {
      result = await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: true,
        metadata: {
          ...sub.metadata,
          downgradeRequestedAt: new Date().toISOString(),
          downgradeReason: "self_service_free",
        },
      });

      await updateLocal({ subscriptionStatus: "downgrade_scheduled" });
      const cancelTimestamp = result.cancel_at ?? result.current_period_end ?? null;
      await updateClerk({
        premium: true,
        plan: "premium",
        downgradeScheduled: true,
        planEndsAt: cancelTimestamp ? new Date(cancelTimestamp * 1000).toISOString() : null,
      });
    } else {
      result = await stripe.subscriptions.cancel(sub.id);

      await updateLocal({
        subscriptionStatus: "free",
        stripeSubscriptionId: null,
      });
      await updateClerk({ premium: false, plan: "free", downgradeScheduled: false, planEndsAt: null });

      if (email) {
        try {
          const { sendEmail } = await import("@/lib/email");
          await sendEmail({
            to: email,
            subject: "Your Water Traders subscription has been downgraded",
            html: `
              <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 16px;">
                <h2 style="color:#004434;">You're back on the Free plan</h2>
                <p>We've confirmed your downgrade to the Free plan effective immediately.</p>
                <p style="margin-top: 16px;">You can re-upgrade anytime from your billing settings if you miss the premium tools.</p>
              </div>
            `,
          });
        } catch (emailErr) {
          console.error("[subscription/downgrade] email error", emailErr);
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        downgraded: true,
        subscriptionId: result.id,
        status: result.status,
        cancel_at_period_end: result.cancel_at_period_end ?? false,
        current_period_end: result.current_period_end,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[subscription/downgrade] error", error);
    return NextResponse.json({ error: error?.message || "Unexpected error" }, { status: 500 });
  }
}
