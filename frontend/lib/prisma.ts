// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const isProd = process.env.NODE_ENV === "production";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ["error", "warn"] : ["query", "error", "warn"],
  });

if (!isProd) globalForPrisma.prisma = prisma;

// Optional: connect eagerly in dev to fail fast on bad DATABASE_URL
if (!isProd) prisma.$connect().catch(() => {/* ignore during build */});

export default prisma;
