import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { userId } = auth();
    const dbUser = userId
      ? await prisma.user.findUnique({ where: { clerkId: userId } })
      : null;

    const listingCount = await prisma.listing.count().catch(() => -1);

    return NextResponse.json(
      {
        signedIn: !!userId,
        userId: userId ?? null,
        dbUser,
        listingCount,
        runtime: "nodejs",
        ok: true,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
