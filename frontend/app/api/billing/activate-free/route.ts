import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const where = "[api/billing/activate-free]";
  try {
    const { userId } = auth();
    if (!userId) {
      console.error(where, "No Clerk userId");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve internal user
    const user = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!user) {
      console.error(where, "User not found for clerkId", { clerkId: userId });
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Example: upsert a subscription row or just set a field on User
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: "free",
        subscriptionUpdatedAt: new Date(),
      },
      select: { id: true, subscriptionStatus: true, subscriptionUpdatedAt: true },
    });

    return NextResponse.json({ ok: true, user: updated }, { status: 200 });
  } catch (e: any) {
    // Prisma tends to include code/meta; surface it in logs
    console.error(where, "Unhandled error", {
      message: e?.message,
      code: e?.code,
      meta: e?.meta,
      stack: e?.stack,
    });
    return NextResponse.json(
      { error: "Internal error activating free plan" },
      { status: 500 }
    );
  }
}
