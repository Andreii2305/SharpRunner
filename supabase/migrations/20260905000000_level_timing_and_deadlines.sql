BEGIN;

ALTER TABLE "UserProgresses"
  ADD COLUMN IF NOT EXISTS "activeSessionId" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "activeSessionStartedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS "user_progress_one_active_level_session"
  ON "UserProgresses" ("userId")
  WHERE "activeSessionId" IS NOT NULL;

-- Consolidate the legacy scoring-only deadline rows into the classroom level
-- setting used by access control. Existing explicit settings win.
INSERT INTO "LevelContentOverrides" (
  "classroomId", "levelKey", "dueAt", "createdAt", "updatedAt"
)
SELECT "classroomId", "levelKey", "deadlineAt", NOW(), NOW()
FROM "LevelDeadlines"
ON CONFLICT ("classroomId", "levelKey") DO UPDATE
SET "dueAt" = COALESCE("LevelContentOverrides"."dueAt", EXCLUDED."dueAt"),
    "updatedAt" = NOW();

CREATE TABLE IF NOT EXISTS "StudentLevelExtensions" (
  "id" SERIAL PRIMARY KEY,
  "classroomId" INTEGER NOT NULL REFERENCES "Classrooms"("id") ON DELETE CASCADE,
  "studentId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
  "levelKey" VARCHAR(255) NOT NULL,
  "extendedDueAt" TIMESTAMPTZ NOT NULL,
  "reason" VARCHAR(500),
  "createdBy" INTEGER NOT NULL REFERENCES "Users"("id"),
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "student_level_extensions_class_student_level_unique"
    UNIQUE ("classroomId", "studentId", "levelKey")
);

ALTER TABLE "StudentLevelExtensions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "StudentLevelExtensions" FROM PUBLIC;
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON TABLE "StudentLevelExtensions" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON TABLE "StudentLevelExtensions" FROM authenticated;
  END IF;
END
$migration$;

COMMIT;
