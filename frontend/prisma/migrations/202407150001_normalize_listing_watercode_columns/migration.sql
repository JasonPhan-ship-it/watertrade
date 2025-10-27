-- Normalize Listing water code snapshot columns for legacy databases
DO $$
DECLARE
  target_table TEXT;
  expected_column TEXT;
  legacy_candidates TEXT[];
  found_column TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['Listing', 'listing'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = target_table
    ) THEN
      FOREACH expected_column IN ARRAY ARRAY['waterCodeValue', 'waterCodeYear', 'waterCodeDescription'] LOOP
        -- Skip work if the expected column casing already exists
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = target_table AND column_name = expected_column
        ) THEN
          CONTINUE;
        END IF;

        -- Known legacy column casings/snake_case variants to normalize
        legacy_candidates := CASE expected_column
          WHEN 'waterCodeValue' THEN ARRAY['watercodevalue', 'water_code_value', 'watercode_value']
          WHEN 'waterCodeYear' THEN ARRAY['watercodeyear', 'water_code_year', 'watercode_year']
          WHEN 'waterCodeDescription' THEN ARRAY['watercodedescription', 'water_code_description', 'watercode_description']
          ELSE ARRAY[]::TEXT[]
        END;

        found_column := NULL;
        SELECT column_name
          INTO found_column
        FROM information_schema.columns
        WHERE table_name = target_table
          AND lower(column_name) = ANY(legacy_candidates)
        LIMIT 1;

        IF found_column IS NOT NULL THEN
          EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', target_table, found_column, expected_column);
        ELSE
          EXECUTE format('ALTER TABLE %I ADD COLUMN %I TEXT', target_table, expected_column);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;
