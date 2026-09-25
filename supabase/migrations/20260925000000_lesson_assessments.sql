BEGIN;

CREATE TABLE IF NOT EXISTS "LessonAssessments" (
  "id" SERIAL PRIMARY KEY,
  "classroomId" INTEGER NOT NULL REFERENCES "Classrooms"("id") ON DELETE RESTRICT,
  "lessonKey" VARCHAR(120) NOT NULL,
  "type" VARCHAR(8) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "instructions" TEXT,
  "isRequired" BOOLEAN NOT NULL DEFAULT TRUE,
  "isPublished" BOOLEAN NOT NULL DEFAULT FALSE,
  "publishedAt" TIMESTAMPTZ,
  "passingPercentage" NUMERIC(5,2),
  "maxAttempts" INTEGER NOT NULL,
  "gradeCalculation" VARCHAR(16) NOT NULL,
  "requirePassingForCompletion" BOOLEAN NOT NULL,
  "showScoreAfterSubmission" BOOLEAN NOT NULL DEFAULT TRUE,
  "answerReviewPolicy" VARCHAR(32) NOT NULL,
  "shuffleQuestions" BOOLEAN NOT NULL DEFAULT TRUE,
  "shuffleChoices" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdBy" INTEGER REFERENCES "Users"("id") ON DELETE SET NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "lesson_assessment_type_valid" CHECK ("type" IN ('PRE', 'POST')),
  CONSTRAINT "lesson_assessment_lesson_key_valid" CHECK (
    "lessonKey" IN ('arrays', 'functions', 'functions-with-arrays', 'final')
  ),
  CONSTRAINT "lesson_assessment_title_present" CHECK (length(trim("title")) > 0),
  CONSTRAINT "lesson_assessment_version_positive" CHECK ("version" > 0),
  CONSTRAINT "lesson_assessment_attempts_valid" CHECK ("maxAttempts" BETWEEN 1 AND 20),
  CONSTRAINT "lesson_assessment_review_policy_valid" CHECK (
    "answerReviewPolicy" IN ('NEVER', 'AFTER_SUBMISSION', 'AFTER_FINAL_ATTEMPT')
  ),
  CONSTRAINT "lesson_assessment_pre_invariants" CHECK (
    "type" <> 'PRE' OR (
      "maxAttempts" = 1
      AND "gradeCalculation" = 'FIRST'
      AND "passingPercentage" IS NULL
      AND "requirePassingForCompletion" = FALSE
    )
  ),
  CONSTRAINT "lesson_assessment_post_invariants" CHECK (
    "type" <> 'POST' OR (
      "gradeCalculation" = 'HIGHEST'
      AND "passingPercentage" BETWEEN 0 AND 100
    )
  )
);

CREATE TABLE IF NOT EXISTS "AssessmentQuestions" (
  "id" SERIAL PRIMARY KEY,
  "assessmentId" INTEGER NOT NULL REFERENCES "LessonAssessments"("id") ON DELETE CASCADE,
  "questionText" TEXT NOT NULL,
  "questionType" VARCHAR(24) NOT NULL,
  "displayOrder" INTEGER NOT NULL,
  "points" NUMERIC(10,2) NOT NULL DEFAULT 1,
  "explanation" TEXT,
  "objectiveKey" VARCHAR(120),
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "assessment_question_type_valid" CHECK (
    "questionType" IN ('MULTIPLE_CHOICE', 'TRUE_FALSE')
  ),
  CONSTRAINT "assessment_question_text_present" CHECK (length(trim("questionText")) > 0),
  CONSTRAINT "assessment_question_order_nonnegative" CHECK ("displayOrder" >= 0),
  CONSTRAINT "assessment_question_points_positive" CHECK ("points" > 0 AND "points" <= 10000)
);

CREATE TABLE IF NOT EXISTS "AssessmentChoices" (
  "id" SERIAL PRIMARY KEY,
  "questionId" INTEGER NOT NULL REFERENCES "AssessmentQuestions"("id") ON DELETE CASCADE,
  "choiceText" VARCHAR(2000) NOT NULL,
  "displayOrder" INTEGER NOT NULL,
  "isCorrect" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "assessment_choice_text_present" CHECK (length(trim("choiceText")) > 0),
  CONSTRAINT "assessment_choice_order_nonnegative" CHECK ("displayOrder" >= 0)
);

