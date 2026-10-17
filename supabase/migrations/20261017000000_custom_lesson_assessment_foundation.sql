-- Establish dormant typed targets for future custom-lesson assessments and
-- immutable, revision-specific reading acknowledgements. This migration does
-- not expose custom assessments or change current reader/progression behavior.
BEGIN;

ALTER TABLE "ClassroomLessonPlacements"
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'classroom_lesson_placements_id_classroom_unique'
  ) THEN
    IF to_regclass('public.classroom_lesson_placements_id_classroom_unique') IS NOT NULL THEN
      ALTER TABLE "ClassroomLessonPlacements"
        ADD CONSTRAINT "classroom_lesson_placements_id_classroom_unique"
        UNIQUE USING INDEX "classroom_lesson_placements_id_classroom_unique";
    ELSE
      ALTER TABLE "ClassroomLessonPlacements"
        ADD CONSTRAINT "classroom_lesson_placements_id_classroom_unique"
        UNIQUE ("id", "classroomId");
    END IF;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'classroom_lesson_placements_id_classroom_lesson_unique'
  ) THEN
    IF to_regclass('public.classroom_lesson_placements_id_classroom_lesson_unique') IS NOT NULL THEN
      ALTER TABLE "ClassroomLessonPlacements"
        ADD CONSTRAINT "classroom_lesson_placements_id_classroom_lesson_unique"
        UNIQUE USING INDEX "classroom_lesson_placements_id_classroom_lesson_unique";
    ELSE
      ALTER TABLE "ClassroomLessonPlacements"
        ADD CONSTRAINT "classroom_lesson_placements_id_classroom_lesson_unique"
        UNIQUE ("id", "classroomId", "lessonId");
    END IF;
  END IF;
END
$migration$;

ALTER TABLE "LessonAssessments"
  ADD COLUMN IF NOT EXISTS "targetKind" VARCHAR(40) DEFAULT 'BUILT_IN',
  ADD COLUMN IF NOT EXISTS "classroomLessonPlacementId" INTEGER,
  ADD COLUMN IF NOT EXISTS "targetLessonVersion" INTEGER;

UPDATE "LessonAssessments"
SET "targetKind" = 'BUILT_IN'
WHERE "targetKind" IS NULL;

