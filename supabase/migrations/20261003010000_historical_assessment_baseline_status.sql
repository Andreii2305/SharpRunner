BEGIN;

ALTER TABLE "AssessmentAttempts"
  ADD COLUMN IF NOT EXISTS "preBaselineStatus" VARCHAR(16);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assessment_attempt_pre_baseline_status_valid'
      AND conrelid = '"AssessmentAttempts"'::regclass
  ) THEN
    ALTER TABLE "AssessmentAttempts"
      ADD CONSTRAINT "assessment_attempt_pre_baseline_status_valid"
      CHECK ("preBaselineStatus" IS NULL OR "preBaselineStatus" IN ('VALID', 'RETROACTIVE', 'UNKNOWN'));
  END IF;
END
$$;

COMMIT;
