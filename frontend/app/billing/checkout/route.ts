import { NextResponse } from "next/server";

// If integrating Stripe, uncomment and configure:
// import Stripe from "stripe";
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

export async function POST(req: Request) {
  const { plan } = await req.json();
  // TODO: Create a real Stripe Checkout Session here and return session.url

  // Temporary: send to your Pricing page while Stripe is wired up
  const fallbackUrl = "/pricing";

  // Example Stripe flow (commented):
  // const session = await stripe.checkout.sessions.create({
  //   mode: "subscription",
  //   line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
  //   success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
  //   cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/membership`,
  //   customer_email: user.emailAddresses[0]?.emailAddress,
  // });
  // return NextResponse.json({ url: session.url });

  return NextResponse.json({ url: fallbackUrl });
}
