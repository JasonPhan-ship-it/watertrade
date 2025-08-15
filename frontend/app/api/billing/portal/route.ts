// app/api/billing/portal/route.ts
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/email";

export const runtime = "nodejs";

export async function POST() {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(key, { apiVersion: "2024-06-20" });

  // Ensure we have a local user w/ email
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

  // Find or create Stripe Customer (by email)
  let customerId: string | null = null;
  if (me.email) {
    const list = await stripe.customers.list({ email: me.email, limit: 1 });
    if (list.data.length) customerId = list.data[0]!.id;
  }
  if (!customerId) {
    const c = await stripe.customers.create({
      email: me.email || undefined,
      name: me.name || undefined,
      metadata: { userId: me.id, clerkId: userId },
    });
    customerId = c.id;
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId!,
    return_url: appUrl("/profile"), // where to go after portal
  });

  if (!session.url) {
    return NextResponse.json({ error: "Failed to create billing portal session" }, { status: 500 });
  }
  return NextResponse.json({ url: session.url });
}
