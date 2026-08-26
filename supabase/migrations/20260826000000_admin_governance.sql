ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

UPDATE "Users" SET "tokenVersion" = 0 WHERE "tokenVersion" IS NULL;

-- User status is stored as text by the existing schema. The application now
-- recognizes "archived" in addition to active/inactive/pending.
