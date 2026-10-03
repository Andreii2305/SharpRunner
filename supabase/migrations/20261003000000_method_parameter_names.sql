BEGIN;

ALTER TABLE "AssessmentQuestions"
  ADD COLUMN IF NOT EXISTS "codingParameterNames" JSONB;

COMMIT;
