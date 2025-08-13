-- Create enum if it doesn't exist (Postgres)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ListingKind') THEN
    CREATE TYPE "ListingKind" AS ENUM ('SELL','BUY');
  END IF;
END$$;

-- Try common table casings; no-op if missing
DO $$
BEGIN
  -- "Listing" (quoted, matches Prisma default)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'Listing') THEN
    EXECUTE $cmd$
      ALTER TABLE "Listing"
        ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT 'Untitled Listing',
        ADD COLUMN IF NOT EXISTS "description" TEXT,
        ADD COLUMN IF NOT EXISTS "availabilityStart" TIMESTAMPTZ NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "availabilityEnd"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "kind" "ListingKind" NOT NULL DEFAULT 'SELL'
    $cmd$;
  END IF;

  -- listing (lowercase, unquoted)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'listing') THEN
    EXECUTE $cmd$
      ALTER TABLE listing
        ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Untitled Listing',
        ADD COLUMN IF NOT EXISTS description TEXT,
        ADD COLUMN IF NOT EXISTS "availabilityStart" TIMESTAMPTZ NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "availabilityEnd"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS kind "ListingKind" NOT NULL DEFAULT 'SELL'
    $cmd$;
  END IF;

  -- listings (plural)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'listings') THEN
    EXECUTE $cmd$
      ALTER TABLE listings
        ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Untitled Listing',
        ADD COLUMN IF NOT EXISTS description TEXT,
        ADD COLUMN IF NOT EXISTS "availabilityStart" TIMESTAMPTZ NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "availabilityEnd"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS kind "ListingKind" NOT NULL DEFAULT 'SELL'
    $cmd$;
  END IF;
END$$;
