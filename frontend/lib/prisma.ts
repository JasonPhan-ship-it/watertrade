// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const isProd = process.env.NODE_ENV === "production";

// Reuse a single Prisma instance in dev to avoid running out of connections on HMR
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ["error", "warn"] : ["query", "error", "warn"],
  });

// Only assign to global in non-production (prevents multiple instances in prod lambdas)
if (!isProd) globalForPrisma.prisma = prisma;

// Optional: connect eagerly in dev to fail fast on invalid DATABASE_URL, but
// avoid doing this in production/serverless build steps.
if (!isProd) {
  prisma.$connect().catch(() => {
    /* ignore connect errors at build/HMR */
  });
}

export default prisma;
