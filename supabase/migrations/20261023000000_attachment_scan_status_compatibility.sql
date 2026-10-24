-- Forward-only compatibility repair for attachment scan metadata.
-- A NULL scan status means the historical validation outcome is unknown.
-- Normalize only NULL values to not_configured; both states remain unavailable
-- under the attachment delivery policy.

BEGIN;

ALTER TABLE "ClassroomLessonAttachments"
  ADD COLUMN IF NOT EXISTS "scanStatus" VARCHAR(20);

UPDATE "ClassroomLessonAttachments"
SET "scanStatus" = 'not_configured'
WHERE "scanStatus" IS NULL;

ALTER TABLE "ClassroomLessonAttachments"
  ALTER COLUMN "scanStatus" SET DEFAULT 'not_configured',
  ALTER COLUMN "scanStatus" SET NOT NULL;

ALTER TABLE "ClassroomLessonSubmissionAttachments"
  ADD COLUMN IF NOT EXISTS "scanStatus" VARCHAR(20);

UPDATE "ClassroomLessonSubmissionAttachments"
SET "scanStatus" = 'not_configured'
WHERE "scanStatus" IS NULL;

ALTER TABLE "ClassroomLessonSubmissionAttachments"
  ALTER COLUMN "scanStatus" SET DEFAULT 'not_configured',
  ALTER COLUMN "scanStatus" SET NOT NULL;

COMMIT;
