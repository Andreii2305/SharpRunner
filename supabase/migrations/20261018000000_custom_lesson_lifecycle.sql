-- Separate editor concurrency from the authoritative lesson-content revision,
-- and retain immutable evidence of revisions actually returned to students.
-- Existing lessons retain their current editor version as the identifier for
-- their current snapshot. This preserves dormant target bindings without
-- inventing an earlier content history, access time, or completion time.
BEGIN;

ALTER TABLE "ClassroomLessons"
  ADD COLUMN IF NOT EXISTS "contentVersion" INTEGER;

UPDATE "ClassroomLessons"
SET "contentVersion" = COALESCE(NULLIF("version", 0), 1)
WHERE "contentVersion" IS NULL;

ALTER TABLE "ClassroomLessons"
  ALTER COLUMN "contentVersion" SET DEFAULT 1,
  ALTER COLUMN "contentVersion" SET NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'classroom_lessons_content_version_positive'
  ) THEN
    ALTER TABLE "ClassroomLessons"
      ADD CONSTRAINT "classroom_lessons_content_version_positive"
      CHECK ("contentVersion" > 0);
  END IF;
END
$migration$;

DO $migration$
DECLARE existing_constraint text;
BEGIN
  FOR existing_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = '"ClassroomLessonPlacements"'::regclass
      AND confrelid = '"ClassroomLessons"'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY ("lessonId")%'
  LOOP
    EXECUTE format(
      'ALTER TABLE "ClassroomLessonPlacements" DROP CONSTRAINT %I',
      existing_constraint
    );
  END LOOP;
  ALTER TABLE "ClassroomLessonPlacements"
    ADD CONSTRAINT "classroom_lesson_placements_lesson_restrict_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "ClassroomLessons"("id")
    ON DELETE RESTRICT;
END
$migration$;

CREATE TABLE IF NOT EXISTS "ClassroomLessonContentAccesses" (
  "id" SERIAL PRIMARY KEY,
  "classroomLessonPlacementId" INTEGER NOT NULL,
  "classroomId" INTEGER NOT NULL,
  "lessonId" INTEGER NOT NULL,
  "studentId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE RESTRICT,
  "lessonVersion" INTEGER NOT NULL,
  "accessedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "classroom_lesson_content_access_version_positive"
    CHECK ("lessonVersion" > 0),
  CONSTRAINT "classroom_lesson_content_access_placement_fkey"
    FOREIGN KEY ("classroomLessonPlacementId", "classroomId", "lessonId")
    REFERENCES "ClassroomLessonPlacements" ("id", "classroomId", "lessonId")
    ON DELETE RESTRICT,
  CONSTRAINT "classroom_lesson_content_access_revision"
    UNIQUE ("classroomLessonPlacementId", "studentId", "lessonVersion")
);

-- sequelize.sync() runs before SQL migrations on new installations. Adopt its
-- compatible index and add the authoritative constraints when needed.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'classroom_lesson_content_access_version_positive'
  ) THEN
    ALTER TABLE "ClassroomLessonContentAccesses"
      ADD CONSTRAINT "classroom_lesson_content_access_version_positive"
      CHECK ("lessonVersion" > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'classroom_lesson_content_access_placement_fkey'
  ) THEN
    ALTER TABLE "ClassroomLessonContentAccesses"
      ADD CONSTRAINT "classroom_lesson_content_access_placement_fkey"
      FOREIGN KEY ("classroomLessonPlacementId", "classroomId", "lessonId")
      REFERENCES "ClassroomLessonPlacements" ("id", "classroomId", "lessonId")
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'classroom_lesson_content_access_revision'
  ) THEN
    IF to_regclass('public.classroom_lesson_content_access_revision') IS NOT NULL THEN
      ALTER TABLE "ClassroomLessonContentAccesses"
        ADD CONSTRAINT "classroom_lesson_content_access_revision"
        UNIQUE USING INDEX "classroom_lesson_content_access_revision";
    ELSE
      ALTER TABLE "ClassroomLessonContentAccesses"
        ADD CONSTRAINT "classroom_lesson_content_access_revision"
        UNIQUE ("classroomLessonPlacementId", "studentId", "lessonVersion");
    END IF;
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS "classroom_lesson_content_access_student_scope"
  ON "ClassroomLessonContentAccesses"
  ("classroomId", "studentId", "classroomLessonPlacementId");

CREATE OR REPLACE FUNCTION prevent_classroom_lesson_content_access_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'Classroom lesson content access records are immutable';
END
$function$;

DROP TRIGGER IF EXISTS "classroom_lesson_content_accesses_immutable"
  ON "ClassroomLessonContentAccesses";
CREATE TRIGGER "classroom_lesson_content_accesses_immutable"
  BEFORE UPDATE OR DELETE ON "ClassroomLessonContentAccesses"
  FOR EACH ROW EXECUTE FUNCTION prevent_classroom_lesson_content_access_mutation();

ALTER TABLE "ClassroomLessonContentAccesses" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ClassroomLessonContentAccesses" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "ClassroomLessonContentAccesses_id_seq" FROM PUBLIC;

DO $migration$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',
        'ClassroomLessonContentAccesses', role_name
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM %I',
        'ClassroomLessonContentAccesses_id_seq', role_name
      );
    END IF;
  END LOOP;
END
$migration$;

COMMIT;
