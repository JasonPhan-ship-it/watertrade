// app/api/subscription/downgrade/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

const FREE_PRICE = process.env.STRIPE_PRICE_FREE || ""; // optional; if not set, we cancel at period end

async function findStripeCustomerId(userId: string) {
  // 1) Local DB lookup on `user` or `userProfile`
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

  // 2) Fallback by email
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

export async function POST() {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { stripeCustomerId } = await findStripeCustomerId(userId);
    if (!stripeCustomerId) {
      // No Stripe customer → nothing to downgrade
      // You can still mark them as free in Clerk just in case
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
    if (FREE_PRICE) {
      // Swap to free price (keeps subscription around on $0)
      const currentItem = sub.items.data[0];
      result = await stripe.subscriptions.update(sub.id, {
        proration_behavior: "create_prorations",
        items: [
          {
            id: currentItem.id,
            price: FREE_PRICE,
            quantity: 1,
          },
        ],
        cancel_at_period_end: false,
      });
    } else {
      // No free plan configured → set to cancel at period end
      result = await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: true,
      });
    }

    // Update Clerk metadata immediately
    await clerkClient.users.updateUser(userId, {
      publicMetadata: { premium: !!FREE_PRICE ? false : true }, // If swapping to free, premium=false. If only scheduling cancel, still premium until period end.
    }).catch(() => {});

    // (Optional) If you track entitlements in your DB, update here.
    // await prisma.user.update({ where: { clerkId: userId }, data: { isPremium: !!FREE_PRICE ? false : true } });

    return NextResponse.json(
      {
        ok: true,
        action: FREE_PRICE ? "swapped_to_free" : "cancel_at_period_end",
        subscriptionId: result.id,
        current_period_end: result.current_period_end,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
