import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { revalidatePath } from "next/cache";

// --- Prisma helpers (or import from your lib) ---
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

// If you already have a SiteSetting model + helpers, you can replace this with your own
async function setSiteSetting<T = unknown>(key: string, value: T) {
  return prisma.siteSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

// --- Validation (loosened to match your current shape) ---
const MetricCard = z.object({
  label: z.string(),
  formatter: z.enum(["integer", "currency"]),
});
const CopySchema = z.object({
  hero: z.object({
    preheading: z.string(),
    signedInCta: z.string(),
    signedOutPrimaryCta: z.string(),
    signedOutSecondaryCta: z.string(),
    description: z.string(),
    metricsError: z.string(),
    phrases: z.array(z.string()),
  }),
  metrics: z.object({ cards: z.array(MetricCard) }),
  // These sections are complex; accept as-is but still require objects
  coreWorkflows: z.record(z.any()),
  process: z.record(z.any()),
  gradientCta: z.record(z.any()),
  cookieBanner: z.record(z.any()),
  logoutToast: z.record(z.any()),
});

export const runtime = "nodejs"; // Prisma needs Node (not Edge)

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

    const body = await req.json();
    const parsed = CopySchema.parse(body);

    await setSiteSetting("homepageCopy", parsed);

    // Revalidate the admin edit page and the public homepage
    revalidatePath("/admin/homepage");
    revalidatePath("/");

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", issues: err.flatten() }, { status: 400 });
    }
    console.error("[PUT /api/site-settings/homepage-copy]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
