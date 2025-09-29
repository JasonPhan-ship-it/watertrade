// lib/verification.ts
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

export type Intent = "BUY" | "SELL";

type Result =
  | { ok: true }
  | { ok: false; code: "AUTH_REQUIRED" | "USER_NOT_FOUND" | "VERIFICATION_REQUIRED"; payload?: { intent: Intent; message: string } };

export async function requireVerifiedOrRequest(intent: Intent): Promise<Result> {
  // Identify user
  const { userId: clerkId } = auth();
  if (!clerkId) return { ok: false, code: "AUTH_REQUIRED" };

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: {
      id: true,
      role: true,
      email: true,
      name: true,
    },
  });

  if (!user) return { ok: false, code: "USER_NOT_FOUND" };

  // Admins bypass
  if (user.role === "ADMIN") return { ok: true };

  // ✅ New: consider the user verified if they have an APPROVED verification request for this intent
  const approved = await prisma.verificationRequest.findFirst({
    where: { userId: user.id, type: intent, status: "APPROVED" },
    select: { id: true },
  });

  if (approved) return { ok: true };

  // If not verified, ensure exactly one pending request exists.
  const pending = await prisma.verificationRequest.findFirst({
    where: { userId: user.id, type: intent, status: "PENDING" },
    select: { id: true },
  });

  if (!pending) {
    // If you have a unique constraint to prevent duplicates, this is safe even under race conditions.
    // Example recommended constraint in Prisma schema:
    // @@unique([userId, type, status], map: "uniq_user_intent_status")
    try {
      await prisma.verificationRequest.create({
        data: {
          userId: user.id,
          type: intent,
          status: "PENDING",
        },
      });
    } catch {
      // ignore unique violation or races — a pending request now exists
    }
  }

  return {
    ok: false,
    code: "VERIFICATION_REQUIRED",
    payload: {
      intent,
      message:
        intent === "BUY"
          ? "Buyer verification required before you can purchase."
          : "Seller verification required before you can list or accept offers.",
    },
  };
}
