import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export const STRIPE_API_VERSION = "2024-06-20";

let stripeClient: Stripe | null | undefined;

export function getStripeClient(): Stripe | null {
  if (stripeClient !== undefined) {
    return stripeClient;
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    stripeClient = null;
    return stripeClient;
  }

  stripeClient = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  return stripeClient;
}

export async function findStripeCustomer(
  stripe: Stripe | null,
  clerkUserId: string
): Promise<{
  stripeCustomerId: string | null;
  email: string | null;
  localUser: Awaited<ReturnType<typeof prisma.user.findUnique>>;
}> {
  const localUser = await prisma.user.findUnique({ where: { clerkId: clerkUserId } });

  let stripeCustomerId: string | null =
    // @ts-expect-error Optional field depending on schema version
    (localUser as any)?.stripeCustomerId || null;

  if (!stripeCustomerId && localUser?.id) {
    const profile = await prisma.userProfile
      .findUnique({ where: { userId: localUser.id } })
      .catch(() => null);

    if (profile) {
      // @ts-expect-error Optional field depending on schema version
      stripeCustomerId = (profile as any)?.stripeCustomerId || null;
    }
  }

  const email = localUser?.email || null;

  if (!stripeCustomerId && stripe && email) {
    const customers = await stripe.customers.list({ email, limit: 1 });
    const found = customers.data?.[0];
    if (found?.id) {
      stripeCustomerId = found.id;
    }
  }

  return { stripeCustomerId, email, localUser };
}

export async function getActiveSubscription(stripe: Stripe, stripeCustomerId: string) {
  const subs = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "active",
    expand: ["data.items.data.price"],
    limit: 1,
  });
  return subs.data?.[0] || null;
}
