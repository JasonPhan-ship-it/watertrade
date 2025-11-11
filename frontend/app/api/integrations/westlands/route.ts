export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  Prisma,
  WaterIntegrationStatus,
  WaterProvider,
} from "@prisma/client";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

type SerializedIntegration = {
  id: string;
  status: WaterIntegrationStatus;
  provider: WaterProvider;
  consentedAt: string | null;
  lastSyncedAt: string | null;
  balanceAf: number | null;
  balanceUpdatedAt: string | null;
  errorMessage: string | null;
};

const globalForWestlands = globalThis as unknown as {
  __westlandsIntegrationStore?: Map<string, SerializedIntegration>;
};

let loggedAuthWarning = false;

function getAuthUserId(): string | null {
  try {
    const { userId } = auth();
    return userId ?? null;
  } catch (error) {
    if (!loggedAuthWarning) {
      loggedAuthWarning = true;
      console.warn(
        "[westlands] Clerk auth unavailable – treating request as unauthenticated",
        error
      );
    }
    return null;
  }
}

function getWestlandsStore() {
  if (!globalForWestlands.__westlandsIntegrationStore) {
    globalForWestlands.__westlandsIntegrationStore = new Map();
  }
  return globalForWestlands.__westlandsIntegrationStore;
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

function serializeIntegration(integration: any): SerializedIntegration | null {
  if (!integration) return null;

  const balanceAfRaw = integration.balanceAf;
  let balanceAf: number | null = null;
  if (typeof balanceAfRaw === "number") {
    balanceAf = Math.round(balanceAfRaw * 100) / 100;
  } else if (balanceAfRaw instanceof Prisma.Decimal) {
    balanceAf = Number(balanceAfRaw.toFixed(2));
  } else if (typeof balanceAfRaw === "string") {
    const parsed = Number(balanceAfRaw);
    balanceAf = Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
  } else if (balanceAfRaw && typeof balanceAfRaw === "object" && "toFixed" in balanceAfRaw) {
    // Handles edge cases where Decimal comes from proxied objects
    try {
      balanceAf = Number((balanceAfRaw as Prisma.Decimal).toFixed(2));
    } catch {
      balanceAf = null;
    }
  }

  const toIso = (value: unknown) => {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (value instanceof Date) return value.toISOString();
    try {
      return new Date(value as string).toISOString();
    } catch {
      return null;
    }
  };

  return {
    id: integration.id,
    status: integration.status as WaterIntegrationStatus,
    provider: integration.provider as WaterProvider,
    consentedAt: toIso(integration.consentedAt),
    lastSyncedAt: toIso(integration.lastSyncedAt),
    balanceAf,
    balanceUpdatedAt: toIso(integration.balanceUpdatedAt),
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
    const userId = getAuthUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!hasDatabaseUrl) {
      const integration = getWestlandsStore().get(userId) ?? null;
      return NextResponse.json({ integration });
    }

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
    const userId = getAuthUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    const consent = Boolean(body?.consent);
    const accountNumber = typeof body?.accountNumber === "string" ? body.accountNumber : null;

    if (!hasDatabaseUrl) {
      const store = getWestlandsStore();
      const nowIso = new Date().toISOString();

      if (!consent) {
        const integration: SerializedIntegration = {
          id: store.get(userId)?.id ?? randomUUID(),
          status: WaterIntegrationStatus.DECLINED,
          provider: WaterProvider.WESTLANDS,
          consentedAt: null,
          balanceAf: null,
          balanceUpdatedAt: null,
          lastSyncedAt: nowIso,
          errorMessage: null,
        };
        store.set(userId, integration);
        return NextResponse.json({ integration });
      }

      const scrapeResult = await simulateWestlandsScrape(accountNumber);
      const integration: SerializedIntegration = {
        id: store.get(userId)?.id ?? randomUUID(),
        status: WaterIntegrationStatus.CONNECTED,
        provider: WaterProvider.WESTLANDS,
        consentedAt: nowIso,
        lastSyncedAt: nowIso,
        balanceAf: scrapeResult.balanceAf,
        balanceUpdatedAt: scrapeResult.fetchedAt.toISOString(),
        errorMessage: null,
      };
      store.set(userId, integration);
      return NextResponse.json({ integration });
    }

    const localUser = await getOrCreateLocalUser(userId);

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
