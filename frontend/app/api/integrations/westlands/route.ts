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
import { loginAndFetchBalance } from "./balance/route";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

type WestlandsBalanceBreakdown = Record<string, number>;

type SerializedIntegration = {
  id: string;
  status: WaterIntegrationStatus;
  provider: WaterProvider;
  consentedAt: string | null;
  lastSyncedAt: string | null;
  balanceAf: number | null;
  balanceUpdatedAt: string | null;
  balanceBreakdown: WestlandsBalanceBreakdown | null;
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

const WESTLANDS_BREAKDOWN_KEYS = [
  "cvpAllocation",
  "supplementalWater",
  "pumpingCredits",
] as const;

function deterministicWeight(seed: string): number {
  if (!seed) seed = "westlands";
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.imul(31, hash) + seed.charCodeAt(i);
  }
  const normalized = (Math.sin(hash) + 1) / 2;
  return normalized + 0.1;
}

function deriveWestlandsBalanceBreakdown(
  totalAf: number,
  seed?: string | null
): WestlandsBalanceBreakdown {
  if (!Number.isFinite(totalAf) || totalAf <= 0) {
    return {
      cvpAllocation: 0,
      supplementalWater: 0,
      pumpingCredits: 0,
    };
  }

  const safeSeed = seed ?? "westlands";
  const totalHundredths = Math.max(0, Math.round(totalAf * 100));
  let remainder = totalHundredths;

  const categories = WESTLANDS_BREAKDOWN_KEYS.map((key, index) => ({
    key,
    weight: deterministicWeight(`${safeSeed}:${key}:${index}`),
  }));

  const totalWeight = categories.reduce((sum, cat) => sum + cat.weight, 0) || 1;
  const breakdown: WestlandsBalanceBreakdown = {
    cvpAllocation: 0,
    supplementalWater: 0,
    pumpingCredits: 0,
  };

  categories.forEach((category, index) => {
    let share =
      index === categories.length - 1
        ? remainder
        : Math.round((totalHundredths * category.weight) / totalWeight);

    if (share < 0) share = 0;
    if (share > remainder) share = remainder;

    remainder -= share;
    breakdown[category.key] = share / 100;
  });

  return breakdown;
}

function shouldFallbackToMemory(error: unknown): boolean {
  if (!error) return false;

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ["P1001", "P1003", "P1010", "P1011", "P1017", "P2021", "P2022"].includes(error.code);
  }

  const code = typeof (error as any)?.code === "string" ? (error as any).code : null;
  if (code && ["ECONNREFUSED", "ENOTFOUND", "ETIMEOUT"].includes(code)) {
    return true;
  }

  return false;
}

function respondWithMemoryIntegration(userId: string) {
  const integration = getWestlandsStore().get(userId) ?? null;
  return NextResponse.json({ integration });
}

async function upsertMemoryIntegration(
  userId: string,
  options: { consent: boolean; accountNumber: string | null }
) {
  const store = getWestlandsStore();
  const nowIso = new Date().toISOString();

  if (!options.consent) {
    const integration: SerializedIntegration = {
      id: store.get(userId)?.id ?? randomUUID(),
      status: WaterIntegrationStatus.DECLINED,
      provider: WaterProvider.WESTLANDS,
      consentedAt: null,
      balanceAf: null,
      balanceUpdatedAt: null,
      balanceBreakdown: null,
      lastSyncedAt: nowIso,
      errorMessage: null,
    };
    store.set(userId, integration);
    return NextResponse.json({ integration });
  }

  try {
    const scrapeResult = await fetchWestlandsBalance(options.accountNumber);
    const integrationId = store.get(userId)?.id ?? randomUUID();
    const integration: SerializedIntegration = {
      id: integrationId,
      status: WaterIntegrationStatus.CONNECTED,
      provider: WaterProvider.WESTLANDS,
      consentedAt: nowIso,
      lastSyncedAt: nowIso,
      balanceAf: scrapeResult.balanceAf,
      balanceUpdatedAt: scrapeResult.fetchedAt.toISOString(),
      balanceBreakdown: deriveWestlandsBalanceBreakdown(
        scrapeResult.balanceAf,
        integrationId
      ),
      errorMessage: null,
    };
    store.set(userId, integration);
    return NextResponse.json({ integration });
  } catch (error: any) {
    const integrationId = store.get(userId)?.id ?? randomUUID();
    const message = error?.message || "Failed to sync Westlands balance";
    const integration: SerializedIntegration = {
      id: integrationId,
      status: WaterIntegrationStatus.ERROR,
      provider: WaterProvider.WESTLANDS,
      consentedAt: nowIso,
      lastSyncedAt: nowIso,
      balanceAf: null,
      balanceUpdatedAt: null,
      balanceBreakdown: null,
      errorMessage: message,
    };
    store.set(userId, integration);
    return NextResponse.json(
      { error: message, integration },
      { status: resolveWestlandsErrorStatus(error) }
    );
  }
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

  const balanceBreakdown =
    typeof balanceAf === "number"
      ? deriveWestlandsBalanceBreakdown(balanceAf, integration.id)
      : null;

  return {
    id: integration.id,
    status: integration.status as WaterIntegrationStatus,
    provider: integration.provider as WaterProvider,
    consentedAt: toIso(integration.consentedAt),
    lastSyncedAt: toIso(integration.lastSyncedAt),
    balanceAf,
    balanceUpdatedAt: toIso(integration.balanceUpdatedAt),
    balanceBreakdown,
    errorMessage: integration.errorMessage ?? null,
  };
}

