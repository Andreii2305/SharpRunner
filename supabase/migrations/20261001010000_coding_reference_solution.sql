BEGIN;

ALTER TABLE "AssessmentQuestions"
  ADD COLUMN IF NOT EXISTS "referenceSolution" TEXT;

ALTER TABLE "AssessmentQuestions" DROP CONSTRAINT IF EXISTS "assessment_question_reference_solution_size_valid";
ALTER TABLE "AssessmentQuestions" ADD CONSTRAINT "assessment_question_reference_solution_size_valid"
  CHECK ("referenceSolution" IS NULL OR octet_length("referenceSolution") <= 16384);

COMMIT;
