// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const isProd = process.env.NODE_ENV === "production";

// Prevent multiple instances in dev (Next.js hot reload)
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Verbose logs in dev; quieter in prod
    log: isProd ? ["error", "warn"] : ["query", "error", "warn"],
  });

if (!isProd) globalForPrisma.prisma = prisma;

export default prisma;
