BEGIN;

ALTER TABLE "AssessmentAttempts" DROP CONSTRAINT IF EXISTS "assessment_attempt_pre_baseline_status_valid";
ALTER TABLE "AssessmentAttempts" ADD CONSTRAINT "assessment_attempt_pre_baseline_status_valid"
  CHECK ("preBaselineStatus" IS NULL OR "preBaselineStatus" IN ('VALID', 'RETROACTIVE', 'UNKNOWN', 'SUPPLEMENTAL'));

CREATE TABLE IF NOT EXISTS "AssessmentAttemptGrants" (
  "id" SERIAL PRIMARY KEY,
  "assessmentId" INTEGER NOT NULL REFERENCES "LessonAssessments"("id") ON DELETE RESTRICT,
  "classroomId" INTEGER NOT NULL REFERENCES "Classrooms"("id") ON DELETE RESTRICT,
  "studentId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE RESTRICT,
  "grantedByUserId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE RESTRICT,
  "reason" VARCHAR(500),
  "idempotencyKey" VARCHAR(96) NOT NULL,
  "consumedByAttemptId" INTEGER REFERENCES "AssessmentAttempts"("id") ON DELETE RESTRICT,
  "consumedAt" TIMESTAMPTZ,
  "answerReviewWasEligibleAtGrant" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "assessment_attempt_grants_reason_valid" CHECK (
    "reason" IS NULL OR length(trim("reason")) BETWEEN 1 AND 500
  ),
  CONSTRAINT "assessment_attempt_grants_key_valid" CHECK (
    "idempotencyKey" ~ '^[A-Za-z0-9_-]{8,96}$'
  ),
  CONSTRAINT "assessment_attempt_grants_consumption_valid" CHECK (
    ("consumedByAttemptId" IS NULL AND "consumedAt" IS NULL)
    OR ("consumedByAttemptId" IS NOT NULL AND "consumedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "assessment_attempt_grants_idempotency_key"
  ON "AssessmentAttemptGrants" ("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_attempt_grants_one_unused"
  ON "AssessmentAttemptGrants" ("assessmentId", "studentId")
  WHERE "consumedByAttemptId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_attempt_grants_consumed_attempt"
  ON "AssessmentAttemptGrants" ("consumedByAttemptId")
  WHERE "consumedByAttemptId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "assessment_attempt_grants_classroom_student_created"
  ON "AssessmentAttemptGrants" ("classroomId", "studentId", "createdAt");

ALTER TABLE "AssessmentAttemptGrants" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "AssessmentAttemptGrants" FROM PUBLIC;
DO $assessment_grant_roles$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'AssessmentAttemptGrants', role_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM %I', 'AssessmentAttemptGrants_id_seq', role_name);
    END IF;
  END LOOP;
END
$assessment_grant_roles$;

COMMIT;
