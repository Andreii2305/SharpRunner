BEGIN;

CREATE TABLE IF NOT EXISTS "TeacherStudentCheckIns" (
  "id" SERIAL PRIMARY KEY,
  "senderId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE RESTRICT,
  "senderRole" VARCHAR(16) NOT NULL,
  "recipientStudentId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE RESTRICT,
  "classroomId" INTEGER NOT NULL REFERENCES "Classrooms"("id") ON DELETE RESTRICT,
  "message" VARCHAR(1000) NOT NULL,
  "idempotencyKey" VARCHAR(96) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "teacher_student_check_ins_sender_role_valid"
    CHECK ("senderRole" IN ('teacher', 'admin')),
  CONSTRAINT "teacher_student_check_ins_message_valid"
    CHECK (length(trim("message")) BETWEEN 1 AND 1000),
  CONSTRAINT "teacher_student_check_ins_key_valid"
    CHECK ("idempotencyKey" ~ '^[A-Za-z0-9_-]{8,96}$')
);

-- sequelize.sync() runs before explicit migrations. Add named checks to a
-- table that may already have been created from the current model.
DO $teacher_student_check_in_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teacher_student_check_ins_sender_role_valid'
      AND conrelid = 'public."TeacherStudentCheckIns"'::regclass
  ) THEN
    ALTER TABLE "TeacherStudentCheckIns"
      ADD CONSTRAINT "teacher_student_check_ins_sender_role_valid"
      CHECK ("senderRole" IN ('teacher', 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teacher_student_check_ins_message_valid'
      AND conrelid = 'public."TeacherStudentCheckIns"'::regclass
  ) THEN
    ALTER TABLE "TeacherStudentCheckIns"
      ADD CONSTRAINT "teacher_student_check_ins_message_valid"
      CHECK (length(trim("message")) BETWEEN 1 AND 1000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teacher_student_check_ins_key_valid'
      AND conrelid = 'public."TeacherStudentCheckIns"'::regclass
  ) THEN
    ALTER TABLE "TeacherStudentCheckIns"
      ADD CONSTRAINT "teacher_student_check_ins_key_valid"
      CHECK ("idempotencyKey" ~ '^[A-Za-z0-9_-]{8,96}$');
  END IF;
END
$teacher_student_check_in_constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS "teacher_student_check_ins_sender_key"
  ON "TeacherStudentCheckIns" ("senderId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "teacher_student_check_ins_recipient_created"
  ON "TeacherStudentCheckIns" ("recipientStudentId", "createdAt");

ALTER TABLE "TeacherStudentCheckIns" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "TeacherStudentCheckIns" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "TeacherStudentCheckIns_id_seq" FROM PUBLIC;

DO $teacher_student_check_in_roles$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',
        'TeacherStudentCheckIns',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM %I',
        'TeacherStudentCheckIns_id_seq',
        role_name
      );
    END IF;
  END LOOP;
END
$teacher_student_check_in_roles$;

COMMIT;
