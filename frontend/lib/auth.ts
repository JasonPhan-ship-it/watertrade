// lib/auth.ts
import { auth, currentUser } from "@clerk/nextjs/server";

/** Throws if not signed in; returns the Clerk userId otherwise. */
export function requireUserId() {
  const { userId } = auth();
  if (!userId) {
    // In an API route, throwing will produce a 500 unless you catch it.
    // You can also return/throw a NextResponse if you prefer.
    throw new Error("Unauthorized");
  }
  return userId;
}

/** Get the Clerk user object or null (useful in server components). */
export async function getUserSafe() {
  try {
    return await currentUser();
  } catch {
    return null;
  }
}

/** Convenience: get the Clerk user and ensure it exists. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}
