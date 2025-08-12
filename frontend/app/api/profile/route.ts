// app/api/profile/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { clerkClient } from "@clerk/nextjs/server";

const ROLE_MAP: Record<string, "BUYER" | "SELLER" | "BOTH" | "DISTRICT_ADMIN"> = {
  buyer: "BUYER",
  seller: "SELLER",
  both: "BOTH",
  "district admin": "DISTRICT_ADMIN",
  district_admin: "DISTRICT_ADMIN",
  DISTRICT_ADMIN: "DISTRICT_ADMIN",
  BUYER: "BUYER",
  SELLER: "SELLER",
  BOTH: "BOTH",
};

function normalizeRole(input: unknown) {
  if (!input) return null;
  const s = String(input);
  const key = s.trim().toLowerCase().replace(/\s+/g, " ");
  return ROLE_MAP[key] ?? ROLE_MAP[s] ?? null;
}

export async function GET() {
  const userId = requireUserId();
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  return NextResponse.json({ profile });
}

export async function POST(req: Request) {
  try {
    const userId = requireUserId();
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

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        fullName,
        company,
        tradeRole, // ✅ enum-safe
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

    // Make Clerk metadata best-effort (don’t fail the request if Clerk errors)
    try {
      await clerkClient.users.updateUser(userId, {
        publicMetadata: { onboarded: true },
      });
    } catch (e) {
      // Optional: log e to your observability; don’t block success
    }

    return NextResponse.json({ profile });
  } catch (e: any) {
    const msg = e?.message || "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
