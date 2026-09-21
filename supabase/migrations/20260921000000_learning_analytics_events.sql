BEGIN;

CREATE TABLE IF NOT EXISTS "LearningAnalyticsEvents" (
  "id" BIGSERIAL PRIMARY KEY,
  "studentId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
  "classroomId" INTEGER REFERENCES "Classrooms"("id") ON DELETE SET NULL,
  "levelKey" VARCHAR(255) NOT NULL,
  "lessonKey" VARCHAR(120) NOT NULL,
  "eventType" VARCHAR(40) NOT NULL,
  "occurredAt" TIMESTAMPTZ NOT NULL,
  "attemptNumber" INTEGER,
  "score" DOUBLE PRECISION,
  "failureCategory" VARCHAR(40),
  "failureCode" VARCHAR(64),
  "activeSeconds" INTEGER,
  "hintType" VARCHAR(20),
  "hintPurchased" BOOLEAN,
  "dedupeKey" VARCHAR(96) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "learning_analytics_event_type_valid"
    CHECK ("eventType" IN (
      'level_started',
      'solution_attempt_failed',
      'level_completed',
      'active_time_recorded',
      'hint_used'
    )),
  CONSTRAINT "learning_analytics_attempt_positive"
    CHECK ("attemptNumber" IS NULL OR "attemptNumber" > 0),
  CONSTRAINT "learning_analytics_score_valid"
    CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100)),
  CONSTRAINT "learning_analytics_active_time_positive"
    CHECK ("activeSeconds" IS NULL OR "activeSeconds" > 0),
  CONSTRAINT "learning_analytics_hint_type_valid"
    CHECK ("hintType" IS NULL OR "hintType" IN ('basic', 'detailed'))
);

-- The application migration runner executes sequelize.sync() before SQL
-- migrations. Add the checks explicitly as well so an already-created model
-- table receives the same database guarantees as a table created above.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'learning_analytics_event_type_valid'
      AND conrelid = '"LearningAnalyticsEvents"'::regclass
  ) THEN
    ALTER TABLE "LearningAnalyticsEvents"
      ADD CONSTRAINT "learning_analytics_event_type_valid"
      CHECK ("eventType" IN (
        'level_started',
        'solution_attempt_failed',
        'level_completed',
        'active_time_recorded',
        'hint_used'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'learning_analytics_attempt_positive'
      AND conrelid = '"LearningAnalyticsEvents"'::regclass
  ) THEN
    ALTER TABLE "LearningAnalyticsEvents"
      ADD CONSTRAINT "learning_analytics_attempt_positive"
      CHECK ("attemptNumber" IS NULL OR "attemptNumber" > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'learning_analytics_score_valid'
      AND conrelid = '"LearningAnalyticsEvents"'::regclass
  ) THEN
    ALTER TABLE "LearningAnalyticsEvents"
      ADD CONSTRAINT "learning_analytics_score_valid"
      CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'learning_analytics_active_time_positive'
      AND conrelid = '"LearningAnalyticsEvents"'::regclass
  ) THEN
    ALTER TABLE "LearningAnalyticsEvents"
      ADD CONSTRAINT "learning_analytics_active_time_positive"
      CHECK ("activeSeconds" IS NULL OR "activeSeconds" > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'learning_analytics_hint_type_valid'
      AND conrelid = '"LearningAnalyticsEvents"'::regclass
  ) THEN
    ALTER TABLE "LearningAnalyticsEvents"
      ADD CONSTRAINT "learning_analytics_hint_type_valid"
      CHECK ("hintType" IS NULL OR "hintType" IN ('basic', 'detailed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "learning_analytics_events_dedupe"
  ON "LearningAnalyticsEvents" ("dedupeKey");

CREATE INDEX IF NOT EXISTS "learning_analytics_events_classroom_student_time"
  ON "LearningAnalyticsEvents" ("classroomId", "studentId", "occurredAt");

CREATE INDEX IF NOT EXISTS "learning_analytics_events_student_time"
  ON "LearningAnalyticsEvents" ("studentId", "occurredAt");

CREATE INDEX IF NOT EXISTS "learning_analytics_events_type_time"
  ON "LearningAnalyticsEvents" ("eventType", "occurredAt");

CREATE INDEX IF NOT EXISTS "learning_analytics_events_lesson_level_time"
  ON "LearningAnalyticsEvents" ("lessonKey", "levelKey", "occurredAt");

ALTER TABLE "LearningAnalyticsEvents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "LearningAnalyticsEvents" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "LearningAnalyticsEvents_id_seq" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON TABLE "LearningAnalyticsEvents" FROM anon;
    REVOKE ALL PRIVILEGES ON SEQUENCE "LearningAnalyticsEvents_id_seq" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON TABLE "LearningAnalyticsEvents" FROM authenticated;
    REVOKE ALL PRIVILEGES ON SEQUENCE "LearningAnalyticsEvents_id_seq" FROM authenticated;
  END IF;
END $$;

COMMIT;
