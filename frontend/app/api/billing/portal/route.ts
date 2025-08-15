import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { appUrl } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(key, { apiVersion: "2024-06-20" });

    // Get Clerk user + email
    const cu = await clerkClient.users.getUser(userId);
    const email =
      cu?.emailAddresses?.find(e => e.id === cu.primaryEmailAddressId)?.emailAddress ||
      cu?.emailAddresses?.[0]?.emailAddress;
    if (!email) return NextResponse.json({ error: "No email on account" }, { status: 400 });

    // Prefer previously-saved Stripe customer id (stored in Clerk publicMetadata)
    let customerId =
      (cu.publicMetadata?.stripeCustomerId as string | undefined) ?? undefined;

    if (!customerId) {
      // Try to find an existing customer by email
      const found = await stripe.customers.list({ email, limit: 1 });
      if (found.data[0]) {
        customerId = found.data[0].id;
      } else {
        // Create a customer so the portal can open (even if no sub yet)
        const created = await stripe.customers.create({
          email,
          name: [cu.firstName, cu.lastName].filter(Boolean).join(" ") || cu.username || undefined,
          metadata: { clerkId: userId },
        });
        customerId = created.id;
      }

      // Save for next time
      await clerkClient.users.updateUser(userId, {
        publicMetadata: { ...(cu.publicMetadata || {}), stripeCustomerId: customerId },
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId!,
      return_url: appUrl("/profile"),
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("POST /api/billing/portal error:", err);
    const msg = typeof err?.message === "string" ? err.message : "Failed to open billing portal";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
