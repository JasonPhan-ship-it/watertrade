// app/api/profile/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

const isProd = process.env.NODE_ENV === "production";

// --- Helpers --------------------------------------------------------------

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

function uniqStrings(arr: string[] | undefined | null) {
  if (!arr) return [];
  const set = new Set<string>();
  for (const v of arr) {
    const s = String(v || "").trim();
    if (s) set.add(s);
  }
  return Array.from(set);
}

// --- Routes ---------------------------------------------------------------

// GET /api/profile
// Returns { profile, farms }
export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getOrCreateLocalUser(userId);

  const profile = await prisma.userProfile.findUnique({
    where: { userId: user.id },
  });

  const farms = await prisma.farm.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ profile, farms }, { status: 200 });
}

// POST /api/profile
// Creates or replaces profile + replaces farm list (atomic)
export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const localUser = await getOrCreateLocalUser(userId);

    const body = await req.json().catch(() => ({}));

    // Accept new onboarding shape; tolerate legacy fields gracefully
    const firstName: string = (body.firstName ?? "").trim();
    const lastName: string = (body.lastName ?? "").trim();
    const address: string = (body.address ?? "").trim();
    const email: string = (body.email ?? "").trim();
    const phone: string = (body.phone ?? "").trim();
    const cellPhone: string = (body.cellPhone ?? "").trim();
    const smsOptIn: boolean = Boolean(body.smsOptIn);
    const districts: string[] = uniqStrings(body.districts);

    const farms: Array<{
      name?: string;
      accountNumber?: string;
      district?: string;
    }> = Array.isArray(body.farms) ? body.farms : [];

    // Basic validation for the new flow
    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: "First name, last name, and email are required." },
        { status: 400 }
      );
    }

    // Optional: if you still receive legacy payloads, pick them up (no hard validation)
    const company: string | undefined = body.company ? String(body.company) : undefined;
    const waterTypes: string[] | undefined = Array.isArray(body.waterTypes)
      ? body.waterTypes.map((w: any) => String(w))
      : undefined;
    const primaryDistrict: string | undefined = body.primaryDistrict
      ? String(body.primaryDistrict)
      : undefined;

    // Persist within a transaction: upsert profile, replace farms
    const result = await prisma.$transaction(async (tx) => {
      const profile = await tx.userProfile.upsert({
        where: { userId: localUser.id },
        create: {
          userId: localUser.id,
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim(),
          address,
          email,
          phone,
          cellPhone,
          smsOptIn,
          districts,
          // legacy-friendly fields (if your schema still has them; otherwise remove)
          ...(company !== undefined ? { company } : {}),
          ...(primaryDistrict !== undefined ? { primaryDistrict } : {}),
          ...(waterTypes !== undefined ? { waterTypes } : {}),
          // Mark terms as accepted during onboarding if you do that here
          acceptTerms: true,
        },
        update: {
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim(),
          address,
          email,
          phone,
          cellPhone,
          smsOptIn,
          districts,
          ...(company !== undefined ? { company } : {}),
          ...(primaryDistrict !== undefined ? { primaryDistrict } : {}),
          ...(waterTypes !== undefined ? { waterTypes } : {}),
          acceptTerms: true,
        },
      });

      // Replace farms for this user
      await tx.farm.deleteMany({ where: { userId: localUser.id } });

      const cleanFarms = farms
        .map((f) => ({
          name: String(f?.name ?? "").trim(),
          accountNumber: String(f?.accountNumber ?? "").trim(),
          district: String(f?.district ?? "").trim(),
        }))
        .filter((f) => f.name || f.accountNumber || f.district);

      if (cleanFarms.length > 0) {
        await tx.farm.createMany({
          data: cleanFarms.map((f) => ({
            userId: localUser.id,
            name: f.name || null,
            accountNumber: f.accountNumber || null,
            district: f.district || null,
          })),
        });
      }

      const savedFarms = await tx.farm.findMany({
        where: { userId: localUser.id },
        orderBy: { createdAt: "asc" },
      });

      return { profile, farms: savedFarms };
    });

    // Update Clerk metadata and basic fields (non-blocking)
    clerkClient.users
      .updateUser(userId, {
        firstName,
        lastName,
        publicMetadata: { onboarded: true, smsOptIn },
      })
      .catch(() => {});

    // Optionally keep local user email in sync if it's empty/placeholder
    if (!localUser.email || localUser.email.endsWith("@example.invalid")) {
      await prisma.user.update({
        where: { id: localUser.id },
        data: { email },
      });
    }

    const res = NextResponse.json({ ok: true, ...result }, { status: 200 });
    res.headers.append("Set-Cookie", onboardedCookie(userId));
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

