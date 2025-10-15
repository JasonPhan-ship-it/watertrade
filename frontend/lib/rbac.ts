import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function ensureUser() {
  const { userId } = auth();
  if (!userId) return null;

  // First try the direct Clerk link.
  let user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (user) return user;

  // Fetch Clerk profile so we can reconcile against historical users seeded by email only.
  const u = await clerkClient.users.getUser(userId);
  const email =
    u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ||
    u.emailAddresses[0]?.emailAddress ||
    `${userId}@example.invalid`;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || null;

  if (email) {
    // If a legacy user exists for this email, attach the Clerk id to avoid unique collisions.
    const legacy = await prisma.user.findUnique({ where: { email } });
    if (legacy) {
      user = await prisma.user.update({
        where: { id: legacy.id },
        data: { clerkId: userId, name: legacy.name ?? name ?? undefined },
      });
      return user;
    }
  }

  user = await prisma.user.create({
    data: { clerkId: userId, email, name }, // Role defaults to USER via your schema
  });
  return user;
}

export async function requireAdmin() {
  const me = await ensureUser();
  if (!me || me.role !== "ADMIN") {
    const err: any = new Error("FORBIDDEN");
    err.status = 403;
    throw err;
  }
  return me;
}
