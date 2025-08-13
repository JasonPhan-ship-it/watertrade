import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function ensureUser() {
  const { userId } = auth();
  if (!userId) return null;

  let user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!user) {
    const u = await clerkClient.users.getUser(userId);
    const email =
      u.emailAddresses.find(e => e.id === u.primaryEmailAddressId)?.emailAddress ||
      u.emailAddresses[0]?.emailAddress ||
      `${userId}@example.invalid`;
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || null;

    user = await prisma.user.create({
      data: { clerkId: userId, email, name }, // Role defaults to USER via your schema
    });
  }
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
