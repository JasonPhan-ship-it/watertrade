// app/api/profile/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth, clerkClient } from "@clerk/nextjs/server";

// Map flexible role inputs to your Prisma enum
const ROLE_MAP: Record<string, "BUYER" | "SELLER" | "BOTH" | "DISTRICT_ADMIN"> = {
  buyer: "BUYER",
  seller: "SELLER",
  both: "BOTH",
  "district admin": "DISTRICT_ADMIN",
  district_admin: "DISTRICT_ADMIN",
  BUYER: "BUYER",
  SELLER: "SELLER",
  BOTH: "BOTH",
  DISTRICT_ADMIN: "DISTRICT_ADMIN",
};

function normalizeRole(input: unknown) {
  if (!input) return null;
  const s = String(input).trim();
  const key = s.toLowerCase();
  return ROLE_MAP[key] ?? ROLE_MAP[s] ?? null;
}

// Ensure a local User row exists that corresponds to Clerk user
async function getOrCreateLocalUser(clerkUserId: string) {
  // Try find existing by clerkId
  let user = await prisma.user.findUnique({ where: { clerkId: clerkUserId } });
  if (user) return user;

  // Fetch details from Clerk for email/name
  const clerkUser = await clerkClient.users.getUser(clerkUserId).catch(() => null);
  const email =
    clerkUser?.emailAddresses?.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress ??
    null;

  // Create a local user; id will be cuid() (your schema)
  user = await prisma.user.create({
    data: {
      email: email ?? `${clerkUserId}@example.invalid`, // fallback to satisfy NOT NULL/unique
      name: [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || null,
      clerkId: clerkUserId,
    },
  });

  return user;
}

export async function GET() {
  const { userId: clerkUserId } = auth();
  if (!clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Ensure local user exists so lookups by userId won’t fail later
  const localUser = await getOrCreateLocalUser(clerkUserId);

  const profile = await prisma.userProfile.findUnique({
    where: { userId: localUser.id },
  });

  return NextResponse.json({ profile });
}

export async function POST(req: Request) {
  try {
    const { userId: clerkUserId } = auth();
    if (!clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Make sure there is a corresponding local User row
    const localUser = await getOrCreateLocalUser(clerkUserId);

    const body = await req.json().catch(() => ({}));
    const {
      fullName,
      company,
      role,
      phone,
      primaryDistrict,
      waterTypes = [],
      acceptTerms,
    } = body || {};

    const tradeRole = normalizeRole(role);

    if (!fullName || !tradeRole || acceptTerms !== true) {
      return NextResponse.json(
        { error: "Missing or invalid fields", details: { fullName, role, acceptTerms } },
        { status: 400 }
      );
    }

    // Upsert the profile using the *local* user.id (NOT the Clerk id)
    const profile = await prisma.userProfile.upsert({
      where: { userId: localUser.id },
      create: {
        userId: localUser.id,
        fullName,
        company,
        tradeRole,
        phone,
        primaryDistrict,
        waterTypes,
        acceptTerms: true,
      },
      update: {
        fullName,
        company,
        tradeRole,
        phone,
        primaryDistrict,
        waterTypes,
        acceptTerms: true,
      },
    });

    // Mark Clerk metadata so middleware skips onboarding next time
    try {
      await clerkClient.users.updateUser(clerkUserId, {
        publicMetadata: { onboarded: true },
      });
    } catch {
      // best-effort; don't block success
    }

    return NextResponse.json({ profile });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
