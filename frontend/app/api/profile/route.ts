// app/api/profile/route.ts
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
    cu?.emailAddresses?.find(e => e.id === cu.primaryEmailAddressId)?.emailAddress ??
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

export async function POST(req: Request) {
  try {
    const { userId: clerkUserId } = auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

// ... inside POST, after the successful upsert and the fire-and-forget Clerk update
// Fire-and-forget Clerk metadata update so we don't block response
clerkClient.users.updateUser(clerkUserId, { publicMetadata: { onboarded: true } }).catch(() => {});

// ✅ Set cookie and redirect to /dashboard from the API itself
const redirect = NextResponse.redirect(new URL("/dashboard", req.url), 303);
redirect.headers.append(
  "Set-Cookie",
  [
    "onboarded=1",
    "Path=/",
    "Max-Age=300",               // 5 minutes
    "HttpOnly",                  // server-readable for middleware
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ].filter(Boolean).join("; ")
);
return redirect;
