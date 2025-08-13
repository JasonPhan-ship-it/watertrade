// app/api/profile/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth, clerkClient } from "@clerk/nextjs/server";

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

async function getOrCreateLocalUser(clerkUserId: string) {
  let user = await prisma.user.findUnique({ where: { clerkId: clerkUserId } });
  if (user) return user;

  const cu = await clerkClient.users.getUser(clerkUserId).catch(() => null);
  const email =
    cu?.emailAddresses?.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ??
    cu?.emailAddresses?.[0]?.emailAddress ??
    `${clerkUserId}@example.invalid`;

  user = await prisma.user.create({
    data: {
      email,
      name: [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || null,
      clerkId: clerkUserId,
    },
  });

  return user;
}

export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ profile: null }, { status: 200 });

  const local = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!local) return NextResponse.json({ profile: null }, { status: 200 });

  const profile = await prisma.userProfile.findUnique({ where: { userId: local.id } });
  return NextResponse.json({ profile }, { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkUserId } = auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const localUser = await getOrCreateLocalUser(clerkUserId);

    const body = await req.json().catch(() => ({}));
    const { fullName, company, role, phone, primaryDistrict, waterTypes = [], acceptTerms } = body || {};

    const tradeRole = normalizeRole(role);
    if (!fullName || !tradeRole || acceptTerms !== true) {
      return NextResponse.json(
        { error: "Missing or invalid fields", details: { fullName, role, acceptTerms } },
        { status: 400 }
      );
    }

    // Upsert profile
    await prisma.userProfile.upsert({
      where: { userId: localUser.id },
      create: {
        userId: localUser.id,
        fullName,
        company: company ?? null,
        tradeRole,
        phone: phone ?? null,
        primaryDistrict: primaryDistrict ?? null,
        waterTypes,
        acceptTerms: true,
      },
      update: {
        fullName,
        company: company ?? null,
        tradeRole,
        phone: phone ?? null,
        primaryDistrict: primaryDistrict ?? null,
        waterTypes,
        acceptTerms: true,
      },
    });

    // Mark onboarded in Clerk (don’t block on failure)
    clerkClient.users.updateUser(clerkUserId, { publicMetadata: { onboarded: true } }).catch(() => {});

    // Set short-lived cookie so middleware lets the next request through immediately
    const res = NextResponse.json({ ok: true }, { status: 200 });
    res.cookies.set("onboarded", "1", {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 30, // 30 minutes
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
