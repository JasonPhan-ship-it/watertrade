import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSiteSetting } from "@/lib/site-settings";

// ---------- helpers ----------
async function getOrCreateUser(clerkId: string) {
  let user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    const cu = await clerkClient.users.getUser(clerkId);
    const email =
      cu?.emailAddresses?.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ||
      cu?.emailAddresses?.[0]?.emailAddress ||
      `${clerkId}@example.local`;
    const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.username || undefined;
    user = await prisma.user.create({ data: { clerkId, email, name } });
  }
  return user;
}

async function setSiteSetting(key: string, value: Prisma.InputJsonValue) {
  return prisma.siteSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

// ---------- validation (defensive) ----------
const s = z.string().catch("").default("");
const MetricCard = z.object({
  label: s,
  formatter: z.enum(["integer", "currency"]).catch("integer"),
});

const CopySchema = z.object({
  hero: z.object({
    preheading: s,
    signedInCta: s,
    signedOutPrimaryCta: s,
    signedOutSecondaryCta: s,
    description: s,
    metricsError: s,
    phrases: z.array(z.string()).catch([]).default([]),
  }),
  metrics: z.object({
    cards: z.array(MetricCard).catch([]).default([]),
  }),
  // Keep these permissive to avoid breaking on extra fields while you iterate
  coreWorkflows: z.unknown(),
  process: z.unknown(),
  gradientCta: z.unknown(),
  cookieBanner: z.unknown(),
  logoutToast: z.unknown(),
});

export const runtime = "nodejs"; // Prisma requires Node runtime

export async function GET() {
  try {
    const value = await getSiteSetting("homepageCopy");
    return NextResponse.json({ value });
  } catch (err: any) {
    console.error("[GET /api/site-settings/homepage-copy] ERROR", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateUser(userId);
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (e: any) {
      // Bad/empty JSON bodies manifest as 500s by default—make this explicit
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = CopySchema.parse(body);

    await setSiteSetting("homepageCopy", parsed as Prisma.InputJsonValue);

    // Revalidate the admin edit page and the public homepage
    revalidatePath("/admin/homepage");
    revalidatePath("/");

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // Log with rich context (watch Vercel logs)
    console.error("[PUT /api/site-settings/homepage-copy] ERROR", {
      message: err?.message,
      name: err?.name,
      code: err?.code,      // Prisma code like P2021, P2002, etc.
      meta: err?.meta,
      stack: err?.stack,
    });

    if (err?.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation failed", issues: err.flatten() },
        { status: 400 }
      );
    }

    // While debugging, expose minimal details to the client
    return NextResponse.json(
      { error: "Internal error", details: err?.message ?? null, code: err?.code ?? null },
      { status: 500 }
    );
  }
}
