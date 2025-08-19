// ...
const cUser = await currentUser();

// Build safe strings
const primaryEmail: string =
  cUser?.emailAddresses?.[0]?.emailAddress ?? ""; // never null

const displayName: string =
  (cUser
    ? ([cUser.firstName, cUser.lastName].filter(Boolean).join(" ") ||
       cUser.username ||
       "")
    : "");

// 2) Ensure buyer exists in your local User table (by Clerk ID)
const buyer = await prisma.user.upsert({
  where: { clerkId: userId },
  update: {
    // If your Prisma model has `email String` (NOT NULL), pass a string
    // If you want to avoid overwriting with empty string, use undefined instead:
    email: primaryEmail || undefined,
    name: displayName || undefined,
  },
  create: {
    clerkId: userId,
    // Must be a string if schema is non-nullable
    email: primaryEmail,
    name: displayName,
  },
  select: { id: true },
});
