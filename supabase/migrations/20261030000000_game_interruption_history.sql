BEGIN;

-- Game interruption history is retained classroom history. Membership removal,
-- classroom archival, reloads, and replacement sessions do not delete it.
-- Hard deletion of a referenced student, classroom, or session is blocked.
CREATE TABLE IF NOT EXISTS "GameInterruptionSessions" (
  "id" SERIAL PRIMARY KEY,
  "studentId" INTEGER NOT NULL,
  "classroomId" INTEGER NOT NULL,
  "levelKey" VARCHAR(64) NOT NULL,
  "sessionKey" VARCHAR(96) NOT NULL,
  "scoreDeductionSnapshot" NUMERIC(5, 2) NOT NULL,
  "xpDeductionSnapshot" INTEGER NOT NULL,
  "lifecycleStatus" VARCHAR(16) NOT NULL DEFAULT 'CURRENT',
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "supersededAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "game_interruption_sessions_student_fk"
    FOREIGN KEY ("studentId") REFERENCES "Users"("id") ON DELETE RESTRICT,
  CONSTRAINT "game_interruption_sessions_classroom_fk"
    FOREIGN KEY ("classroomId") REFERENCES "Classrooms"("id") ON DELETE RESTRICT,
  CONSTRAINT "game_interruption_sessions_student_key"
    UNIQUE ("studentId", "sessionKey"),
  CONSTRAINT "game_interruption_sessions_id_student"
    UNIQUE ("id", "studentId"),
  CONSTRAINT "game_interruption_sessions_level_valid"
    CHECK ("levelKey" IN (
      'tutorial-level-1', 'tutorial-level-2', 'tutorial-level-3',
      'tutorial-level-4', 'tutorial-level-5',
      'arrays-level-1', 'arrays-level-2', 'arrays-level-3', 'arrays-level-4',
      'arrays-level-5', 'arrays-level-6', 'arrays-level-7', 'arrays-level-8',
      'functions-level-1', 'functions-level-2', 'functions-level-3',
      'functions-level-4', 'functions-level-5', 'functions-level-6',
      'functions-level-7', 'functions-level-8', 'functions-level-9',
      'functions-level-10', 'functions-level-11',
      'functions-with-arrays-level-1', 'functions-with-arrays-level-2',
      'functions-with-arrays-level-3', 'functions-with-arrays-level-4',
      'final-level-1'
    )),
  CONSTRAINT "game_interruption_sessions_key_valid"
    CHECK ("sessionKey" ~ '^[A-Za-z0-9_-]{8,96}$'),
  CONSTRAINT "game_interruption_sessions_score_rate_valid"
    CHECK ("scoreDeductionSnapshot" >= 0 AND "scoreDeductionSnapshot" <= 100),
  CONSTRAINT "game_interruption_sessions_xp_rate_valid"
    CHECK ("xpDeductionSnapshot" >= 0 AND "xpDeductionSnapshot" <= 100),
  CONSTRAINT "game_interruption_sessions_lifecycle_valid"
    CHECK (
      ("lifecycleStatus" = 'CURRENT'
        AND "supersededAt" IS NULL AND "completedAt" IS NULL)
      OR
      ("lifecycleStatus" = 'SUPERSEDED'
        AND "supersededAt" IS NOT NULL AND "completedAt" IS NULL
        AND "supersededAt" >= "startedAt")
      OR
      ("lifecycleStatus" = 'COMPLETED'
        AND "completedAt" IS NOT NULL AND "supersededAt" IS NULL
        AND "completedAt" >= "startedAt")
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_interruption_sessions_student_key"
  ON "GameInterruptionSessions" ("studentId", "sessionKey");
CREATE UNIQUE INDEX IF NOT EXISTS "game_interruption_sessions_id_student"
  ON "GameInterruptionSessions" ("id", "studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "game_interruption_sessions_one_current"
  ON "GameInterruptionSessions" ("studentId", "classroomId", "levelKey")
  WHERE "lifecycleStatus" = 'CURRENT';
CREATE INDEX IF NOT EXISTS "game_interruption_sessions_scope_history"
  ON "GameInterruptionSessions"
  ("classroomId", "studentId", "levelKey", "createdAt", "id");

CREATE TABLE IF NOT EXISTS "GameInterruptionEvents" (
  "id" SERIAL PRIMARY KEY,
  "sessionId" INTEGER NOT NULL,
  "studentId" INTEGER NOT NULL,
  "eventKey" VARCHAR(96) NOT NULL,
  "eventType" VARCHAR(24) NOT NULL,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "appliedAt" TIMESTAMPTZ,
  "appliedScoreDeduction" NUMERIC(5, 2),
  "appliedXpDeduction" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "game_interruption_events_session_student_fk"
    FOREIGN KEY ("sessionId", "studentId")
    REFERENCES "GameInterruptionSessions"("id", "studentId") ON DELETE RESTRICT,
  CONSTRAINT "game_interruption_events_student_fk"
    FOREIGN KEY ("studentId") REFERENCES "Users"("id") ON DELETE RESTRICT,
  CONSTRAINT "game_interruption_events_student_key"
    UNIQUE ("studentId", "eventKey"),
  CONSTRAINT "game_interruption_events_key_valid"
    CHECK ("eventKey" ~ '^[A-Za-z0-9_-]{8,96}$'),
  CONSTRAINT "game_interruption_events_type_valid"
    CHECK ("eventType" IN ('fullscreen_exit', 'hidden')),
  CONSTRAINT "game_interruption_events_application_valid"
    CHECK (
      ("appliedAt" IS NULL
        AND "appliedScoreDeduction" IS NULL
        AND "appliedXpDeduction" IS NULL)
      OR
      ("appliedAt" IS NOT NULL
        AND "appliedScoreDeduction" IS NOT NULL
        AND "appliedXpDeduction" IS NOT NULL
        AND "appliedAt" >= "receivedAt"
        AND "appliedScoreDeduction" >= 0
        AND "appliedScoreDeduction" <= 100
        AND "appliedXpDeduction" >= 0
        AND "appliedXpDeduction" <= 100)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "game_interruption_events_student_key"
  ON "GameInterruptionEvents" ("studentId", "eventKey");
CREATE INDEX IF NOT EXISTS "game_interruption_events_unapplied"
  ON "GameInterruptionEvents" ("sessionId", "receivedAt", "id")
  WHERE "appliedAt" IS NULL;

-- sequelize.sync() runs before explicit migrations. Add named constraints when
-- the models have already created either table.
DO $game_interruption_history_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_sessions_student_fk'
      AND conrelid = 'public."GameInterruptionSessions"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionSessions"
      ADD CONSTRAINT "game_interruption_sessions_student_fk"
      FOREIGN KEY ("studentId") REFERENCES "Users"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_sessions_classroom_fk'
      AND conrelid = 'public."GameInterruptionSessions"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionSessions"
      ADD CONSTRAINT "game_interruption_sessions_classroom_fk"
      FOREIGN KEY ("classroomId") REFERENCES "Classrooms"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_sessions_level_valid'
      AND conrelid = 'public."GameInterruptionSessions"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionSessions"
      ADD CONSTRAINT "game_interruption_sessions_level_valid"
      CHECK ("levelKey" IN (
        'tutorial-level-1', 'tutorial-level-2', 'tutorial-level-3',
        'tutorial-level-4', 'tutorial-level-5',
        'arrays-level-1', 'arrays-level-2', 'arrays-level-3', 'arrays-level-4',
        'arrays-level-5', 'arrays-level-6', 'arrays-level-7', 'arrays-level-8',
        'functions-level-1', 'functions-level-2', 'functions-level-3',
        'functions-level-4', 'functions-level-5', 'functions-level-6',
        'functions-level-7', 'functions-level-8', 'functions-level-9',
        'functions-level-10', 'functions-level-11',
        'functions-with-arrays-level-1', 'functions-with-arrays-level-2',
        'functions-with-arrays-level-3', 'functions-with-arrays-level-4',
        'final-level-1'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_sessions_key_valid'
      AND conrelid = 'public."GameInterruptionSessions"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionSessions"
      ADD CONSTRAINT "game_interruption_sessions_key_valid"
      CHECK ("sessionKey" ~ '^[A-Za-z0-9_-]{8,96}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_sessions_score_rate_valid'
      AND conrelid = 'public."GameInterruptionSessions"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionSessions"
      ADD CONSTRAINT "game_interruption_sessions_score_rate_valid"
      CHECK ("scoreDeductionSnapshot" >= 0 AND "scoreDeductionSnapshot" <= 100);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_sessions_xp_rate_valid'
      AND conrelid = 'public."GameInterruptionSessions"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionSessions"
      ADD CONSTRAINT "game_interruption_sessions_xp_rate_valid"
      CHECK ("xpDeductionSnapshot" >= 0 AND "xpDeductionSnapshot" <= 100);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_sessions_lifecycle_valid'
      AND conrelid = 'public."GameInterruptionSessions"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionSessions"
      ADD CONSTRAINT "game_interruption_sessions_lifecycle_valid"
      CHECK (
        ("lifecycleStatus" = 'CURRENT'
          AND "supersededAt" IS NULL AND "completedAt" IS NULL)
        OR
        ("lifecycleStatus" = 'SUPERSEDED'
          AND "supersededAt" IS NOT NULL AND "completedAt" IS NULL
          AND "supersededAt" >= "startedAt")
        OR
        ("lifecycleStatus" = 'COMPLETED'
          AND "completedAt" IS NOT NULL AND "supersededAt" IS NULL
          AND "completedAt" >= "startedAt")
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_events_session_student_fk'
      AND conrelid = 'public."GameInterruptionEvents"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionEvents"
      ADD CONSTRAINT "game_interruption_events_session_student_fk"
      FOREIGN KEY ("sessionId", "studentId")
      REFERENCES "GameInterruptionSessions"("id", "studentId") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_events_student_fk'
      AND conrelid = 'public."GameInterruptionEvents"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionEvents"
      ADD CONSTRAINT "game_interruption_events_student_fk"
      FOREIGN KEY ("studentId") REFERENCES "Users"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_events_key_valid'
      AND conrelid = 'public."GameInterruptionEvents"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionEvents"
      ADD CONSTRAINT "game_interruption_events_key_valid"
      CHECK ("eventKey" ~ '^[A-Za-z0-9_-]{8,96}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_events_type_valid'
      AND conrelid = 'public."GameInterruptionEvents"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionEvents"
      ADD CONSTRAINT "game_interruption_events_type_valid"
      CHECK ("eventType" IN ('fullscreen_exit', 'hidden'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_events_application_valid'
      AND conrelid = 'public."GameInterruptionEvents"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionEvents"
      ADD CONSTRAINT "game_interruption_events_application_valid"
      CHECK (
        ("appliedAt" IS NULL
          AND "appliedScoreDeduction" IS NULL
          AND "appliedXpDeduction" IS NULL)
        OR
        ("appliedAt" IS NOT NULL
          AND "appliedScoreDeduction" IS NOT NULL
          AND "appliedXpDeduction" IS NOT NULL
          AND "appliedAt" >= "receivedAt"
          AND "appliedScoreDeduction" >= 0
          AND "appliedScoreDeduction" <= 100
          AND "appliedXpDeduction" >= 0
          AND "appliedXpDeduction" <= 100)
      );
  END IF;
END
$game_interruption_history_constraints$;

ALTER TABLE "GameInterruptionSessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GameInterruptionEvents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "GameInterruptionSessions" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "GameInterruptionEvents" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "GameInterruptionSessions_id_seq" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "GameInterruptionEvents_id_seq" FROM PUBLIC;

DO $game_interruption_history_roles$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I, public.%I FROM %I',
        'GameInterruptionSessions', 'GameInterruptionEvents', role_name
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE public.%I, public.%I FROM %I',
        'GameInterruptionSessions_id_seq', 'GameInterruptionEvents_id_seq', role_name
      );
    END IF;
  END LOOP;
END
$game_interruption_history_roles$;

COMMIT;
