// app/api/membership/select/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { userId, sessionId } = auth();
    if (!userId || !sessionId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { plan } = body;

    if (plan !== "free" && plan !== "premium") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Get or create local user
    let user = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!user) {
      const cu = await clerkClient.users.getUser(userId).catch(() => null);
      const email =
        cu?.emailAddresses?.find((e) => e.id === cu?.primaryEmailAddressId)?.emailAddress ??
        cu?.emailAddresses?.[0]?.emailAddress ??
        `${userId}@example.invalid`;

      user = await prisma.user.create({
        data: {
          email,
          name: [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || null,
          clerkId: userId,
        },
      });
    }

    // For free plan, we just mark them as having completed onboarding
    // For premium, this would typically be handled by webhook after payment
    if (plan === "free") {
      // Update Clerk metadata to mark as onboarded with free plan
      await clerkClient.users.updateUser(userId, {
        publicMetadata: { 
          onboarded: true, 
          premium: false,
          plan: "free"
        },
      });

      // Optionally update database subscription status
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: "free",
          subscriptionUpdatedAt: new Date(),
        }
      });

      return NextResponse.json({ 
        ok: true, 
        plan: "free",
        message: "Free plan activated successfully"
      });
    }

    // For premium, redirect to billing (this shouldn't be called directly for premium)
    return NextResponse.json({ 
      error: "Premium plan should be handled through billing checkout" 
    }, { status: 400 });

  } catch (e: any) {
    console.error("Membership select error:", e);
    return NextResponse.json({ 
      error: e?.message || "Failed to select membership plan" 
    }, { status: 500 });
  }
}
