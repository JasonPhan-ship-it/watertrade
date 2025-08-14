// app/billing/stripe-webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";
import { sendEmail, appUrl } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!whSecret || !key) {
    return NextResponse.json({ error: "Stripe env missing" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();

  // 🔽 dynamic import
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(key, { apiVersion: "2024-06-20" });

  let evt;
  try {
    evt = stripe.webhooks.constructEvent(raw, sig!, whSecret);
  } catch (err: any) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (evt.type === "checkout.session.completed") {
      const s = evt.data.object as Stripe.Checkout.Session;
      const clerkId = (s.metadata?.clerkId as string) || null;
      const localUserId = (s.client_reference_id as string) || null;

      if (clerkId) {
        await clerkClient.users.updateUser(clerkId, { publicMetadata: { premium: true } });
      }

      const email =
        (s.customer_details?.email as string) ||
        (await (async () => {
          if (!localUserId) return null;
          const u = await prisma.user.findUnique({ where: { id: localUserId } });
          return u?.email ?? null;
        })());

      if (email) {
        await sendEmail({
          to: email,
          subject: "Your Water Traders Premium subscription is active",
          html: `
            <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;">
              <h2>Welcome to Premium 🎉</h2>
              <p>Your subscription is active. Enjoy full listings and analytics.</p>
              <p><a href="${appUrl("/dashboard")}" target="_blank">Go to your dashboard</a></p>
            </div>
          `,
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }
}