// PUT /api/profile
// Full update (same shape as POST). Replaces farms, too.
export async function PUT(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const localUser = await getOrCreateLocalUser(userId);

    const body = await req.json().catch(() => ({}));

    const firstName: string = (body.firstName ?? "").trim();
    const lastName: string = (body.lastName ?? "").trim();
    const address: string = (body.address ?? "").trim();
    const email: string = (body.email ?? "").trim();
    const phone: string = (body.phone ?? "").trim();
    const cellPhone: string = (body.cellPhone ?? "").trim();
    const smsOptIn: boolean = Boolean(body.smsOptIn);
    const districts: string[] = uniqStrings(body.districts);

    const farms: Array<{
      name?: string;
      accountNumber?: string;
      district?: string;
    }> = Array.isArray(body.farms) ? body.farms : [];

    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: "First name, last name, and email are required." },
        { status: 400 }
      );
    }

    // Legacy optional fields
    const company: string | undefined = body.company ? String(body.company) : undefined;
    const waterTypes: string[] | undefined = Array.isArray(body.waterTypes)
      ? body.waterTypes.map((w: any) => String(w))
      : undefined;
    const primaryDistrict: string | undefined = body.primaryDistrict
      ? String(body.primaryDistrict)
      : undefined;
    const acceptTerms: boolean | undefined =
      typeof body.acceptTerms === "boolean" ? body.acceptTerms : undefined;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.userProfile.update({
        where: { userId: localUser.id },
        data: {
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim(),
          address,
          email,
          phone,
          cellPhone,
          smsOptIn,
          districts,
          ...(company !== undefined ? { company } : {}),
          ...(primaryDistrict !== undefined ? { primaryDistrict } : {}),
          ...(waterTypes !== undefined ? { waterTypes } : {}),
          ...(acceptTerms !== undefined ? { acceptTerms } : {}),
        },
      });

      // Replace farms
      await tx.farm.deleteMany({ where: { userId: localUser.id } });

      const cleanFarms = farms
        .map((f) => ({
          name: String(f?.name ?? "").trim(),
          accountNumber: String(f?.accountNumber ?? "").trim(),
          district: String(f?.district ?? "").trim(),
        }))
        .filter((f) => f.name || f.accountNumber || f.district);

      if (cleanFarms.length > 0) {
        await tx.farm.createMany({
          data: cleanFarms.map((f) => ({
            userId: localUser.id,
            name: f.name || null,
            accountNumber: f.accountNumber || null,
            district: f.district || null,
          })),
        });
      }

      const savedFarms = await tx.farm.findMany({
        where: { userId: localUser.id },
        orderBy: { createdAt: "asc" },
      });

      return { profile: updated, farms: savedFarms };
    });

    // Keep Clerk basics in sync (non-blocking)
    clerkClient.users
      .updateUser(userId, {
        firstName,
        lastName,
        publicMetadata: { onboarded: true, smsOptIn },
      })
      .catch(() => {});

    const res = NextResponse.json({ ok: true, ...result }, { status: 200 });
    res.headers.append("Set-Cookie", onboardedCookie(userId));
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
