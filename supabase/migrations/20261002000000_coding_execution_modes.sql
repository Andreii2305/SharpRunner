BEGIN;

ALTER TABLE "AssessmentQuestions"
  ADD COLUMN IF NOT EXISTS "codingExecutionMode" VARCHAR(8);

UPDATE "AssessmentQuestions"
SET "codingExecutionMode" = 'METHOD'
WHERE "questionType" = 'CODING'
  AND "codingExecutionMode" IS NULL;

ALTER TABLE "AssessmentQuestions"
  DROP CONSTRAINT IF EXISTS "assessment_questions_coding_execution_mode_valid";

ALTER TABLE "AssessmentQuestions"
  ADD CONSTRAINT "assessment_questions_coding_execution_mode_valid"
  CHECK (
    ("questionType" = 'CODING' AND "codingExecutionMode" IN ('METHOD', 'PROGRAM'))
    OR ("questionType" <> 'CODING' AND "codingExecutionMode" IS NULL)
  );

COMMIT;
