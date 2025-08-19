// app/api/subscription/cancel/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

async function findStripeCustomerId(userId: string) {
  const localUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  let stripeCustomerId: string | null =
    // @ts-ignore - add the field in your schema if present
    (localUser as any)?.stripeCustomerId || null;

  if (!stripeCustomerId) {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: localUser?.id || "" },
    }).catch(() => null);
    // @ts-ignore - add the field in your schema if present
    stripeCustomerId = (profile as any)?.stripeCustomerId || null;
  }

  if (stripeCustomerId) return { stripeCustomerId, email: localUser?.email || null };

  const email = localUser?.email || null;
  if (email) {
    const customers = await stripe.customers.list({ email, limit: 1 });
    const found = customers.data?.[0];
    if (found?.id) return { stripeCustomerId: found.id, email };
  }
  return { stripeCustomerId: null, email: localUser?.email || null };
}

async function getActiveSubscription(stripeCustomerId: string) {
  const subs = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "active",
    expand: ["data.items.data.price"],
    limit: 1,
  });
  return subs.data?.[0] || null;
}

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const atPeriodEnd = Boolean(body?.atPeriodEnd);

    const { stripeCustomerId } = await findStripeCustomerId(userId);
    if (!stripeCustomerId) {
      await clerkClient.users.updateUser(userId, {
        publicMetadata: { premium: false },
      }).catch(() => {});
      return NextResponse.json({ ok: true, changed: false, reason: "no_stripe_customer" }, { status: 200 });
    }

    const sub = await getActiveSubscription(stripeCustomerId);
    if (!sub) {
      await clerkClient.users.updateUser(userId, {
        publicMetadata: { premium: false },
      }).catch(() => {});
      return NextResponse.json({ ok: true, changed: false, reason: "no_active_subscription" }, { status: 200 });
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
        publicMetadata: { premium: false },
      }).catch(() => {});
    }

    // (Optional) Update DB entitlements here too
    // await prisma.user.update({ where: { clerkId: userId }, data: { isPremium: !(!atPeriodEnd) } });

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
