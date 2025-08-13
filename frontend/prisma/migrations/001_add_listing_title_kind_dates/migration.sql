-- Create enum if it doesn't exist (safe in Postgres)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ListingKind') THEN
    CREATE TYPE "ListingKind" AS ENUM ('SELL','BUY');
  END IF;
END$$;

-- Apply to the correct table name; Prisma quotes model names exactly ("Listing")
ALTER TABLE "Listing"
  ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT 'Untitled Listing',
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "availabilityStart" TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "availabilityEnd"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "kind" "ListingKind" NOT NULL DEFAULT 'SELL';
