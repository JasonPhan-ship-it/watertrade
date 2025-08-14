export const runtime = "nodejs";

import { NextResponse } from "next/server";
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
    cu?.emailAddresses?.find((e) => e.id === cu?.primaryEmailAddressId)?.emailAddress ??
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

// ---------- GET ----------
export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ profile: null }, { status: 200 });

  const local = await getOrCreateLocalUser(userId);
  const profile = await prisma.userProfile.findUnique({ where: { userId: local.id } });

  const res = NextResponse.json({ profile }, { status: 200 });
  if (profile) {
    // short-lived cookie to let middleware pass immediately
    res.headers.append(
      "Set-Cookie",
      [
        "onboarded=1",
        "Path=/",
        "Max-Age=300",
        "HttpOnly",
        "SameSite=Lax",
        process.env.NODE_ENV === "production" ? "Secure" : "",
      ].filter(Boolean).join("; ")
    );
  }
  return res;
}

// ---------- POST (create or update + mark onboarded) ----------
export async function POST(req: Request) {
  try {
    const { userId: clerkUserId } = auth();
    if (!clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    await prisma.userProfile.upsert({
      where: { userId: localUser.id },
      create: { userId: localUser.id, fullName, company, tradeRole, phone, primaryDistrict, waterTypes, acceptTerms: true },
      update: { fullName, company, tradeRole, phone, primaryDistrict, waterTypes, acceptTerms: true },
    });

    // set public metadata but don't block
    clerkClient.users.updateUser(clerkUserId, { publicMetadata: { onboarded: true } }).catch(() => {});

    const res = NextResponse.json({ ok: true }, { status: 200 });
    res.headers.append(
      "Set-Cookie",
      [
        "onboarded=1",
        "Path=/",
        "Max-Age=1800",
        "HttpOnly",
        "SameSite=Lax",
        process.env.NODE_ENV === "production" ? "Secure" : "",
      ].filter(Boolean).join("; ")
    );
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

// ---------- PATCH (edit profile; no onboarding gate changes) ----------
export async function PATCH(req: Request) {
  try {
    const { userId: clerkUserId } = auth();
    if (!clerkUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const localUser = await getOrCreateLocalUser(clerkUserId);
    const body = await req.json().catch(() => ({}));

    const updates: any = {};
    if (typeof body.fullName === "string") updates.fullName = body.fullName.trim();
    if (typeof body.company === "string") updates.company = body.company;
    if (typeof body.phone === "string") updates.phone = body.phone;
    if (typeof body.primaryDistrict === "string") updates.primaryDistrict = body.primaryDistrict;
    if (Array.isArray(body.waterTypes)) updates.waterTypes = body.waterTypes;
    if (body.role != null) {
      const norm = normalizeRole(body.role);
      if (norm) updates.tradeRole = norm;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const profile = await prisma.userProfile.update({
      where: { userId: localUser.id },
      data: updates,
    });

    return NextResponse.json({ profile }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
