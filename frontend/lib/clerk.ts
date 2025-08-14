// lib/clerk.ts
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/** Get the user's primary email (falls back to first email). */
export async function getClerkPrimaryEmail(clerkId: string): Promise<string | null> {
  const cu = await clerkClient.users.getUser(clerkId);
  const primaryId = cu.primaryEmailAddressId;
  const primary = cu.emailAddresses?.find(e => e.id === primaryId)?.emailAddress;
  return primary || cu.emailAddresses?.[0]?.emailAddress || null;
}

/** Ensure there's a local User row for a Clerk user; create if missing. */
export async function getOrCreateUserFromClerk(clerkId: string) {
  let user = await prisma.user.findUnique({ where: { clerkId } });
  if (user) return user;

  const cu = await clerkClient.users.getUser(clerkId);
  const email = (await getClerkPrimaryEmail(clerkId)) || `${clerkId}@example.local`;
  const name =
    [cu.firstName, cu.lastName].filter(Boolean).join(" ") ||
    (cu.username ?? "") ||
    undefined;

  user = await prisma.user.create({
    data: { clerkId, email, name },
  });
  return user;
}
