ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "xpTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "gamificationPreference" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "learningGameInterest" VARCHAR(20);

ALTER TABLE "UserProgresses"
  ADD COLUMN IF NOT EXISTS "hintUsed" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "hintUsedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "hintType" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "attemptCountAtHintUnlock" INTEGER,
  ADD COLUMN IF NOT EXISTS "xpAwarded" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "xpAwardedAt" TIMESTAMPTZ;

ALTER TABLE "LevelContentOverrides"
  ADD COLUMN IF NOT EXISTS "hintUnlockThreshold" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "ClassroomLessons"
  ADD COLUMN IF NOT EXISTS "moduleId" INTEGER REFERENCES "ClassroomLessons"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "externalUrl" VARCHAR(1000);

CREATE INDEX IF NOT EXISTS "classroom_lessons_module_id"
  ON "ClassroomLessons" ("classroomId", "moduleId");

CREATE TABLE IF NOT EXISTS "XpTransactions" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
  "amount" INTEGER NOT NULL CHECK ("amount" <> 0),
  "kind" VARCHAR(40) NOT NULL,
  "referenceType" VARCHAR(40) NOT NULL,
  "referenceId" VARCHAR(160) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "xp_transactions_reward_once"
    UNIQUE ("userId", "kind", "referenceType", "referenceId")
);

CREATE INDEX IF NOT EXISTS "xp_transactions_user_history"
  ON "XpTransactions" ("userId", "createdAt");

ALTER TABLE "XpTransactions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "XpTransactions" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "XpTransactions" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "XpTransactions" FROM authenticated;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_xp_total_nonnegative'
  ) THEN
    ALTER TABLE "Users" ADD CONSTRAINT "users_xp_total_nonnegative" CHECK ("xpTotal" >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'level_hint_unlock_threshold_bounds'
  ) THEN
    ALTER TABLE "LevelContentOverrides" ADD CONSTRAINT "level_hint_unlock_threshold_bounds"
      CHECK ("hintUnlockThreshold" BETWEEN 1 AND 10);
  END IF;
END $$;
