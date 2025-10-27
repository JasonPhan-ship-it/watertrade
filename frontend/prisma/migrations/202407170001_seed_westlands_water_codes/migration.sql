-- Ensure pgcrypto for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Ensure Westlands Water District exists
INSERT INTO "WaterDistrict" ("id", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Westlands Water District', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "WaterDistrict" WHERE "name" = 'Westlands Water District'
);

-- Upsert provided water codes for Westlands Water District
WITH dist AS (
  SELECT "id" FROM "WaterDistrict" WHERE "name" = 'Westlands Water District' LIMIT 1
), new_codes AS (
  SELECT * FROM (
    VALUES
      ('WC1802', '2023-24', 'SGMA Groundwater Allocation', 'Groundwater'),
      ('WC1803', '2023-24', 'SGMA Transitional Allocation', 'Groundwater'),
      ('WC1855', '2024-25', 'SGMA Groundwater Allocation', 'Groundwater'),
      ('WC1856', '2024-25', 'SGMA Transitional Allocation', 'Groundwater'),
      ('WC1914', '2025-26', 'SGMA Groundwater Allocation', 'Groundwater'),
      ('WC1915', '2025-26', 'SGMA Transitional Allocation', 'Groundwater'),
      ('WC1830', '2023', 'Recharge Credits Upper Aquifer', 'Groundwater'),
      ('WC1831', '2023', 'Recharge Credits Lower Aquifer', 'Groundwater'),
      ('WC1804', '2023-24', 'Repayment Contract', 'Surface Water'),
      ('WC1810', '2023-24', 'Section 215 Water', 'Surface Water'),
      ('WC1851', '2024-25', 'Repayment Contract', 'Surface Water'),
      ('WC1910', '2025-26', 'Repayment Contract', 'Surface Water'),
      ('WC1906', '2024-25', 'Other Water', 'Surface Water'),
      ('WC1923', '2025-26', 'Other Water', 'Surface Water')
  ) AS v(code, year, description, category)
)
INSERT INTO "WaterCode" (
  "id",
  "districtId",
  "code",
  "year",
  "description",
  "category",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  dist."id",
  nc.code,
  nc.year,
  nc.description,
  nc.category,
  TRUE,
  now(),
  now()
FROM dist
JOIN new_codes nc ON TRUE
ON CONFLICT ("districtId", "code", "year") DO UPDATE
SET
  "description" = EXCLUDED."description",
  "category" = EXCLUDED."category",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = now();