CREATE TABLE IF NOT EXISTS "AssessmentAttempts" (
  "id" SERIAL PRIMARY KEY,
  "assessmentId" INTEGER NOT NULL REFERENCES "LessonAssessments"("id") ON DELETE RESTRICT,
  "classroomId" INTEGER NOT NULL REFERENCES "Classrooms"("id") ON DELETE RESTRICT,
  "studentId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE RESTRICT,
  "attemptNumber" INTEGER NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'IN_PROGRESS',
  "assessmentVersion" INTEGER NOT NULL,
  "startedAt" TIMESTAMPTZ NOT NULL,
  "submittedAt" TIMESTAMPTZ,
  "pointsEarned" NUMERIC(10,2),
  "maxPoints" NUMERIC(10,2),
  "percentage" NUMERIC(5,2),
  "correctCount" INTEGER,
  "questionCount" INTEGER,
  "passed" BOOLEAN,
  "passingPercentageApplied" NUMERIC(5,2),
  "questionOrder" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "choiceOrder" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "submissionKey" VARCHAR(96),
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "assessment_attempt_status_valid" CHECK ("status" IN ('IN_PROGRESS', 'SUBMITTED')),
  CONSTRAINT "assessment_attempt_number_positive" CHECK ("attemptNumber" > 0),
  CONSTRAINT "assessment_attempt_version_positive" CHECK ("assessmentVersion" > 0),
  CONSTRAINT "assessment_attempt_points_valid" CHECK (
    ("pointsEarned" IS NULL OR "pointsEarned" >= 0)
    AND ("maxPoints" IS NULL OR "maxPoints" > 0)
    AND ("pointsEarned" IS NULL OR "maxPoints" IS NULL OR "pointsEarned" <= "maxPoints")
  ),
  CONSTRAINT "assessment_attempt_percentage_valid" CHECK (
    "percentage" IS NULL OR "percentage" BETWEEN 0 AND 100
  ),
  CONSTRAINT "assessment_attempt_counts_valid" CHECK (
    ("correctCount" IS NULL OR "correctCount" >= 0)
    AND ("questionCount" IS NULL OR "questionCount" > 0)
    AND ("correctCount" IS NULL OR "questionCount" IS NULL OR "correctCount" <= "questionCount")
  ),
  CONSTRAINT "assessment_attempt_passing_valid" CHECK (
    "passingPercentageApplied" IS NULL OR "passingPercentageApplied" BETWEEN 0 AND 100
  ),
  CONSTRAINT "assessment_attempt_submission_state_valid" CHECK (
    ("status" = 'IN_PROGRESS' AND "submittedAt" IS NULL
      AND "pointsEarned" IS NULL AND "maxPoints" IS NULL AND "percentage" IS NULL
      AND "correctCount" IS NULL AND "questionCount" IS NULL AND "submissionKey" IS NULL)
    OR
    ("status" = 'SUBMITTED' AND "submittedAt" IS NOT NULL
      AND "pointsEarned" IS NOT NULL AND "maxPoints" IS NOT NULL AND "percentage" IS NOT NULL
      AND "correctCount" IS NOT NULL AND "questionCount" IS NOT NULL AND "submissionKey" IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS "AssessmentResponses" (
  "id" SERIAL PRIMARY KEY,
  "attemptId" INTEGER NOT NULL REFERENCES "AssessmentAttempts"("id") ON DELETE RESTRICT,
  "questionId" INTEGER NOT NULL REFERENCES "AssessmentQuestions"("id") ON DELETE RESTRICT,
  "selectedChoiceId" INTEGER REFERENCES "AssessmentChoices"("id") ON DELETE RESTRICT,
  "isCorrect" BOOLEAN NOT NULL DEFAULT FALSE,
  "pointsAwarded" NUMERIC(10,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "assessment_response_points_nonnegative" CHECK ("pointsAwarded" >= 0)
);

-- sequelize.sync() runs before explicit migrations. Add named checks to tables
-- that may already have been created by Sequelize.
DO $assessment_constraints$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('LessonAssessments', 'lesson_assessment_type_valid', $sql$ALTER TABLE "LessonAssessments" ADD CONSTRAINT "lesson_assessment_type_valid" CHECK ("type" IN ('PRE', 'POST'))$sql$),
    ('LessonAssessments', 'lesson_assessment_lesson_key_valid', $sql$ALTER TABLE "LessonAssessments" ADD CONSTRAINT "lesson_assessment_lesson_key_valid" CHECK ("lessonKey" IN ('arrays', 'functions', 'functions-with-arrays', 'final'))$sql$),
    ('LessonAssessments', 'lesson_assessment_title_present', $sql$ALTER TABLE "LessonAssessments" ADD CONSTRAINT "lesson_assessment_title_present" CHECK (length(trim("title")) > 0)$sql$),
    ('LessonAssessments', 'lesson_assessment_version_positive', $sql$ALTER TABLE "LessonAssessments" ADD CONSTRAINT "lesson_assessment_version_positive" CHECK ("version" > 0)$sql$),
    ('LessonAssessments', 'lesson_assessment_attempts_valid', $sql$ALTER TABLE "LessonAssessments" ADD CONSTRAINT "lesson_assessment_attempts_valid" CHECK ("maxAttempts" BETWEEN 1 AND 20)$sql$),
    ('LessonAssessments', 'lesson_assessment_review_policy_valid', $sql$ALTER TABLE "LessonAssessments" ADD CONSTRAINT "lesson_assessment_review_policy_valid" CHECK ("answerReviewPolicy" IN ('NEVER', 'AFTER_SUBMISSION', 'AFTER_FINAL_ATTEMPT'))$sql$),
    ('LessonAssessments', 'lesson_assessment_pre_invariants', $sql$ALTER TABLE "LessonAssessments" ADD CONSTRAINT "lesson_assessment_pre_invariants" CHECK ("type" <> 'PRE' OR ("maxAttempts" = 1 AND "gradeCalculation" = 'FIRST' AND "passingPercentage" IS NULL AND "requirePassingForCompletion" = FALSE))$sql$),
    ('LessonAssessments', 'lesson_assessment_post_invariants', $sql$ALTER TABLE "LessonAssessments" ADD CONSTRAINT "lesson_assessment_post_invariants" CHECK ("type" <> 'POST' OR ("gradeCalculation" = 'HIGHEST' AND "passingPercentage" BETWEEN 0 AND 100))$sql$),
    ('AssessmentQuestions', 'assessment_question_type_valid', $sql$ALTER TABLE "AssessmentQuestions" ADD CONSTRAINT "assessment_question_type_valid" CHECK ("questionType" IN ('MULTIPLE_CHOICE', 'TRUE_FALSE'))$sql$),
    ('AssessmentQuestions', 'assessment_question_text_present', $sql$ALTER TABLE "AssessmentQuestions" ADD CONSTRAINT "assessment_question_text_present" CHECK (length(trim("questionText")) > 0)$sql$),
    ('AssessmentQuestions', 'assessment_question_order_nonnegative', $sql$ALTER TABLE "AssessmentQuestions" ADD CONSTRAINT "assessment_question_order_nonnegative" CHECK ("displayOrder" >= 0)$sql$),
    ('AssessmentQuestions', 'assessment_question_points_positive', $sql$ALTER TABLE "AssessmentQuestions" ADD CONSTRAINT "assessment_question_points_positive" CHECK ("points" > 0 AND "points" <= 10000)$sql$),
    ('AssessmentChoices', 'assessment_choice_text_present', $sql$ALTER TABLE "AssessmentChoices" ADD CONSTRAINT "assessment_choice_text_present" CHECK (length(trim("choiceText")) > 0)$sql$),
    ('AssessmentChoices', 'assessment_choice_order_nonnegative', $sql$ALTER TABLE "AssessmentChoices" ADD CONSTRAINT "assessment_choice_order_nonnegative" CHECK ("displayOrder" >= 0)$sql$),
    ('AssessmentAttempts', 'assessment_attempt_status_valid', $sql$ALTER TABLE "AssessmentAttempts" ADD CONSTRAINT "assessment_attempt_status_valid" CHECK ("status" IN ('IN_PROGRESS', 'SUBMITTED'))$sql$),
    ('AssessmentAttempts', 'assessment_attempt_number_positive', $sql$ALTER TABLE "AssessmentAttempts" ADD CONSTRAINT "assessment_attempt_number_positive" CHECK ("attemptNumber" > 0)$sql$),
    ('AssessmentAttempts', 'assessment_attempt_version_positive', $sql$ALTER TABLE "AssessmentAttempts" ADD CONSTRAINT "assessment_attempt_version_positive" CHECK ("assessmentVersion" > 0)$sql$),
    ('AssessmentAttempts', 'assessment_attempt_points_valid', $sql$ALTER TABLE "AssessmentAttempts" ADD CONSTRAINT "assessment_attempt_points_valid" CHECK (("pointsEarned" IS NULL OR "pointsEarned" >= 0) AND ("maxPoints" IS NULL OR "maxPoints" > 0) AND ("pointsEarned" IS NULL OR "maxPoints" IS NULL OR "pointsEarned" <= "maxPoints"))$sql$),
    ('AssessmentAttempts', 'assessment_attempt_percentage_valid', $sql$ALTER TABLE "AssessmentAttempts" ADD CONSTRAINT "assessment_attempt_percentage_valid" CHECK ("percentage" IS NULL OR "percentage" BETWEEN 0 AND 100)$sql$),
    ('AssessmentAttempts', 'assessment_attempt_counts_valid', $sql$ALTER TABLE "AssessmentAttempts" ADD CONSTRAINT "assessment_attempt_counts_valid" CHECK (("correctCount" IS NULL OR "correctCount" >= 0) AND ("questionCount" IS NULL OR "questionCount" > 0) AND ("correctCount" IS NULL OR "questionCount" IS NULL OR "correctCount" <= "questionCount"))$sql$),
    ('AssessmentAttempts', 'assessment_attempt_passing_valid', $sql$ALTER TABLE "AssessmentAttempts" ADD CONSTRAINT "assessment_attempt_passing_valid" CHECK ("passingPercentageApplied" IS NULL OR "passingPercentageApplied" BETWEEN 0 AND 100)$sql$),
    ('AssessmentAttempts', 'assessment_attempt_submission_state_valid', $sql$ALTER TABLE "AssessmentAttempts" ADD CONSTRAINT "assessment_attempt_submission_state_valid" CHECK (("status" = 'IN_PROGRESS' AND "submittedAt" IS NULL AND "pointsEarned" IS NULL AND "maxPoints" IS NULL AND "percentage" IS NULL AND "correctCount" IS NULL AND "questionCount" IS NULL AND "submissionKey" IS NULL) OR ("status" = 'SUBMITTED' AND "submittedAt" IS NOT NULL AND "pointsEarned" IS NOT NULL AND "maxPoints" IS NOT NULL AND "percentage" IS NOT NULL AND "correctCount" IS NOT NULL AND "questionCount" IS NOT NULL AND "submissionKey" IS NOT NULL))$sql$),
    ('AssessmentResponses', 'assessment_response_points_nonnegative', $sql$ALTER TABLE "AssessmentResponses" ADD CONSTRAINT "assessment_response_points_nonnegative" CHECK ("pointsAwarded" >= 0)$sql$)
  ) AS constraints("tableName", "constraintName", "statement")
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = item."constraintName"
        AND conrelid = format('public.%I', item."tableName")::regclass
    ) THEN
      EXECUTE item."statement";
    END IF;
  END LOOP;
END
$assessment_constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS "lesson_assessments_classroom_lesson_type"
  ON "LessonAssessments" ("classroomId", "lessonKey", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_questions_assessment_order"
  ON "AssessmentQuestions" ("assessmentId", "displayOrder");
CREATE INDEX IF NOT EXISTS "assessment_questions_assessment_objective"
  ON "AssessmentQuestions" ("assessmentId", "objectiveKey");
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_choices_question_order"
  ON "AssessmentChoices" ("questionId", "displayOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_attempts_assessment_student_number"
  ON "AssessmentAttempts" ("assessmentId", "studentId", "attemptNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_attempts_one_in_progress"
  ON "AssessmentAttempts" ("assessmentId", "studentId")
  WHERE "status" = 'IN_PROGRESS';
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_attempts_submission_key"
  ON "AssessmentAttempts" ("submissionKey")
  WHERE "submissionKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "assessment_attempts_classroom_student_submitted"
  ON "AssessmentAttempts" ("classroomId", "studentId", "submittedAt");
CREATE INDEX IF NOT EXISTS "assessment_attempts_assessment_status_submitted"
  ON "AssessmentAttempts" ("assessmentId", "status", "submittedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_responses_attempt_question"
  ON "AssessmentResponses" ("attemptId", "questionId");

ALTER TABLE "LessonAssessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentQuestions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentChoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentAttempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentResponses" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE "LessonAssessments" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "AssessmentQuestions" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "AssessmentChoices" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "AssessmentAttempts" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "AssessmentResponses" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "LessonAssessments_id_seq" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "AssessmentQuestions_id_seq" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "AssessmentChoices_id_seq" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "AssessmentAttempts_id_seq" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "AssessmentResponses_id_seq" FROM PUBLIC;

DO $assessment_roles$
DECLARE
  role_name text;
  table_name text;
  sequence_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      FOREACH table_name IN ARRAY ARRAY[
        'LessonAssessments', 'AssessmentQuestions', 'AssessmentChoices',
        'AssessmentAttempts', 'AssessmentResponses'
      ] LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', table_name, role_name);
      END LOOP;
      FOREACH sequence_name IN ARRAY ARRAY[
        'LessonAssessments_id_seq', 'AssessmentQuestions_id_seq', 'AssessmentChoices_id_seq',
        'AssessmentAttempts_id_seq', 'AssessmentResponses_id_seq'
      ] LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM %I', sequence_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END
$assessment_roles$;

COMMIT;
