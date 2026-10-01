BEGIN;

ALTER TABLE "AssessmentQuestions"
  ADD COLUMN IF NOT EXISTS "starterCode" TEXT,
  ADD COLUMN IF NOT EXISTS "codingTypeName" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "codingMethodName" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "codingParameterTypes" JSONB,
  ADD COLUMN IF NOT EXISTS "codingReturnType" VARCHAR(16);

ALTER TABLE "AssessmentResponses"
  ADD COLUMN IF NOT EXISTS "sourceCode" TEXT;

ALTER TABLE "AssessmentQuestions" DROP CONSTRAINT IF EXISTS "assessment_question_type_valid";
ALTER TABLE "AssessmentQuestions" ADD CONSTRAINT "assessment_question_type_valid"
  CHECK ("questionType" IN ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'CODING'));

CREATE TABLE IF NOT EXISTS "AssessmentCodingTestCases" (
  "id" SERIAL PRIMARY KEY,
  "questionId" INTEGER NOT NULL REFERENCES "AssessmentQuestions"("id") ON DELETE CASCADE,
  "displayOrder" INTEGER NOT NULL,
  "visibility" VARCHAR(8) NOT NULL,
  "input" JSONB NOT NULL,
  "expectedOutput" JSONB NOT NULL,
  "weight" NUMERIC(10,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "assessment_coding_test_order_nonnegative" CHECK ("displayOrder" >= 0),
  CONSTRAINT "assessment_coding_test_visibility_valid" CHECK ("visibility" IN ('PUBLIC', 'HIDDEN')),
  CONSTRAINT "assessment_coding_test_weight_positive" CHECK ("weight" > 0)
);

ALTER TABLE "AssessmentCodingTestCases" DROP CONSTRAINT IF EXISTS "assessment_coding_test_order_nonnegative";
ALTER TABLE "AssessmentCodingTestCases" ADD CONSTRAINT "assessment_coding_test_order_nonnegative"
  CHECK ("displayOrder" >= 0);
ALTER TABLE "AssessmentCodingTestCases" DROP CONSTRAINT IF EXISTS "assessment_coding_test_visibility_valid";
ALTER TABLE "AssessmentCodingTestCases" ADD CONSTRAINT "assessment_coding_test_visibility_valid"
  CHECK ("visibility" IN ('PUBLIC', 'HIDDEN'));
ALTER TABLE "AssessmentCodingTestCases" DROP CONSTRAINT IF EXISTS "assessment_coding_test_weight_positive";
ALTER TABLE "AssessmentCodingTestCases" ADD CONSTRAINT "assessment_coding_test_weight_positive"
  CHECK ("weight" > 0);

ALTER TABLE "AssessmentResponses" DROP CONSTRAINT IF EXISTS "assessment_response_answer_shape_valid";
ALTER TABLE "AssessmentResponses" ADD CONSTRAINT "assessment_response_answer_shape_valid"
  CHECK (NOT ("selectedChoiceId" IS NOT NULL AND "sourceCode" IS NOT NULL));
ALTER TABLE "AssessmentResponses" DROP CONSTRAINT IF EXISTS "assessment_response_source_size_valid";
ALTER TABLE "AssessmentResponses" ADD CONSTRAINT "assessment_response_source_size_valid"
  CHECK ("sourceCode" IS NULL OR octet_length("sourceCode") <= 16384);

CREATE UNIQUE INDEX IF NOT EXISTS "assessment_coding_tests_question_order"
  ON "AssessmentCodingTestCases" ("questionId", "displayOrder");
CREATE INDEX IF NOT EXISTS "assessment_coding_tests_question_visibility"
  ON "AssessmentCodingTestCases" ("questionId", "visibility");

ALTER TABLE "AssessmentCodingTestCases" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "AssessmentCodingTestCases" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "AssessmentCodingTestCases_id_seq" FROM PUBLIC;

DO $coding_roles$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'AssessmentCodingTestCases', role_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM %I', 'AssessmentCodingTestCases_id_seq', role_name);
    END IF;
  END LOOP;
END
$coding_roles$;

COMMIT;
