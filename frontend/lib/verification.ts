// lib/verification.ts
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

export type Intent = "BUY" | "SELL";

export async function requireVerifiedOrRequest(intent: Intent) {
  // Identify user
  const { userId: clerkId } = auth();
  if (!clerkId) return { ok: false, code: "AUTH_REQUIRED" as const };

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: {
      id: true,
      role: true,
      email: true,
      name: true,
      verifiedBuyerAt: true,
      verifiedSellerAt: true,
      verificationRequests: {
        where: { type: intent, status: "PENDING" },
        select: { id: true },
      },
    },
  });

  if (!user) return { ok: false, code: "USER_NOT_FOUND" as const };

  // Admins bypass
  if (user.role === "ADMIN") return { ok: true };

  const isVerified =
    intent === "BUY" ? !!user.verifiedBuyerAt : !!user.verifiedSellerAt;

  if (isVerified) return { ok: true };

  // If not verified, ensure a pending request exists (first attempt)
  if (user.verificationRequests.length === 0) {
    await prisma.verificationRequest.create({
      data: {
        userId: user.id,
        type: intent,
        status: "PENDING",
      },
    });
  }

  return {
    ok: false,
    code: "VERIFICATION_REQUIRED" as const,
    payload: {
      intent,
      message:
        intent === "BUY"
          ? "Buyer verification required before you can purchase."
          : "Seller verification required before you can list or accept offers.",
    },
  };
}
