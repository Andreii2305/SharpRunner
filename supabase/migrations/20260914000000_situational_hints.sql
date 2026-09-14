ALTER TABLE "UserProgresses"
  ADD COLUMN IF NOT EXISTS "detailedHintAttemptCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "latestFailureCode" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "latestFailureCategory" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "latestFailureMetadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "latestFailureAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "latestFailureAttemptCount" INTEGER;

CREATE TABLE IF NOT EXISTS "HintFeedbacks" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
  "levelKey" VARCHAR(255) NOT NULL,
  "failureCode" VARCHAR(64) NOT NULL,
  "hintStage" VARCHAR(20) NOT NULL,
  "helpful" BOOLEAN NOT NULL,
  "fallbackUsed" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "hint_feedback_stage_valid" CHECK ("hintStage" IN ('personalized', 'stronger')),
  CONSTRAINT "hint_feedback_one_response_per_stage"
    UNIQUE ("userId", "levelKey", "failureCode", "hintStage")
);

CREATE INDEX IF NOT EXISTS "hint_feedback_level_failure_stage"
  ON "HintFeedbacks" ("levelKey", "failureCode", "hintStage");

ALTER TABLE "HintFeedbacks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "HintFeedbacks" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "HintFeedbacks" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "HintFeedbacks" FROM authenticated;
  END IF;
END $$;
