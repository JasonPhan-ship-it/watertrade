-- Normalize Listing water code snapshot columns for legacy databases
DO $$
DECLARE
  legacy_column RECORD;
BEGIN
  -- Handle camelCase table name
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'Listing'
  ) THEN
    -- Ensure waterCodeValue exists with expected casing
    SELECT column_name
      INTO legacy_column
    FROM information_schema.columns
    WHERE table_name = 'Listing' AND lower(column_name) = 'watercodevalue'
    LIMIT 1;

    IF legacy_column.column_name IS NOT NULL AND legacy_column.column_name <> 'waterCodeValue' THEN
      EXECUTE format('ALTER TABLE "Listing" RENAME COLUMN %I TO "waterCodeValue"', legacy_column.column_name);
    ELSIF legacy_column.column_name IS NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'Listing' AND column_name = 'waterCodeValue'
    ) THEN
      ALTER TABLE "Listing" ADD COLUMN "waterCodeValue" TEXT;
    END IF;

    -- Ensure waterCodeYear exists with expected casing
    SELECT column_name
      INTO legacy_column
    FROM information_schema.columns
    WHERE table_name = 'Listing' AND lower(column_name) = 'watercodeyear'
    LIMIT 1;

    IF legacy_column.column_name IS NOT NULL AND legacy_column.column_name <> 'waterCodeYear' THEN
      EXECUTE format('ALTER TABLE "Listing" RENAME COLUMN %I TO "waterCodeYear"', legacy_column.column_name);
    ELSIF legacy_column.column_name IS NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'Listing' AND column_name = 'waterCodeYear'
    ) THEN
      ALTER TABLE "Listing" ADD COLUMN "waterCodeYear" TEXT;
    END IF;

    -- Ensure waterCodeDescription exists with expected casing
    SELECT column_name
      INTO legacy_column
    FROM information_schema.columns
    WHERE table_name = 'Listing' AND lower(column_name) = 'watercodedescription'
    LIMIT 1;

    IF legacy_column.column_name IS NOT NULL AND legacy_column.column_name <> 'waterCodeDescription' THEN
      EXECUTE format('ALTER TABLE "Listing" RENAME COLUMN %I TO "waterCodeDescription"', legacy_column.column_name);
    ELSIF legacy_column.column_name IS NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'Listing' AND column_name = 'waterCodeDescription'
    ) THEN
      ALTER TABLE "Listing" ADD COLUMN "waterCodeDescription" TEXT;
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'listing'
  ) THEN
    -- Lowercase table name variant
    SELECT column_name
      INTO legacy_column
    FROM information_schema.columns
    WHERE table_name = 'listing' AND lower(column_name) = 'watercodevalue'
    LIMIT 1;

    IF legacy_column.column_name IS NOT NULL AND legacy_column.column_name <> 'watercodevalue' THEN
      EXECUTE format('ALTER TABLE listing RENAME COLUMN %I TO watercodevalue', legacy_column.column_name);
    ELSIF legacy_column.column_name IS NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'listing' AND column_name = 'watercodevalue'
    ) THEN
      ALTER TABLE listing ADD COLUMN watercodevalue TEXT;
    END IF;

    SELECT column_name
      INTO legacy_column
    FROM information_schema.columns
    WHERE table_name = 'listing' AND lower(column_name) = 'watercodeyear'
    LIMIT 1;

    IF legacy_column.column_name IS NOT NULL AND legacy_column.column_name <> 'watercodeyear' THEN
      EXECUTE format('ALTER TABLE listing RENAME COLUMN %I TO watercodeyear', legacy_column.column_name);
    ELSIF legacy_column.column_name IS NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'listing' AND column_name = 'watercodeyear'
    ) THEN
      ALTER TABLE listing ADD COLUMN watercodeyear TEXT;
    END IF;

    SELECT column_name
      INTO legacy_column
    FROM information_schema.columns
    WHERE table_name = 'listing' AND lower(column_name) = 'watercodedescription'
    LIMIT 1;

    IF legacy_column.column_name IS NOT NULL AND legacy_column.column_name <> 'watercodedescription' THEN
      EXECUTE format('ALTER TABLE listing RENAME COLUMN %I TO watercodedescription', legacy_column.column_name);
    ELSIF legacy_column.column_name IS NULL AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'listing' AND column_name = 'watercodedescription'
    ) THEN
      ALTER TABLE listing ADD COLUMN watercodedescription TEXT;
    END IF;
  END IF;
END $$;
