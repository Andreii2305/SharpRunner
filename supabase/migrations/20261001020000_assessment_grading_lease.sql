ALTER TABLE "AssessmentAttempts"
  ADD COLUMN IF NOT EXISTS "gradingLeaseToken" VARCHAR(96),
  ADD COLUMN IF NOT EXISTS "gradingLeaseExpiresAt" TIMESTAMPTZ;

ALTER TABLE "AssessmentAttempts"
  DROP CONSTRAINT IF EXISTS "assessment_attempt_status_valid",
  DROP CONSTRAINT IF EXISTS "assessment_attempt_submission_state_valid",
  DROP CONSTRAINT IF EXISTS "assessment_attempt_grading_state_valid";

ALTER TABLE "AssessmentAttempts"
  ADD CONSTRAINT "assessment_attempt_status_valid"
    CHECK ("status" IN ('IN_PROGRESS', 'GRADING', 'SUBMITTED')),
  ADD CONSTRAINT "assessment_attempt_grading_state_valid" CHECK (
    (
      "status" = 'IN_PROGRESS'
      AND "submittedAt" IS NULL
      AND "pointsEarned" IS NULL
      AND "maxPoints" IS NULL
      AND "percentage" IS NULL
      AND "correctCount" IS NULL
      AND "questionCount" IS NULL
      AND "passed" IS NULL
      AND "passingPercentageApplied" IS NULL
      AND "submissionKey" IS NULL
      AND "gradingLeaseToken" IS NULL
      AND "gradingLeaseExpiresAt" IS NULL
    ) OR (
      "status" = 'GRADING'
      AND "submittedAt" IS NULL
      AND "pointsEarned" IS NULL
      AND "maxPoints" IS NULL
      AND "percentage" IS NULL
      AND "correctCount" IS NULL
      AND "questionCount" IS NULL
      AND "passed" IS NULL
      AND "passingPercentageApplied" IS NULL
      AND "submissionKey" IS NOT NULL
      AND "gradingLeaseToken" IS NOT NULL
      AND "gradingLeaseExpiresAt" IS NOT NULL
    ) OR (
      "status" = 'SUBMITTED'
      AND "submittedAt" IS NOT NULL
      AND "pointsEarned" IS NOT NULL
      AND "maxPoints" IS NOT NULL
      AND "percentage" IS NOT NULL
      AND "correctCount" IS NOT NULL
      AND "questionCount" IS NOT NULL
      AND "submissionKey" IS NOT NULL
      AND "gradingLeaseToken" IS NULL
      AND "gradingLeaseExpiresAt" IS NULL
    )
  );

DROP INDEX IF EXISTS "assessment_attempts_one_in_progress";
CREATE UNIQUE INDEX "assessment_attempts_one_in_progress"
  ON "AssessmentAttempts" ("assessmentId", "studentId")
  WHERE "status" IN ('IN_PROGRESS', 'GRADING');
