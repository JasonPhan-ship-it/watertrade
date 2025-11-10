export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  Prisma,
  WaterIntegrationStatus,
  WaterProvider,
} from "@prisma/client";

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

function serializeIntegration(integration: any) {
  if (!integration) return null;
  const balanceAf = integration.balanceAf
    ? Number((integration.balanceAf as Prisma.Decimal).toFixed(2))
    : null;

  return {
    id: integration.id,
    status: integration.status as WaterIntegrationStatus,
    provider: integration.provider as WaterProvider,
    consentedAt: integration.consentedAt?.toISOString() ?? null,
    lastSyncedAt: integration.lastSyncedAt?.toISOString() ?? null,
    balanceAf,
    balanceUpdatedAt: integration.balanceUpdatedAt?.toISOString() ?? null,
    errorMessage: integration.errorMessage ?? null,
  };
}

type ScrapeResult = {
  balanceAf: number;
  fetchedAt: Date;
};

async function simulateWestlandsScrape(accountNumber?: string | null): Promise<ScrapeResult> {
  const numericAccount = Number(String(accountNumber ?? "").replace(/\D+/g, ""));
  const seed = Number.isFinite(numericAccount) && numericAccount > 0 ? numericAccount : Date.now();
  const pseudoBalance = (seed % 5000) / 10 + 250; // deterministic-ish but stable per account

  return {
    balanceAf: Math.round(pseudoBalance * 100) / 100,
    fetchedAt: new Date(),
  };
}

export async function GET() {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const localUser = await getOrCreateLocalUser(userId);

    const integration = await prisma.waterIntegration.findUnique({
      where: {
        userId_provider: {
          userId: localUser.id,
          provider: WaterProvider.WESTLANDS,
        },
      },
    });

    return NextResponse.json({ integration: serializeIntegration(integration) });
  } catch (error: any) {
    console.error("[GET /api/integrations/westlands]", error);
    return NextResponse.json({ error: "Failed to load integration status" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const localUser = await getOrCreateLocalUser(userId);
    const body = await req.json().catch(() => ({}));

    const consent = Boolean(body?.consent);
    const accountNumber = typeof body?.accountNumber === "string" ? body.accountNumber : null;

    if (!consent) {
      const integration = await prisma.waterIntegration.upsert({
        where: {
          userId_provider: {
            userId: localUser.id,
            provider: WaterProvider.WESTLANDS,
          },
        },
        create: {
          userId: localUser.id,
          provider: WaterProvider.WESTLANDS,
          status: WaterIntegrationStatus.DECLINED,
          consentedAt: null,
          balanceAf: null,
          balanceUpdatedAt: null,
          lastSyncedAt: new Date(),
          errorMessage: null,
        },
        update: {
          status: WaterIntegrationStatus.DECLINED,
          consentedAt: null,
          balanceAf: null,
          balanceUpdatedAt: null,
          lastSyncedAt: new Date(),
          errorMessage: null,
        },
      });

      return NextResponse.json({ integration: serializeIntegration(integration) });
    }

    const scrapeResult = await simulateWestlandsScrape(accountNumber);

    const integration = await prisma.waterIntegration.upsert({
      where: {
        userId_provider: {
          userId: localUser.id,
          provider: WaterProvider.WESTLANDS,
        },
      },
      create: {
        userId: localUser.id,
        provider: WaterProvider.WESTLANDS,
        status: WaterIntegrationStatus.CONNECTED,
        consentedAt: new Date(),
        lastSyncedAt: new Date(),
        balanceAf: new Prisma.Decimal(scrapeResult.balanceAf),
        balanceUpdatedAt: scrapeResult.fetchedAt,
        errorMessage: null,
      },
      update: {
        status: WaterIntegrationStatus.CONNECTED,
        consentedAt: {
          set: new Date(),
        },
        lastSyncedAt: new Date(),
        balanceAf: new Prisma.Decimal(scrapeResult.balanceAf),
        balanceUpdatedAt: scrapeResult.fetchedAt,
        errorMessage: null,
      },
    });

    return NextResponse.json({ integration: serializeIntegration(integration) });
  } catch (error: any) {
    console.error("[POST /api/integrations/westlands]", error);

    const message = error?.message || "Failed to connect to Westlands";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
