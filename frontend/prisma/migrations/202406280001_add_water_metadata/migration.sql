-- Ensure pgcrypto for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create WaterDistrict table
CREATE TABLE IF NOT EXISTS "WaterDistrict" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create WaterCode table
CREATE TABLE IF NOT EXISTS "WaterCode" (
  "id"          TEXT PRIMARY KEY,
  "districtId"  TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "year"        TEXT NOT NULL,
  "description" TEXT,
  "category"    TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "WaterCode_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "WaterDistrict"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "WaterCode_district_code_year_key"
  ON "WaterCode" ("districtId", "code", "year");

CREATE INDEX IF NOT EXISTS "WaterCode_districtId_code_idx"
  ON "WaterCode" ("districtId", "code");

-- Add Listing columns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Listing') THEN
    ALTER TABLE "Listing"
      ADD COLUMN IF NOT EXISTS "waterCodeId" TEXT,
      ADD COLUMN IF NOT EXISTS "waterCodeValue" TEXT,
      ADD COLUMN IF NOT EXISTS "waterCodeYear" TEXT,
      ADD COLUMN IF NOT EXISTS "waterCodeDescription" TEXT,
      ADD COLUMN IF NOT EXISTS "sellerFarmId" TEXT,
      ADD COLUMN IF NOT EXISTS "buyerWaterAccount" TEXT;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'listing') THEN
    ALTER TABLE listing
      ADD COLUMN IF NOT EXISTS "waterCodeId" TEXT,
      ADD COLUMN IF NOT EXISTS "waterCodeValue" TEXT,
      ADD COLUMN IF NOT EXISTS "waterCodeYear" TEXT,
      ADD COLUMN IF NOT EXISTS "waterCodeDescription" TEXT,
      ADD COLUMN IF NOT EXISTS "sellerFarmId" TEXT,
      ADD COLUMN IF NOT EXISTS "buyerWaterAccount" TEXT;
  END IF;
END $$;

-- Add Transaction columns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Transaction') THEN
    ALTER TABLE "Transaction"
      ADD COLUMN IF NOT EXISTS "sellerFarmId" TEXT,
      ADD COLUMN IF NOT EXISTS "buyerWaterAccount" TEXT;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction') THEN
    ALTER TABLE transaction
      ADD COLUMN IF NOT EXISTS "sellerFarmId" TEXT,
      ADD COLUMN IF NOT EXISTS "buyerWaterAccount" TEXT;
  END IF;
END $$;

-- Foreign keys for new columns (Listing)
ALTER TABLE "Listing"
  ADD CONSTRAINT IF NOT EXISTS "Listing_waterCodeId_fkey"
    FOREIGN KEY ("waterCodeId") REFERENCES "WaterCode"("id") ON DELETE SET NULL;

ALTER TABLE "Listing"
  ADD CONSTRAINT IF NOT EXISTS "Listing_sellerFarmId_fkey"
    FOREIGN KEY ("sellerFarmId") REFERENCES "Farm"("id") ON DELETE SET NULL;

ALTER TABLE "Transaction"
  ADD CONSTRAINT IF NOT EXISTS "Transaction_sellerFarmId_fkey"
    FOREIGN KEY ("sellerFarmId") REFERENCES "Farm"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "Listing_waterCodeId_idx" ON "Listing"("waterCodeId");
CREATE INDEX IF NOT EXISTS "Listing_sellerFarmId_idx" ON "Listing"("sellerFarmId");
CREATE INDEX IF NOT EXISTS "Transaction_sellerFarmId_idx" ON "Transaction"("sellerFarmId");

