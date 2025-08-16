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
    `onboarded=${userId}`,
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
  // @ts-expect-error dynamic index
  return ProfileRole[key] ?? null;
}

/* -------------------------------- GET --------------------------------
   Returns whether the current user is onboarded.
   Frontend can call this on /onboarding load and redirect if true.
----------------------------------------------------------------------- */
export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const localUser = await getOrCreateLocalUser(userId);

  const profile = await prisma.userProfile.findUnique({
    where: { userId: localUser.id },
    select: {
      userId: true,
      firstName: true,
      lastName: true,
      fullName: true,
      email: true,
      acceptTerms: true,
      tradeRole: true,
      districts: true,
      primaryDistrict: true,
      waterTypes: true,
    },
  });

  // Consider "onboarded" if a profile exists and acceptTerms is true (tweak if needed)
  const onboarded = Boolean(profile?.acceptTerms);

  const res = NextResponse.json({ onboarded, profile });
  if (onboarded) res.headers.append("Set-Cookie", onboardedCookie(userId));
  return res;
}

/* -------------------------------- POST ------------------------------- 
   Creates/updates the profile from onboarding form and marks onboarded.
   This is idempotent; calling it again just updates the profile.
----------------------------------------------------------------------- */
export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const localUser = await getOrCreateLocalUser(userId);

    const body = await req.json().catch(() => ({}));

    // Minimal onboarding fields — adjust to match your form
    const firstName: string = String(body.firstName ?? "").trim();
    const lastName: string = String(body.lastName ?? "").trim();
    const email: string = String(body.email ?? "").trim();
    const phone: string = String(body.phone ?? "").trim();
    const address: string = String(body.address ?? "").trim();
    const smsOptIn: boolean = Boolean(body.smsOptIn);

    // Optional / role + preferences
    const role = parseProfileRole(body.tradeRole) ?? parseProfileRole(body.role) ?? ProfileRole.BOTH;
    const districts: string[] = uniqStrings(body.districts);
    const primaryDistrict: string | undefined = body.primaryDistrict ? String(body.primaryDistrict) : undefined;
    const waterTypes: string[] = uniqStrings(body.waterTypes);

    // Farms (optional)
    const farmsIn: any[] = Array.isArray(body.farms) ? body.farms : [];

    // Require minimal identity
    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: "First name, last name, and email are required." },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const profile = await tx.userProfile.upsert({
        where: { userId: localUser.id },
        create: {
          userId: localUser.id,
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim(),
          email,
          phone,
          address,
          smsOptIn,
          tradeRole: role,
          districts,
          ...(primaryDistrict ? { primaryDistrict } : {}),
          ...(waterTypes.length ? { waterTypes } : {}),
          acceptTerms: true, // <-- mark onboarded
        },
        update: {
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim(),
          email,
          phone,
          address,
          smsOptIn,
          tradeRole: role,
          districts,
          ...(primaryDistrict ? { primaryDistrict } : { primaryDistrict: null }),
          ...(waterTypes.length ? { waterTypes } : { waterTypes: [] }),
          acceptTerms: true, // <-- keep onboarded
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

      return profile;
    });

    // Clerk sync (non-blocking)
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

    // Respond + cookie to help client-side redirect logic
    const res = NextResponse.json({ ok: true, onboarded: true });
    res.headers.append("Set-Cookie", onboardedCookie(userId));
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
