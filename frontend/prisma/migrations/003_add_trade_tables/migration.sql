-- Enable UUIDs (safe if already installed)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums (safe to re-run)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tradestatus') THEN
    CREATE TYPE "TradeStatus" AS ENUM (
      'OFFERED',
      'COUNTERED_BY_SELLER',
      'COUNTERED_BY_BUYER',
      'ACCEPTED_PENDING_BUYER_SIGNATURE',
      'ACCEPTED_PENDING_SELLER_SIGNATURE',
      'FULLY_EXECUTED',
      'DECLINED',
      'CANCELLED',
      'EXPIRED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signatureprogress') THEN
    CREATE TYPE "SignatureProgress" AS ENUM ('NONE','REQUESTED','SIGNED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'party') THEN
    CREATE TYPE "Party" AS ENUM ('BUYER','SELLER');
  END IF;
END
$$ LANGUAGE plpgsql;

-- Trade table (create if missing)
CREATE TABLE IF NOT EXISTS "Trade" (
  "id" TEXT PRIMARY KEY,
  "listingId" TEXT NOT NULL,
  "sellerUserId" TEXT NOT NULL,
  "buyerUserId" TEXT NOT NULL,

  -- snapshot fields
  "district" TEXT NOT NULL,
  "waterType" TEXT,
  "volumeAf" INTEGER NOT NULL,
  "pricePerAf" INTEGER NOT NULL,      -- cents per AF
  "windowLabel" TEXT,

  "status" "TradeStatus" NOT NULL DEFAULT 'OFFERED',
  "round" INTEGER NOT NULL DEFAULT 1,
  "lastActor" "Party",

  -- magic-link tokens
  "sellerToken" UUID NOT NULL DEFAULT gen_random_uuid(),
  "buyerToken"  UUID NOT NULL DEFAULT gen_random_uuid(),

  -- signature progress
  "buyerSignStatus"  "SignatureProgress" NOT NULL DEFAULT 'NONE',
  "sellerSignStatus" "SignatureProgress" NOT NULL DEFAULT 'NONE',
  "buyerSignUrl" TEXT,
  "sellerSignUrl" TEXT,

  -- final docs
  "agreementUrl" TEXT,

  -- optional link to Transaction (1:1)
  "transactionId" TEXT UNIQUE,

  -- optimistic concurrency
  "version" INTEGER NOT NULL DEFAULT 0,

  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),

  CONSTRAINT "Trade_listingId_fkey"      FOREIGN KEY ("listingId")      REFERENCES "Listing"("id")     ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trade_sellerUserId_fkey"   FOREIGN KEY ("sellerUserId")   REFERENCES "User"("id")        ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trade_buyerUserId_fkey"    FOREIGN KEY ("buyerUserId")    REFERENCES "User"("id")        ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trade_transactionId_fkey"  FOREIGN KEY ("transactionId")  REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Trade indexes
CREATE INDEX IF NOT EXISTS "Trade_listingId_status_createdAt_idx" ON "Trade" ("listingId","status","createdAt");
CREATE INDEX IF NOT EXISTS "Trade_sellerUserId_status_idx"       ON "Trade" ("sellerUserId","status");
CREATE INDEX IF NOT EXISTS "Trade_buyerUserId_status_idx"        ON "Trade" ("buyerUserId","status");

-- TradeEvent table (create if missing)
CREATE TABLE IF NOT EXISTS "TradeEvent" (
  "id" TEXT PRIMARY KEY,
  "tradeId" TEXT NOT NULL,
  "actor" TEXT NOT NULL,   -- "buyer" | "seller" | "system"
  "kind"  TEXT NOT NULL,   -- "OFFER" | "COUNTER" | "ACCEPT" | "DECLINE" | ...
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "TradeEvent_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- TradeEvent index
CREATE INDEX IF NOT EXISTS "TradeEvent_tradeId_createdAt_idx" ON "TradeEvent" ("tradeId","createdAt");
