// app/api/subscription/cancel/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  getStripeClient,
  findStripeCustomer,
  getActiveSubscription,
} from "../_shared";

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const atPeriodEnd = Boolean(body?.atPeriodEnd);

    const stripe = getStripeClient();
    const { stripeCustomerId, localUser } = await findStripeCustomer(stripe, userId);

    const markFree = async (reason: string, changed: boolean) => {
      if (localUser?.id) {
        await prisma.user
          .update({
            where: { id: localUser.id },
            data: {
              subscriptionStatus: "free",
              subscriptionUpdatedAt: new Date(),
              stripeSubscriptionId: null,
            },
          })
          .catch(() => {});
      }
      await clerkClient.users
        .updateUser(userId, {
          publicMetadata: { premium: false, plan: "free" },
        })
        .catch(() => {});
      return NextResponse.json({ ok: true, changed, reason }, { status: 200 });
    };

    if (!stripe) {
      return await markFree("stripe_not_configured", false);
    }

    if (!stripeCustomerId) {
      return await markFree("no_stripe_customer", false);
    }

    const sub = await getActiveSubscription(stripe, stripeCustomerId);
    if (!sub) {
      return await markFree("no_active_subscription", false);
    }

    let result;
    if (atPeriodEnd) {
      result = await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: true,
      });
      // Still premium until period end
      await clerkClient.users.updateUser(userId, {
        publicMetadata: { premium: true },
      }).catch(() => {});
    } else {
      result = await stripe.subscriptions.cancel(sub.id);
      // Immediately not premium
      await clerkClient.users.updateUser(userId, {
        publicMetadata: { premium: false, plan: "free" },
      }).catch(() => {});
    }

    if (localUser?.id) {
      const data: Parameters<typeof prisma.user.update>[0]["data"] = {
        subscriptionUpdatedAt: new Date(),
      };

      if (atPeriodEnd) {
        data.subscriptionStatus = "downgrade_scheduled";
      } else {
        data.subscriptionStatus = "free";
        data.stripeSubscriptionId = null;
      }

      await prisma.user
        .update({
          where: { id: localUser.id },
          data,
        })
        .catch(() => {});
    }

    return NextResponse.json(
      {
        ok: true,
        subscriptionId: result.id,
        status: result.status,
        cancel_at_period_end: result.cancel_at_period_end ?? false,
        current_period_end: result.current_period_end,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
