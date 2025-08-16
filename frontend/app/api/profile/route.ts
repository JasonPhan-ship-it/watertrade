// app/api/profile/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ProfileRole } from "@prisma/client"; // enum for tradeRole

const isProd = process.env.NODE_ENV === "production";

/* ------------------------------ Helpers -------------------------------- */

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
    "Max-Age=1800",
    "HttpOnly",
    "SameSite=Lax",
    isProd ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function uniqStrings(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const out = new Set<string>();
  for (const v of arr) {
    const s = String(v ?? "").trim();
    if (s) out.add(s);
  }
  return Array.from(out);
}

function parseProfileRole(val: unknown): ProfileRole | null {
  if (typeof val !== "string") return null;
  const key = val.toUpperCase().replace(/\s+/g, "_");
  // @ts-expect-error index by dynamic key
  return ProfileRole[key] ?? null;
}

// Split "Full Name" into first/last (best-effort)
function splitFullName(fullName?: string | null): { firstName?: string; lastName?: string } {
  const s = (fullName ?? "").trim();
  if (!s) return {};
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");
  return { firstName, lastName };
}

// Compose a response profile that includes BOTH new and legacy fields
function composeResponseProfile(db: any, clerkEmail?: string | null) {
  const email = (db?.email ?? clerkEmail ?? "").trim() || null;
  const firstName = (db?.firstName ?? "").trim() || null;
  const lastName = (db?.lastName ?? "").trim() || null;
  const fullName =
    (db?.fullName ?? "").trim() ||
    [firstName, lastName].filter(Boolean).join(" ") ||
    null;

  const profile = {
    // New/edit shape
    fullName,
    company: db?.company ?? null,
    tradeRole: db?.tradeRole ?? null, // BUYER/SELLER/BOTH/DISTRICT_ADMIN
    primaryDistrict: db?.primaryDistrict ?? null,
    waterTypes: Array.isArray(db?.waterTypes) ? db.waterTypes : [],

    // Legacy/view shape
    firstName,
    lastName,
    address: db?.address ?? null,
    email,
    phone: db?.phone ?? null,
    cellPhone: db?.cellPhone ?? null,
    smsOptIn: typeof db?.smsOptIn === "boolean" ? db.smsOptIn : null,
    districts: Array.isArray(db?.districts) ? db.districts : [],
  };

  return profile;
}

/* -------------------------------- GET ---------------------------------- */

// GET /api/profile  ->  { profile, farms }
export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const localUser = await getOrCreateLocalUser(userId);

  // pull Clerk email as a fallback for display
  const cu = await clerkClient.users.getUser(userId).catch(() => null);
  const clerkEmail =
    cu?.emailAddresses?.find((e) => e.id === cu?.primaryEmailAddressId)?.emailAddress ??
    cu?.emailAddresses?.[0]?.emailAddress ??
    null;

  const dbProfile = await prisma.userProfile.findUnique({
    where: { userId: localUser.id },
  });

  const farms = await prisma.farm.findMany({
    where: { userId: localUser.id },
    orderBy: { createdAt: "asc" },
  });

  const profile = composeResponseProfile(dbProfile, clerkEmail);
  return NextResponse.json({ profile, farms }, { status: 200 });
}