-- Seed Westlands Water District and its codes
INSERT INTO "WaterDistrict" ("id", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Westlands Water District', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "WaterDistrict" WHERE "name" = 'Westlands Water District');

WITH dist AS (
  SELECT "id" FROM "WaterDistrict" WHERE "name" = 'Westlands Water District' LIMIT 1
)
INSERT INTO "WaterCode" ("id", "districtId", "code", "year", "description", "category", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), dist."id", 'WC1802', '2023-24', 'SGMA Groundwater Allocation', 'Groundwater', TRUE, now(), now()
FROM dist
WHERE NOT EXISTS (
  SELECT 1 FROM "WaterCode"
  WHERE "districtId" = dist."id" AND "code" = 'WC1802' AND "year" = '2023-24'
);

WITH dist AS (
  SELECT "id" FROM "WaterDistrict" WHERE "name" = 'Westlands Water District' LIMIT 1
)
INSERT INTO "WaterCode" ("id", "districtId", "code", "year", "description", "category", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), dist."id", 'WC1803', '2023-24', 'SGMA Transitional Allocation', 'Groundwater', TRUE, now(), now()
FROM dist
WHERE NOT EXISTS (
  SELECT 1 FROM "WaterCode"
  WHERE "districtId" = dist."id" AND "code" = 'WC1803' AND "year" = '2023-24'
);

WITH dist AS (
  SELECT "id" FROM "WaterDistrict" WHERE "name" = 'Westlands Water District' LIMIT 1
)
INSERT INTO "WaterCode" ("id", "districtId", "code", "year", "description", "category", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), dist."id", 'WC1855', '2024-25', 'SGMA Groundwater Allocation', 'Groundwater', TRUE, now(), now()
FROM dist
WHERE NOT EXISTS (
  SELECT 1 FROM "WaterCode"
  WHERE "districtId" = dist."id" AND "code" = 'WC1855' AND "year" = '2024-25'
);

WITH dist AS (
  SELECT "id" FROM "WaterDistrict" WHERE "name" = 'Westlands Water District' LIMIT 1
)
INSERT INTO "WaterCode" ("id", "districtId", "code", "year", "description", "category", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), dist."id", 'WC1856', '2024-25', 'SGMA Transitional Allocation', 'Groundwater', TRUE, now(), now()
FROM dist
WHERE NOT EXISTS (
  SELECT 1 FROM "WaterCode"
  WHERE "districtId" = dist."id" AND "code" = 'WC1856' AND "year" = '2024-25'
);

WITH dist AS (
  SELECT "id" FROM "WaterDistrict" WHERE "name" = 'Westlands Water District' LIMIT 1
)
INSERT INTO "WaterCode" ("id", "districtId", "code", "year", "description", "category", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), dist."id", 'WC1914', '2025-26', 'SGMA Groundwater Allocation', 'Groundwater', TRUE, now(), now()
FROM dist
WHERE NOT EXISTS (
  SELECT 1 FROM "WaterCode"
  WHERE "districtId" = dist."id" AND "code" = 'WC1914' AND "year" = '2025-26'
);

WITH dist AS (
  SELECT "id" FROM "WaterDistrict" WHERE "name" = 'Westlands Water District' LIMIT 1
)
INSERT INTO "WaterCode" ("id", "districtId", "code", "year", "description", "category", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), dist."id", 'WC1915', '2025-26', 'SGMA Transitional Allocation', 'Groundwater', TRUE, now(), now()
FROM dist
WHERE NOT EXISTS (
  SELECT 1 FROM "WaterCode"
  WHERE "districtId" = dist."id" AND "code" = 'WC1915' AND "year" = '2025-26'
);

WITH dist AS (
  SELECT "id" FROM "WaterDistrict" WHERE "name" = 'Westlands Water District' LIMIT 1
)
INSERT INTO "WaterCode" ("id", "districtId", "code", "year", "description", "category", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), dist."id", 'WC1830', '2023', 'Recharge Credits Upper Aquifer', 'Groundwater', TRUE, now(), now()
FROM dist
WHERE NOT EXISTS (
  SELECT 1 FROM "WaterCode"
  WHERE "districtId" = dist."id" AND "code" = 'WC1830' AND "year" = '2023'
);

WITH dist AS (
  SELECT "id" FROM "WaterDistrict" WHERE "name" = 'Westlands Water District' LIMIT 1
)
INSERT INTO "WaterCode" ("id", "districtId", "code", "year", "description", "category", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), dist."id", 'WC1831', '2023', 'Recharge Credits Lower Aquifer', 'Groundwater', TRUE, now(), now()
FROM dist
WHERE NOT EXISTS (
  SELECT 1 FROM "WaterCode"
  WHERE "districtId" = dist."id" AND "code" = 'WC1831' AND "year" = '2023'
);

WITH dist AS (
  SELECT "id" FROM "WaterDistrict" WHERE "name" = 'Westlands Water District' LIMIT 1
)
INSERT INTO "WaterCode" ("id", "districtId", "code", "year", "description", "category", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), dist."id", 'WC1804', '2023-24', 'Repayment Contract', 'Surface Water', TRUE, now(), now()
FROM dist
WHERE NOT EXISTS (
  SELECT 1 FROM "WaterCode"
  WHERE "districtId" = dist."id" AND "code" = 'WC1804' AND "year" = '2023-24'
);

WITH dist AS (
  SELECT "id" FROM "WaterDistrict" WHERE "name" = 'Westlands Water District' LIMIT 1
)
INSERT INTO "WaterCode" ("id", "districtId", "code", "year", "description", "category", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), dist."id", 'WC1810', '2023-24', 'Section 215 Water', 'Surface Water', TRUE, now(), now()
FROM dist
WHERE NOT EXISTS (
  SELECT 1 FROM "WaterCode"
  WHERE "districtId" = dist."id" AND "code" = 'WC1810' AND "year" = '2023-24'
);

WITH dist AS (
  SELECT "id" FROM "WaterDistrict" WHERE "name" = 'Westlands Water District' LIMIT 1
)
INSERT INTO "WaterCode" ("id", "districtId", "code", "year", "description", "category", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), dist."id", 'WC1851', '2024-25', 'Repayment Contract', 'Surface Water', TRUE, now(), now()
FROM dist
WHERE NOT EXISTS (
  SELECT 1 FROM "WaterCode"
  WHERE "districtId" = dist."id" AND "code" = 'WC1851' AND "year" = '2024-25'
);

WITH dist AS (
  SELECT "id" FROM "WaterDistrict" WHERE "name" = 'Westlands Water District' LIMIT 1
)
INSERT INTO "WaterCode" ("id", "districtId", "code", "year", "description", "category", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), dist."id", 'WC1910', '2025-26', 'Repayment Contract', 'Surface Water', TRUE, now(), now()
FROM dist
WHERE NOT EXISTS (
  SELECT 1 FROM "WaterCode"
  WHERE "districtId" = dist."id" AND "code" = 'WC1910' AND "year" = '2025-26'
);

WITH dist AS (
  SELECT "id" FROM "WaterDistrict" WHERE "name" = 'Westlands Water District' LIMIT 1
)
INSERT INTO "WaterCode" ("id", "districtId", "code", "year", "description", "category", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), dist."id", 'WC1906', '2024-25', 'Other Water', 'Surface Water', TRUE, now(), now()
FROM dist
WHERE NOT EXISTS (
  SELECT 1 FROM "WaterCode"
  WHERE "districtId" = dist."id" AND "code" = 'WC1906' AND "year" = '2024-25'
);

WITH dist AS (
  SELECT "id" FROM "WaterDistrict" WHERE "name" = 'Westlands Water District' LIMIT 1
)
INSERT INTO "WaterCode" ("id", "districtId", "code", "year", "description", "category", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), dist."id", 'WC1923', '2025-26', 'Other Water', 'Surface Water', TRUE, now(), now()
FROM dist
WHERE NOT EXISTS (
  SELECT 1 FROM "WaterCode"
  WHERE "districtId" = dist."id" AND "code" = 'WC1923' AND "year" = '2025-26'
);
