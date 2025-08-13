// components/NavRight.tsx (example)
import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export default async function NavRight() {
  const { userId } = auth();
  let isAdmin = false;
  if (userId) {
    const me = await prisma.user.findUnique({ where: { clerkId: userId } });
    isAdmin = me?.role === "ADMIN";
  }

  return (
    <div className="flex items-center gap-3">
      <SignedOut>
        <Link href="/sign-in" className="text-sm">Sign in</Link>
      </SignedOut>
      <SignedIn>
        {isAdmin && <Link href="/admin" className="text-sm">Admin</Link>}
        <UserButton />
      </SignedIn>
    </div>
  );
}