ALTER TABLE "LessonAssessments"
  ALTER COLUMN "targetKind" SET DEFAULT 'BUILT_IN',
  ALTER COLUMN "targetKind" SET NOT NULL,
  ALTER COLUMN "lessonKey" DROP NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lesson_assessment_target_kind_valid'
  ) THEN
    ALTER TABLE "LessonAssessments"
      ADD CONSTRAINT "lesson_assessment_target_kind_valid"
      CHECK ("targetKind" IN ('BUILT_IN', 'CLASSROOM_LESSON_PLACEMENT'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lesson_assessment_target_shape_valid'
  ) THEN
    ALTER TABLE "LessonAssessments"
      ADD CONSTRAINT "lesson_assessment_target_shape_valid"
      CHECK (
        (
          "targetKind" = 'BUILT_IN'
          AND "lessonKey" IS NOT NULL
          AND "classroomLessonPlacementId" IS NULL
          AND "targetLessonVersion" IS NULL
        )
        OR
        (
          "targetKind" = 'CLASSROOM_LESSON_PLACEMENT'
          AND "lessonKey" IS NULL
          AND "classroomLessonPlacementId" IS NOT NULL
          AND "targetLessonVersion" IS NOT NULL
          AND "targetLessonVersion" > 0
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lesson_assessment_custom_publication_dormant'
  ) THEN
    ALTER TABLE "LessonAssessments"
      ADD CONSTRAINT "lesson_assessment_custom_publication_dormant"
      CHECK (
        "targetKind" <> 'CLASSROOM_LESSON_PLACEMENT'
        OR ("isPublished" = FALSE AND "publishedAt" IS NULL)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lesson_assessment_custom_placement_classroom_fkey'
  ) THEN
    ALTER TABLE "LessonAssessments"
      ADD CONSTRAINT "lesson_assessment_custom_placement_classroom_fkey"
      FOREIGN KEY ("classroomLessonPlacementId", "classroomId")
      REFERENCES "ClassroomLessonPlacements" ("id", "classroomId")
      ON DELETE RESTRICT;
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS "lesson_assessments_custom_placement_type"
  ON "LessonAssessments" ("classroomLessonPlacementId", "type")
  WHERE "targetKind" = 'CLASSROOM_LESSON_PLACEMENT';

CREATE INDEX IF NOT EXISTS "classroom_lesson_placements_active_scope"
  ON "ClassroomLessonPlacements" ("classroomId", "archivedAt", "id");

CREATE TABLE IF NOT EXISTS "ClassroomLessonReadingCompletions" (
  "id" SERIAL PRIMARY KEY,
  "classroomLessonPlacementId" INTEGER NOT NULL,
  "classroomId" INTEGER NOT NULL,
  "lessonId" INTEGER NOT NULL,
  "studentId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE RESTRICT,
  "lessonVersion" INTEGER NOT NULL,
  "completedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "classroom_lesson_reading_completion_version_positive"
    CHECK ("lessonVersion" > 0),
  CONSTRAINT "classroom_lesson_reading_completion_placement_fkey"
    FOREIGN KEY ("classroomLessonPlacementId", "classroomId", "lessonId")
    REFERENCES "ClassroomLessonPlacements" ("id", "classroomId", "lessonId")
    ON DELETE RESTRICT,
  CONSTRAINT "classroom_lesson_reading_completion_revision"
    UNIQUE ("classroomLessonPlacementId", "studentId", "lessonVersion")
);

-- sequelize.sync() precedes SQL migrations on a fresh installation, so apply
-- the authoritative constraints defensively even when the model made the table.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'classroom_lesson_reading_completion_version_positive'
  ) THEN
    ALTER TABLE "ClassroomLessonReadingCompletions"
      ADD CONSTRAINT "classroom_lesson_reading_completion_version_positive"
      CHECK ("lessonVersion" > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'classroom_lesson_reading_completion_placement_fkey'
  ) THEN
    ALTER TABLE "ClassroomLessonReadingCompletions"
      ADD CONSTRAINT "classroom_lesson_reading_completion_placement_fkey"
      FOREIGN KEY ("classroomLessonPlacementId", "classroomId", "lessonId")
      REFERENCES "ClassroomLessonPlacements" ("id", "classroomId", "lessonId")
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'classroom_lesson_reading_completion_revision'
  ) THEN
    IF to_regclass('public.classroom_lesson_reading_completion_revision') IS NOT NULL THEN
      ALTER TABLE "ClassroomLessonReadingCompletions"
        ADD CONSTRAINT "classroom_lesson_reading_completion_revision"
        UNIQUE USING INDEX "classroom_lesson_reading_completion_revision";
    ELSE
      ALTER TABLE "ClassroomLessonReadingCompletions"
        ADD CONSTRAINT "classroom_lesson_reading_completion_revision"
        UNIQUE ("classroomLessonPlacementId", "studentId", "lessonVersion");
    END IF;
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS "classroom_lesson_reading_completion_student_scope"
  ON "ClassroomLessonReadingCompletions" ("classroomId", "studentId", "classroomLessonPlacementId");

CREATE OR REPLACE FUNCTION prevent_classroom_lesson_reading_completion_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'Classroom lesson reading completions are immutable';
END
$function$;

DROP TRIGGER IF EXISTS "classroom_lesson_reading_completions_immutable"
  ON "ClassroomLessonReadingCompletions";
CREATE TRIGGER "classroom_lesson_reading_completions_immutable"
  BEFORE UPDATE OR DELETE ON "ClassroomLessonReadingCompletions"
  FOR EACH ROW EXECUTE FUNCTION prevent_classroom_lesson_reading_completion_mutation();

ALTER TABLE "ClassroomLessonReadingCompletions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ClassroomLessonReadingCompletions" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "ClassroomLessonReadingCompletions_id_seq" FROM PUBLIC;

DO $migration$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',
        'ClassroomLessonReadingCompletions', role_name
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM %I',
        'ClassroomLessonReadingCompletions_id_seq', role_name
      );
    END IF;
  END LOOP;
END
$migration$;

COMMIT;
