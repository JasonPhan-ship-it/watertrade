-- Ensure new listing snapshot columns exist even on older databases
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'Listing'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'Listing' AND column_name = 'waterCodeValue'
    ) THEN
      ALTER TABLE "Listing" ADD COLUMN "waterCodeValue" TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'Listing' AND column_name = 'waterCodeYear'
    ) THEN
      ALTER TABLE "Listing" ADD COLUMN "waterCodeYear" TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'Listing' AND column_name = 'waterCodeDescription'
    ) THEN
      ALTER TABLE "Listing" ADD COLUMN "waterCodeDescription" TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'Listing' AND column_name = 'sellerFarmId'
    ) THEN
      ALTER TABLE "Listing" ADD COLUMN "sellerFarmId" TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'Listing' AND column_name = 'buyerWaterAccount'
    ) THEN
      ALTER TABLE "Listing" ADD COLUMN "buyerWaterAccount" TEXT;
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'listing'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'listing' AND column_name = 'waterCodeValue'
    ) THEN
      ALTER TABLE listing ADD COLUMN "waterCodeValue" TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'listing' AND column_name = 'waterCodeYear'
    ) THEN
      ALTER TABLE listing ADD COLUMN "waterCodeYear" TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'listing' AND column_name = 'waterCodeDescription'
    ) THEN
      ALTER TABLE listing ADD COLUMN "waterCodeDescription" TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'listing' AND column_name = 'sellerFarmId'
    ) THEN
      ALTER TABLE listing ADD COLUMN "sellerFarmId" TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'listing' AND column_name = 'buyerWaterAccount'
    ) THEN
      ALTER TABLE listing ADD COLUMN "buyerWaterAccount" TEXT;
    END IF;
  END IF;
END $$;

-- Maintain expected foreign key/index structure
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Listing' AND column_name = 'waterCodeId'
  ) THEN
    ALTER TABLE "Listing"
      ADD CONSTRAINT IF NOT EXISTS "Listing_waterCodeId_fkey"
      FOREIGN KEY ("waterCodeId") REFERENCES "WaterCode"("id") ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Listing' AND column_name = 'sellerFarmId'
  ) THEN
    ALTER TABLE "Listing"
      ADD CONSTRAINT IF NOT EXISTS "Listing_sellerFarmId_fkey"
      FOREIGN KEY ("sellerFarmId") REFERENCES "Farm"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'Listing'
  ) THEN
    CREATE INDEX IF NOT EXISTS "Listing_waterCodeId_idx" ON "Listing"("waterCodeId");
    CREATE INDEX IF NOT EXISTS "Listing_sellerFarmId_idx" ON "Listing"("sellerFarmId");
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'listing'
  ) THEN
    CREATE INDEX IF NOT EXISTS listing_waterCodeId_idx ON listing("waterCodeId");
    CREATE INDEX IF NOT EXISTS listing_sellerFarmId_idx ON listing("sellerFarmId");
  END IF;
END $$;
