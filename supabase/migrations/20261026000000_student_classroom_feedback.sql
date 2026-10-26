BEGIN;

-- Feedback is retained as classroom history. Membership removal and classroom
-- archival do not delete it; hard deletion of either referenced record is
-- deliberately blocked by the RESTRICT foreign keys below.
CREATE TABLE IF NOT EXISTS "StudentClassroomFeedbacks" (
  "id" SERIAL PRIMARY KEY,
  "classroomId" INTEGER NOT NULL,
  "studentId" INTEGER NOT NULL,
  "message" VARCHAR(1000) NOT NULL,
  "idempotencyKey" VARCHAR(96) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "student_classroom_feedback_classroom_fk"
    FOREIGN KEY ("classroomId") REFERENCES "Classrooms"("id") ON DELETE RESTRICT,
  CONSTRAINT "student_classroom_feedback_student_fk"
    FOREIGN KEY ("studentId") REFERENCES "Users"("id") ON DELETE RESTRICT,
  CONSTRAINT "student_classroom_feedback_message_valid"
    CHECK (length(trim("message")) BETWEEN 1 AND 1000),
  CONSTRAINT "student_classroom_feedback_key_valid"
    CHECK ("idempotencyKey" ~ '^[A-Za-z0-9_-]{8,96}$')
);

-- sequelize.sync() runs before explicit migrations. Add the required named
-- constraints when the model has already created the table.
DO $student_classroom_feedback_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_classroom_feedback_classroom_fk'
      AND conrelid = 'public."StudentClassroomFeedbacks"'::regclass
  ) THEN
    ALTER TABLE "StudentClassroomFeedbacks"
      ADD CONSTRAINT "student_classroom_feedback_classroom_fk"
      FOREIGN KEY ("classroomId") REFERENCES "Classrooms"("id") ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_classroom_feedback_student_fk'
      AND conrelid = 'public."StudentClassroomFeedbacks"'::regclass
  ) THEN
    ALTER TABLE "StudentClassroomFeedbacks"
      ADD CONSTRAINT "student_classroom_feedback_student_fk"
      FOREIGN KEY ("studentId") REFERENCES "Users"("id") ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_classroom_feedback_message_valid'
      AND conrelid = 'public."StudentClassroomFeedbacks"'::regclass
  ) THEN
    ALTER TABLE "StudentClassroomFeedbacks"
      ADD CONSTRAINT "student_classroom_feedback_message_valid"
      CHECK (length(trim("message")) BETWEEN 1 AND 1000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_classroom_feedback_key_valid'
      AND conrelid = 'public."StudentClassroomFeedbacks"'::regclass
  ) THEN
    ALTER TABLE "StudentClassroomFeedbacks"
      ADD CONSTRAINT "student_classroom_feedback_key_valid"
      CHECK ("idempotencyKey" ~ '^[A-Za-z0-9_-]{8,96}$');
  END IF;
END
$student_classroom_feedback_constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS "student_classroom_feedback_student_key"
  ON "StudentClassroomFeedbacks" ("studentId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "student_classroom_feedback_classroom_created_id"
  ON "StudentClassroomFeedbacks" ("classroomId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "student_classroom_feedback_student_created_id"
  ON "StudentClassroomFeedbacks" ("studentId", "createdAt", "id");

ALTER TABLE "StudentClassroomFeedbacks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "StudentClassroomFeedbacks" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "StudentClassroomFeedbacks_id_seq" FROM PUBLIC;

DO $student_classroom_feedback_roles$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',
        'StudentClassroomFeedbacks',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM %I',
        'StudentClassroomFeedbacks_id_seq',
        role_name
      );
    END IF;
  END LOOP;
END
$student_classroom_feedback_roles$;

COMMIT;
