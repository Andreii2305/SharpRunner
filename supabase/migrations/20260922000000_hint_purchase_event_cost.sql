BEGIN;

ALTER TABLE "LearningAnalyticsEvents"
  ADD COLUMN IF NOT EXISTS "hintXpCost" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'learning_analytics_hint_xp_cost_positive'
      AND conrelid = '"LearningAnalyticsEvents"'::regclass
  ) THEN
    ALTER TABLE "LearningAnalyticsEvents"
      ADD CONSTRAINT "learning_analytics_hint_xp_cost_positive"
      CHECK ("hintXpCost" IS NULL OR "hintXpCost" > 0);
  END IF;
END $$;

COMMIT;
