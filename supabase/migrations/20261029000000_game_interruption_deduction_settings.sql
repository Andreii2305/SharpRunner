BEGIN;

ALTER TABLE "LevelContentOverrides"
  ADD COLUMN IF NOT EXISTS "interruptionScoreDeduction" NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS "interruptionXpDeduction" INTEGER;

DO $$
DECLARE
  xp_data_type TEXT;
BEGIN
  SELECT data_type
  INTO xp_data_type
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'LevelContentOverrides'
    AND column_name = 'interruptionXpDeduction';

  IF xp_data_type IS NULL THEN
    RAISE EXCEPTION 'interruptionXpDeduction column is missing';
  ELSIF xp_data_type = 'numeric' THEN
    IF EXISTS (
      SELECT 1
      FROM "LevelContentOverrides"
      WHERE "interruptionXpDeduction" IS NOT NULL
        AND "interruptionXpDeduction" <> trunc("interruptionXpDeduction")
    ) THEN
      RAISE EXCEPTION 'fractional interruptionXpDeduction values cannot be converted to INTEGER';
    END IF;
    ALTER TABLE "LevelContentOverrides"
      ALTER COLUMN "interruptionXpDeduction" TYPE INTEGER
      USING "interruptionXpDeduction"::INTEGER;
  ELSIF xp_data_type <> 'integer' THEN
    RAISE EXCEPTION 'interruptionXpDeduction has incompatible type %', xp_data_type;
  END IF;
END $$;

UPDATE "LevelContentOverrides"
SET "interruptionScoreDeduction" = 1
WHERE "interruptionScoreDeduction" IS NULL;

UPDATE "LevelContentOverrides"
SET "interruptionXpDeduction" = 10
WHERE "interruptionXpDeduction" IS NULL;

ALTER TABLE "LevelContentOverrides"
  ALTER COLUMN "interruptionScoreDeduction" SET DEFAULT 1,
  ALTER COLUMN "interruptionScoreDeduction" SET NOT NULL,
  ALTER COLUMN "interruptionXpDeduction" SET DEFAULT 10,
  ALTER COLUMN "interruptionXpDeduction" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'level_content_overrides_interruption_score_deduction_range'
      AND conrelid = '"LevelContentOverrides"'::regclass
  ) THEN
    ALTER TABLE "LevelContentOverrides"
      ADD CONSTRAINT "level_content_overrides_interruption_score_deduction_range"
      CHECK ("interruptionScoreDeduction" >= 0 AND "interruptionScoreDeduction" <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'level_content_overrides_interruption_xp_deduction_range'
      AND conrelid = '"LevelContentOverrides"'::regclass
  ) THEN
    ALTER TABLE "LevelContentOverrides"
      ADD CONSTRAINT "level_content_overrides_interruption_xp_deduction_range"
      CHECK ("interruptionXpDeduction" >= 0 AND "interruptionXpDeduction" <= 100);
  END IF;
END $$;

COMMIT;
