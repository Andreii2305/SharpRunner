ALTER TABLE "UserProgresses"
  ADD COLUMN IF NOT EXISTS "detailedHintUnlocked" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "detailedHintPurchasedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "detailedHintUsedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "detailedHintXpCost" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_progress_detailed_hint_cost_nonnegative'
  ) THEN
    ALTER TABLE "UserProgresses"
      ADD CONSTRAINT "user_progress_detailed_hint_cost_nonnegative"
      CHECK ("detailedHintXpCost" IS NULL OR "detailedHintXpCost" >= 0);
  END IF;
END $$;