/* -------------------------------- POST --------------------------------- */
// Creates or replaces profile + replaces farms (onboarding/full write)
export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const localUser = await getOrCreateLocalUser(userId);

    const body = await req.json().catch(() => ({}));

    // Primary (onboarding) fields
    const firstName: string = String(body.firstName ?? "").trim();
    const lastName: string = String(body.lastName ?? "").trim();
    const address: string = String(body.address ?? "").trim();
    const email: string = String(body.email ?? "").trim();
    const phone: string = String(body.phone ?? "").trim();
    const cellPhone: string = String(body.cellPhone ?? "").trim();
    const smsOptIn: boolean = Boolean(body.smsOptIn);
    const districts: string[] = uniqStrings(body.districts);

    const farmsIn: any[] = Array.isArray(body.farms) ? body.farms : [];

    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: "First name, last name, and email are required." },
        { status: 400 }
      );
    }

    // Optional / cross-compat fields
    const company = body.company ? String(body.company) : undefined;
    const waterTypes = uniqStrings(body.waterTypes);
    const primaryDistrict = body.primaryDistrict ? String(body.primaryDistrict) : undefined;

    const parsedRole =
      parseProfileRole(body.tradeRole) ?? parseProfileRole(body.role) ?? ProfileRole.BOTH;

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
          ...(company !== undefined ? { company } : {}),
          ...(primaryDistrict !== undefined ? { primaryDistrict } : {}),
          ...(waterTypes.length ? { waterTypes } : {}),
          acceptTerms: true,
          tradeRole: parsedRole,
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
          ...(waterTypes.length ? { waterTypes } : { waterTypes: [] }),
          acceptTerms: true,
          tradeRole: parsedRole,
        },
      });

      // Replace farms
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

      const savedFarms = await tx.farm.findMany({
        where: { userId: localUser.id },
        orderBy: { createdAt: "asc" },
      });

      return { profile, farms: savedFarms };
    });

    // Non-blocking Clerk sync
    clerkClient.users
      .updateUser(userId, {
        firstName,
        lastName,
        publicMetadata: { onboarded: true, smsOptIn, tradeRole: parsedRole },
      })
      .catch(() => {});

    // Update local user email if placeholder
    if (!localUser.email || localUser.email.endsWith("@example.invalid")) {
      await prisma.user.update({
        where: { id: localUser.id },
        data: { email },
      });
    }

    // Return standardized shape
    const composed = composeResponseProfile(result.profile);
    const res = NextResponse.json({ ok: true, profile: composed, farms: result.farms }, { status: 200 });
    res.headers.append("Set-Cookie", onboardedCookie(userId));
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

/* -------------------------------- PUT ---------------------------------- */
// Full replace (same shape as POST). Replaces farms too.
export async function PUT(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const localUser = await getOrCreateLocalUser(userId);

    const body = await req.json().catch(() => ({}));

    const firstName: string = String(body.firstName ?? "").trim();
    const lastName: string = String(body.lastName ?? "").trim();
    const address: string = String(body.address ?? "").trim();
    const email: string = String(body.email ?? "").trim();
    const phone: string = String(body.phone ?? "").trim();
    const cellPhone: string = String(body.cellPhone ?? "").trim();
    const smsOptIn: boolean = Boolean(body.smsOptIn);
    const districts: string[] = uniqStrings(body.districts);

    const farmsIn: any[] = Array.isArray(body.farms) ? body.farms : [];

    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: "First name, last name, and email are required." },
        { status: 400 }
      );
    }

    // Optional
    const company = body.company ? String(body.company) : undefined;
    const waterTypes = uniqStrings(body.waterTypes);
    const primaryDistrict = body.primaryDistrict ? String(body.primaryDistrict) : undefined;
    const acceptTerms =
      typeof body.acceptTerms === "boolean" ? body.acceptTerms : undefined;

    const parsedRole: ProfileRole | undefined =
      parseProfileRole(body.tradeRole) ?? parseProfileRole(body.role) ?? undefined;

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
          ...(waterTypes.length ? { waterTypes } : { waterTypes: [] }),
          ...(acceptTerms !== undefined ? { acceptTerms } : {}),
          ...(parsedRole !== undefined ? { tradeRole: parsedRole } : {}),
        },
      });

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

      const savedFarms = await tx.farm.findMany({
        where: { userId: localUser.id },
        orderBy: { createdAt: "asc" },
      });

      return { profile: updated, farms: savedFarms };
    });

    clerkClient.users
      .updateUser(userId, {
        firstName,
        lastName,
        publicMetadata: {
          onboarded: true,
          smsOptIn,
          ...(parsedRole ? { tradeRole: parsedRole } : {}),
        },
      })
      .catch(() => {});

    const composed = composeResponseProfile(result.profile);
    const res = NextResponse.json({ ok: true, profile: composed, farms: result.farms }, { status: 200 });
    res.headers.append("Set-Cookie", onboardedCookie(userId));
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

