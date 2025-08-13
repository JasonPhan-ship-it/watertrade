import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ signedIn: false }, { status: 200 });

    const cUser = await clerkClient.users.getUser(userId);
    const email =
      cUser.emailAddresses.find(e => e.id === cUser.primaryEmailAddressId)?.emailAddress ||
      cUser.emailAddresses[0]?.emailAddress ||
      null;

    const userRow = await prisma.user.findUnique({ where: { clerkId: userId } });

    return NextResponse.json(
      {
        signedIn: true,
        clerkId: userId,
        email,
        dbUser: userRow ?? null,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}
