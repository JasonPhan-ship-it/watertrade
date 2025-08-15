// app/api/billing/portal/route.ts
import { NextResponse, NextRequest } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Make sure we have a local user with email
  let me = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!me) {
    const cu = await clerkClient.users.getUser(userId);
    const email =
      cu?.emailAddresses?.find(e => e.id === cu.primaryEmailAddressId)?.emailAddress ||
      cu?.emailAddresses?.[0]?.emailAddress;
    if (!email) return NextResponse.json({ error: "No email on file" }, { status: 400 });

    const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.username || undefined;
    me = await prisma.user.create({ data: { clerkId: userId, email, name } });
  }
  if (!me.email) return NextResponse.json({ error: "No email on file" }, { status: 400 });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });

  // dynamic import to keep edge bundles small
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(key, { apiVersion: "2024-06-20" });

  // Find (or create) Stripe customer by email
  let customerId: string | null = null;
  const list = await stripe.customers.list({ email: me.email, limit: 1 });
  if (list.data.length > 0) {
    customerId = list.data[0].id;
  } else {
    const created = await stripe.customers.create({
      email: me.email,
      name: me.name ?? undefined,
      metadata: { clerkId: userId, appUserId: me.id },
    });
    customerId = created.id;
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId!,
    return_url: appUrl("/profile"),
  });

  return NextResponse.json({ url: session.url }, { status: 200 });
}
