// app/pricing/checkout/page.tsx
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Small helper that never returns localhost in prod
function absoluteUrl(path = "/") {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const base = (envBase || "http://localhost:3000").replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function CheckoutStart({ searchParams }: { searchParams: SearchParams }) {
  const { userId } = auth();
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent("/pricing/checkout")}`);

  // Determine billing frequency from query (?billing=annual|monthly), default to monthly
  const rawBilling = typeof searchParams?.billing === "string" ? searchParams.billing : "";
  const billing = rawBilling?.toLowerCase() === "annual" ? "annual" : "monthly";

  // Pick the correct Stripe price id(s)
  // Prefer specific env vars; fall back to legacy STRIPE_PRICE_ID for backward compatibility
  const priceIdMonthly = process.env.STRIPE_PRICE_ID_MONTHLY || process.env.STRIPE_PRICE_ID || "";
  const priceIdAnnual = process.env.STRIPE_PRICE_ID_ANNUAL || "";

  const priceId = billing === "annual" ? priceIdAnnual : priceIdMonthly;

  if (!priceId) {
    // Construct a helpful error depending on which one is missing
    const missing =
      billing === "annual" ? "STRIPE_PRICE_ID_ANNUAL" : "STRIPE_PRICE_ID_MONTHLY (or legacy STRIPE_PRICE_ID)";
    throw new Error(
      `Missing Stripe Price ID for ${billing} billing. Please set ${missing} in your environment.`
    );
  }

  // Ensure user exists locally
  let me = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!me) {
    const cu = await clerkClient.users.getUser(userId);
    const email =
      cu?.emailAddresses?.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ||
      cu?.emailAddresses?.[0]?.emailAddress ||
      `${userId}@example.local`;
    const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.username || null;
    me = await prisma.user.create({ data: { clerkId: userId, email, name: name ?? undefined } });
  }

  // Require onboarding before checkout
  const profile = await prisma.userProfile.findUnique({ where: { userId: me.id } });
  if (!profile) redirect(`/onboarding?next=${encodeURIComponent("/pricing/checkout")}`);

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");

  // dynamic import so Stripe isn't bundled into the edge
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(key, { apiVersion: "2024-06-20" });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: absoluteUrl(`/pricing/success?billing=${billing}`),
    cancel_url: absoluteUrl(`/pricing?billing=${billing}`),
    client_reference_id: me.id,
    customer_email: me.email || undefined,
    allow_promotion_codes: true,
    metadata: { clerkId: userId, billing },
  });

  if (!session.url) throw new Error("Failed to create Stripe Checkout Session");
  redirect(session.url);
}