/* -------------------------------- PATCH -------------------------------- */
// Partial update for `/profile/edit` page. Does NOT require first/last/email.
export async function PATCH(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const localUser = await getOrCreateLocalUser(userId);

    const body = await req.json().catch(() => ({}));

    // Accept either "role" or "tradeRole"
    const parsedRole =
      parseProfileRole(body.tradeRole) ?? parseProfileRole(body.role) ?? undefined;

    // If only fullName provided, we do a best-effort split; otherwise we’ll keep existing first/last
    const nameParts = splitFullName(body.fullName);

    // Build a partial update object; only set provided keys.
    const data: any = {};

    if (typeof body.fullName === "string") data.fullName = String(body.fullName).trim();
    if (nameParts.firstName) data.firstName = nameParts.firstName;
    if (nameParts.lastName) data.lastName = nameParts.lastName;

    if (typeof body.company === "string") data.company = String(body.company);
    if (typeof body.phone === "string") data.phone = String(body.phone);
    if (typeof body.address === "string") data.address = String(body.address);

    if (typeof body.primaryDistrict === "string") data.primaryDistrict = String(body.primaryDistrict);
    if (Array.isArray(body.waterTypes)) data.waterTypes = uniqStrings(body.waterTypes);
    if (Array.isArray(body.districts)) data.districts = uniqStrings(body.districts);

    if (typeof body.email === "string") data.email = String(body.email).trim();
    if (typeof body.cellPhone === "string") data.cellPhone = String(body.cellPhone);
    if (typeof body.smsOptIn === "boolean") data.smsOptIn = Boolean(body.smsOptIn);
    if (typeof body.acceptTerms === "boolean") data.acceptTerms = Boolean(body.acceptTerms);

    if (parsedRole) data.tradeRole = parsedRole;

    // If nothing to update, just return current state
    if (Object.keys(data).length === 0) {
      const db = await prisma.userProfile.findUnique({ where: { userId: localUser.id } });
      const farms = await prisma.farm.findMany({
        where: { userId: localUser.id },
        orderBy: { createdAt: "asc" },
      });
      const composed = composeResponseProfile(db);
      return NextResponse.json({ ok: true, profile: composed, farms }, { status: 200 });
    }

    const updated = await prisma.userProfile.upsert({
      where: { userId: localUser.id },
      create: { userId: localUser.id, ...data },
      update: data,
    });

    // Optional farms update if caller passes `farms`
    if (Array.isArray(body.farms)) {
      await prisma.farm.deleteMany({ where: { userId: localUser.id } });
      const cleanFarms = body.farms
        .map((f: any) => ({
          name: String(f?.name ?? "").trim(),
          accountNumber: String(f?.accountNumber ?? "").trim(),
          district: String(f?.district ?? "").trim(),
        }))
        .filter((f: any) => f.name || f.accountNumber || f.district);

      if (cleanFarms.length) {
        await prisma.farm.createMany({
          data: cleanFarms.map((f: any) => ({
            userId: localUser.id,
            name: f.name || null,
            accountNumber: f.accountNumber || null,
            district: f.district || null,
          })),
        });
      }
    }

    // Non-blocking Clerk sync for name + flags
    const clerkPatch: any = {};
    if (data.firstName) clerkPatch.firstName = data.firstName;
    if (data.lastName) clerkPatch.lastName = data.lastName;
    const publicMetadata: Record<string, any> = {};
    if (typeof data.smsOptIn === "boolean") publicMetadata.smsOptIn = data.smsOptIn;
    if (parsedRole) publicMetadata.tradeRole = parsedRole;
    if (Object.keys(publicMetadata).length) clerkPatch.publicMetadata = publicMetadata;
    if (Object.keys(clerkPatch).length) {
      clerkClient.users.updateUser(userId, clerkPatch).catch(() => {});
    }

    const farms = await prisma.farm.findMany({
      where: { userId: localUser.id },
      orderBy: { createdAt: "asc" },
    });

    const composed = composeResponseProfile(updated);
    return NextResponse.json({ ok: true, profile: composed, farms }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
