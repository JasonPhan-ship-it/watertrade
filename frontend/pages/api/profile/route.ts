import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { clerkClient } from "@clerk/nextjs/server";

export async function GET() {
  const userId = requireUserId();
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  return NextResponse.json({ profile });
}

export async function POST(req: Request) {
  const userId = requireUserId();
  const body = await req.json();

  const {
    fullName,
    company,
    role,
    phone,
    primaryDistrict,
    waterTypes = [],
    acceptTerms,
  } = body || {};

  if (!fullName || !role || !acceptTerms) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const profile = await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      fullName,
      company,
      role,
      phone,
      primaryDistrict,
      waterTypes,
      acceptTerms: Boolean(acceptTerms),
    },
    update: {
      fullName,
      company,
      role,
      phone,
      primaryDistrict,
      waterTypes,
      acceptTerms: Boolean(acceptTerms),
    },
  });

  // Mark user as onboarded in Clerk so middleware can skip the redirect next time
  await clerkClient.users.updateUser(userId, {
    publicMetadata: { onboarded: true },
  });

  return NextResponse.json({ profile });
}
