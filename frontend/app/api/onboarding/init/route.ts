// app/api/onboarding/init/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ProfileRole } from "@prisma/client";

const isProd = process.env.NODE_ENV === "production";

/* ------------------------------ helpers ------------------------------ */

function onboardedCookie(userId: string) {
  return [
    `onboarded=${encodeURIComponent(userId)}`,
    "Path=/",
    "Max-Age=1800", // 30 minutes
    "HttpOnly",
    "SameSite=Lax",
    isProd ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
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

function uniqStrings(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const set = new Set<string>();
  for (const v of arr) {
    const s = String(v ?? "").trim();
    if (s) set.add(s);
  }
  return Array.from(set);
}

function parseProfileRole(val: unknown): ProfileRole | null {
  if (typeof val !== "string") return null;
  const key = val.toUpperCase().replace(/\s+/g, "_");
  // @ts-expect-error enum dynamic index
  return ProfileRole[key] ?? null;
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.slice(-1)[0] };
}

/* -------------------------------- GET --------------------------------
   Unified gate: returns { onboarded: boolean } based on Clerk OR DB.
----------------------------------------------------------------------- */
export async function GET() {
  try {
    const { userId, sessionId } = auth();
    if (!userId || !sessionId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const localUser = await getOrCreateLocalUser(userId);

    // Clerk signal
    const cu = await clerkClient.users.getUser(userId).catch(() => null);
    const clerkOnboarded = cu?.publicMetadata?.onboarded === true;

    // DB signal - FIXED: use correct table name from schema
    const db = await prisma.userProfile.findUnique({
      where: { userId: localUser.id },
      select: { acceptTerms: true },
    });
    const dbOnboarded = Boolean(db?.acceptTerms);

    const onboarded = clerkOnboarded || dbOnboarded;

    const res = NextResponse.json({ onboarded });
    if (onboarded) res.headers.append("Set-Cookie", onboardedCookie(userId));
    return res;
  } catch (error) {
    console.error("GET /api/onboarding/init error:", error);
    return NextResponse.json({ error: "Failed to check onboarding status" }, { status: 500 });
  }
}

/* -------------------------------- POST ------------------------------- 
   Expects: { fullName, email, [phone], [address], [smsOptIn], [role|tradeRole],
              [districts], [primaryDistrict], [waterTypes], [farms] }
   - Derives firstName/lastName from fullName for Prisma & Clerk.
   - Idempotent: updates if profile exists; marks acceptTerms=true.
----------------------------------------------------------------------- */
export async function POST(req: Request) {
  try {
    const { userId, sessionId } = auth();
    if (!userId || !sessionId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const localUser = await getOrCreateLocalUser(userId);

    const body = await req.json().catch(() => ({}));

    // Minimal identity (now based on fullName)
    const fullName: string = String(body.fullName ?? "").trim();
    const email: string = String(body.email ?? "").trim();

    // Optional contact
    const phone: string = String(body.phone ?? "").trim();
    const address: string = String(body.address ?? "").trim();
    const smsOptIn: boolean = Boolean(body.smsOptIn);

    // Preferences
    const role =
      parseProfileRole(body.tradeRole) ??
      parseProfileRole(body.role) ??
      ProfileRole.BOTH;

    const districts: string[] = uniqStrings(body.districts);
    const primaryDistrict: string | undefined =
      typeof body.primaryDistrict === "string" && body.primaryDistrict.trim()
        ? String(body.primaryDistrict).trim()
        : undefined;
    const waterTypes: string[] = uniqStrings(body.waterTypes);

    // Farms (optional)
    const farmsIn: any[] = Array.isArray(body.farms) ? body.farms : [];

    if (!fullName || !email) {
      return NextResponse.json(
        { error: "Full name and email are required." },
        { status: 400 }
      );
    }

    const { firstName, lastName } = splitFullName(fullName);

    await prisma.$transaction(async (tx) => {
      // Upsert profile and mark onboarded
      await tx.userProfile.upsert({
        where: { userId: localUser.id },
        create: {
          userId: localUser.id,
          firstName,
          lastName,
          fullName,
          email,
          phone,
          address,
          smsOptIn,
          tradeRole: role,
          districts,
          ...(primaryDistrict ? { primaryDistrict } : {}),
          ...(waterTypes.length ? { waterTypes } : {}),
          acceptTerms: true, // onboarded flag
        },
        update: {
          firstName,
          lastName,
          fullName,
          email,
          phone,
          address,
          smsOptIn,
          tradeRole: role,
          districts,
          ...(primaryDistrict ? { primaryDistrict } : { primaryDistrict: null }),
          ...(waterTypes.length ? { waterTypes } : { waterTypes: [] }),
          acceptTerms: true,
        },
      });

      // Replace farms if provided
      if (Array.isArray(farmsIn)) {
        await tx.farm.deleteMany({ where: { userId: localUser.id } });

        const cleanFarms = farmsIn
          .map((f) => ({
            name: String(f?.name ?? "").trim(),
            accountNumber: String(f?.accountNumber ?? "").trim(),
            district: String(f?.district ?? "").trim(),
          }))
          .filter((f) => f.name || f.accountNumber || f.district);

        if (cleanFarms.length) {
          await tx.farm.createMany({
            data: cleanFarms.map((f) => ({
              userId: localUser.id,
              name: f.name || null,
              accountNumber: f.accountNumber || null,
              district: f.district || null,
            })),
          });
        }
      }
    });

    // Sync Clerk profile (non-blocking) with derived names
    clerkClient.users
      .updateUser(userId, {
        firstName,
        lastName,
        publicMetadata: { onboarded: true, smsOptIn, tradeRole: role },
      })
      .catch(() => {});

    // Keep local User email if placeholder
    if (!localUser.email || localUser.email.endsWith("@example.invalid")) {
      await prisma.user.update({
        where: { id: localUser.id },
        data: { email },
      });
    }

    const res = NextResponse.json({ ok: true, onboarded: true });
    res.headers.append("Set-Cookie", onboardedCookie(userId));
    return res;
  } catch (e: any) {
    console.error("POST /api/onboarding/init error:", e);
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
