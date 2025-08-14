// app/pricing/checkout/page.tsx
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { appUrl } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CheckoutStart() {
  const { userId } = auth();
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent("/pricing/checkout")}`);

  let me = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!me) {
    const cu = await clerkClient.users.getUser(userId);
    const email =
      cu?.emailAddresses?.find(e => e.id === cu.primaryEmailAddressId)?.emailAddress ||
      cu?.emailAddresses?.[0]?.emailAddress ||
      `${userId}@example.local`;
    const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.username || null;
    me = await prisma.user.create({ data: { clerkId: userId, email, name: name ?? undefined } });
  }

  const profile = await prisma.userProfile.findUnique({ where: { userId: me.id } });
  if (!profile) redirect(`/onboarding?next=${encodeURIComponent("/pricing/checkout")}`);

  const key = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!key || !priceId) throw new Error("Missing STRIPE_SECRET_KEY or STRIPE_PRICE_ID");

  // 🔽 dynamic import
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(key, { apiVersion: "2024-06-20" });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: appUrl("/pricing/success"),
    cancel_url: appUrl("/pricing"),
    client_reference_id: me.id,
    customer_email: me.email || undefined,
    metadata: { clerkId: userId },
  });

  if (!session.url) throw new Error("Failed to create Stripe Checkout Session");
  redirect(session.url);
}
