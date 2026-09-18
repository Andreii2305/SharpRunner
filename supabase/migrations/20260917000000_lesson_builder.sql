-- Add reusable teacher-owned lessons, classroom placements, ordered topics, and
-- topic-image metadata without replacing legacy classroom lesson records.
BEGIN;

ALTER TABLE "ClassroomLessons"
  ADD COLUMN IF NOT EXISTS "teacherId" INTEGER REFERENCES "Users"("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "lessonNumber" INTEGER,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ;

UPDATE "ClassroomLessons" lesson
SET "teacherId" = classroom."teacherId"
FROM "Classrooms" classroom
WHERE lesson."classroomId" = classroom."id"
  AND lesson."teacherId" IS NULL;

ALTER TABLE "ClassroomLessons" ALTER COLUMN "classroomId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "classroom_lessons_teacher_library"
  ON "ClassroomLessons" ("teacherId", "archivedAt", "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS "ClassroomLessonPlacements" (
  "id" SERIAL PRIMARY KEY,
  "lessonId" INTEGER NOT NULL REFERENCES "ClassroomLessons"("id") ON DELETE CASCADE,
  "classroomId" INTEGER NOT NULL REFERENCES "Classrooms"("id") ON DELETE CASCADE,
  "moduleId" INTEGER REFERENCES "ClassroomLessons"("id") ON DELETE SET NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "classroom_lesson_placement_unique" UNIQUE ("lessonId", "classroomId")
);

INSERT INTO "ClassroomLessonPlacements" ("lessonId", "classroomId", "moduleId", "displayOrder", "createdAt", "updatedAt")
SELECT lesson."id", lesson."classroomId", lesson."moduleId", lesson."displayOrder", lesson."createdAt", lesson."updatedAt"
FROM "ClassroomLessons" lesson
WHERE lesson."classroomId" IS NOT NULL
  AND lesson."contentType" = 'lesson'
ON CONFLICT ("lessonId", "classroomId") DO NOTHING;

CREATE INDEX IF NOT EXISTS "classroom_lesson_placements_order"
  ON "ClassroomLessonPlacements" ("classroomId", "moduleId", "displayOrder");

CREATE TABLE IF NOT EXISTS "LessonTopics" (
  "id" SERIAL PRIMARY KEY,
  "lessonId" INTEGER NOT NULL REFERENCES "ClassroomLessons"("id") ON DELETE CASCADE,
  "title" VARCHAR(180) NOT NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "content" JSONB NOT NULL DEFAULT '{"format":"markdown","body":"","codeBlocks":[],"practiceBlocks":[]}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS "lesson_topics_order"
  ON "LessonTopics" ("lessonId", "displayOrder", "id");

ALTER TABLE "ClassroomLessonAttachments"
  ALTER COLUMN "classroomId" DROP NOT NULL;
ALTER TABLE "ClassroomLessonAttachments"
  ADD COLUMN IF NOT EXISTS "topicId" INTEGER REFERENCES "LessonTopics"("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "purpose" VARCHAR(20) NOT NULL DEFAULT 'attachment',
  ADD COLUMN IF NOT EXISTS "placement" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "altText" VARCHAR(300),
  ADD COLUMN IF NOT EXISTS "caption" VARCHAR(500);

CREATE INDEX IF NOT EXISTS "lesson_topic_images_order"
  ON "ClassroomLessonAttachments" ("topicId", "placement", "displayOrder")
  WHERE "topicId" IS NOT NULL;

ALTER TABLE "ClassroomLessonVersions" ALTER COLUMN "classroomId" DROP NOT NULL;

DO $migration$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ClassroomLessonPlacements', 'LessonTopics']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', table_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated', table_name);
    END IF;
  END LOOP;
END
$migration$;

COMMIT;