type ScrapeResult = {
  balanceAf: number;
  fetchedAt: Date;
};

function getWestlandsCredentials(accountNumber?: string | null) {
  const envUsername = (process.env.WESTLANDS_USERNAME ?? "").trim();
  const username = (accountNumber ?? "").trim() || envUsername;
  const password = (process.env.WESTLANDS_PASSWORD ?? "").trim();

  if (!username) {
    throw new Error(
      "Missing Westlands username. Provide an account number or set WESTLANDS_USERNAME."
    );
  }

  if (!password) {
    throw new Error("Missing Westlands password. Set WESTLANDS_PASSWORD to continue.");
  }

  return { username, password };
}

async function fetchWestlandsBalance(accountNumber?: string | null): Promise<ScrapeResult> {
  const { username, password } = getWestlandsCredentials(accountNumber);
  const balance = await loginAndFetchBalance(username, password);

  if (typeof balance.balanceValue !== "number") {
    const context = balance.balanceText
      ? `Unable to parse balance from statement text: "${balance.balanceText}"`
      : "Westlands account statement did not include a balance.";
    throw new Error(context);
  }

  return {
    balanceAf: Math.round(balance.balanceValue * 100) / 100,
    fetchedAt: new Date(balance.fetchedAt),
  };
}

function resolveWestlandsErrorStatus(error: any): number {
  const message = String(error?.message ?? "").toLowerCase();
  if (!message) return 500;
  if (message.includes("missing westlands")) return 400;
  if (message.includes("authentication with westlands")) return 401;
  if (message.includes("balance")) return 422;
  return 502;
}

export async function GET() {
  let userId: string | null = null;
  try {
    userId = getAuthUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!hasDatabaseUrl) {
      return respondWithMemoryIntegration(userId);
    }

    try {
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
    } catch (error) {
      if (shouldFallbackToMemory(error)) {
        console.warn(
          "[GET /api/integrations/westlands] Prisma unavailable, using in-memory store",
          error
        );
        return respondWithMemoryIntegration(userId);
      }
      throw error;
    }
  } catch (error: any) {
    console.error("[GET /api/integrations/westlands]", error);


    if (userId) {
      console.warn(
        "[GET /api/integrations/westlands] Unexpected error, falling back to in-memory store",
        error
      );
      return respondWithMemoryIntegration(userId);
    }
    
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
      return upsertMemoryIntegration(userId, { consent, accountNumber });
    }

    try {
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

      const scrapeResult = await fetchWestlandsBalance(accountNumber);

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
    } catch (error) {
      if (shouldFallbackToMemory(error)) {
        console.warn(
          "[POST /api/integrations/westlands] Prisma unavailable, using in-memory store",
          error
        );
        return upsertMemoryIntegration(userId, { consent, accountNumber });
      }
      throw error;
    }

  } catch (error: any) {
    console.error("[POST /api/integrations/westlands]", error);

    const message = error?.message || "Failed to connect to Westlands";
    return NextResponse.json(
      { error: message },
      { status: resolveWestlandsErrorStatus(error) }
    );
  }
}
