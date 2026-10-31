BEGIN;

-- First-completion calculation evidence is retained and immutable. Historical
-- completions are intentionally not backfilled, and historical interruption
-- events and XP transactions remain unlinked.
CREATE TABLE IF NOT EXISTS "GameInterruptionCompletionEvidence" (
  "id" SERIAL PRIMARY KEY,
  "studentId" INTEGER NOT NULL,
  "classroomId" INTEGER NOT NULL,
  "levelKey" VARCHAR(64) NOT NULL,
  "policyVersion" VARCHAR(40) NOT NULL,
  "appliedEventCount" INTEGER NOT NULL,
  "baseScore" NUMERIC(5, 2) NOT NULL,
  "scoreDeduction" NUMERIC(5, 2) NOT NULL,
  "finalScore" NUMERIC(5, 2) NOT NULL,
  "grossCompletionXp" INTEGER NOT NULL,
  "xpDeduction" INTEGER NOT NULL,
  "netCompletionXp" INTEGER NOT NULL,
  "completedAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "game_interruption_completion_evidence_student_fk"
    FOREIGN KEY ("studentId") REFERENCES "Users"("id") ON DELETE RESTRICT,
  CONSTRAINT "game_interruption_completion_evidence_classroom_fk"
    FOREIGN KEY ("classroomId") REFERENCES "Classrooms"("id") ON DELETE RESTRICT,
  CONSTRAINT "game_interruption_completion_evidence_student_level"
    UNIQUE ("studentId", "levelKey"),
  CONSTRAINT "game_interruption_completion_evidence_id_student"
    UNIQUE ("id", "studentId"),
  CONSTRAINT "game_interruption_completion_evidence_level_valid"
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
  CONSTRAINT "game_interruption_completion_evidence_policy_valid"
    CHECK (length(trim("policyVersion")) BETWEEN 1 AND 40),
  CONSTRAINT "game_interruption_completion_evidence_event_count_valid"
    CHECK ("appliedEventCount" >= 0),
  CONSTRAINT "game_interruption_completion_evidence_score_valid"
    CHECK (
      "baseScore" >= 75 AND "baseScore" <= 100
      AND "scoreDeduction" >= 0
      AND "finalScore" >= 75 AND "finalScore" <= 100
      AND "baseScore" - "scoreDeduction" = "finalScore"
    ),
  CONSTRAINT "game_interruption_completion_evidence_xp_valid"
    CHECK (
      "grossCompletionXp" >= 0
      AND "xpDeduction" >= 0
      AND "netCompletionXp" >= 0
      AND "grossCompletionXp" - "xpDeduction" = "netCompletionXp"
    )
);

-- sequelize.sync() runs before registered SQL migrations. Bring an
-- already-created model table to the exact forward-only contract without
-- normalizing or fabricating evidence. Refuse incompatible types instead of
-- coercing existing calculation evidence (which could lose precision).
DO $completion_evidence_column_types$
DECLARE
  incompatible_column TEXT;
BEGIN
  SELECT expected.column_name
    INTO incompatible_column
  FROM (
    VALUES
      ('id', 'integer'),
      ('studentId', 'integer'),
      ('classroomId', 'integer'),
      ('levelKey', 'character varying(64)'),
      ('policyVersion', 'character varying(40)'),
      ('appliedEventCount', 'integer'),
      ('baseScore', 'numeric(5,2)'),
      ('scoreDeduction', 'numeric(5,2)'),
      ('finalScore', 'numeric(5,2)'),
      ('grossCompletionXp', 'integer'),
      ('xpDeduction', 'integer'),
      ('netCompletionXp', 'integer'),
      ('completedAt', 'timestamp with time zone'),
      ('createdAt', 'timestamp with time zone')
  ) AS expected(column_name, data_type)
  LEFT JOIN pg_attribute attribute
    ON attribute.attrelid = 'public."GameInterruptionCompletionEvidence"'::regclass
    AND attribute.attname = expected.column_name
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
  WHERE attribute.attname IS NULL
    OR format_type(attribute.atttypid, attribute.atttypmod) <> expected.data_type
  ORDER BY expected.column_name
  LIMIT 1;

  IF incompatible_column IS NOT NULL THEN
    RAISE EXCEPTION
      'GameInterruptionCompletionEvidence has a missing or incompatible type for column %',
      incompatible_column;
  END IF;
END
$completion_evidence_column_types$;

ALTER TABLE "GameInterruptionCompletionEvidence"
  ALTER COLUMN "studentId" SET NOT NULL,
  ALTER COLUMN "classroomId" SET NOT NULL,
  ALTER COLUMN "levelKey" SET NOT NULL,
  ALTER COLUMN "policyVersion" SET NOT NULL,
  ALTER COLUMN "appliedEventCount" SET NOT NULL,
  ALTER COLUMN "baseScore" SET NOT NULL,
  ALTER COLUMN "scoreDeduction" SET NOT NULL,
  ALTER COLUMN "finalScore" SET NOT NULL,
  ALTER COLUMN "grossCompletionXp" SET NOT NULL,
  ALTER COLUMN "xpDeduction" SET NOT NULL,
  ALTER COLUMN "netCompletionXp" SET NOT NULL,
  ALTER COLUMN "completedAt" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT NOW(),
  ALTER COLUMN "createdAt" SET NOT NULL;

DO $completion_evidence_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_completion_evidence_student_fk'
      AND conrelid = 'public."GameInterruptionCompletionEvidence"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionCompletionEvidence"
      ADD CONSTRAINT "game_interruption_completion_evidence_student_fk"
      FOREIGN KEY ("studentId") REFERENCES "Users"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_completion_evidence_classroom_fk'
      AND conrelid = 'public."GameInterruptionCompletionEvidence"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionCompletionEvidence"
      ADD CONSTRAINT "game_interruption_completion_evidence_classroom_fk"
      FOREIGN KEY ("classroomId") REFERENCES "Classrooms"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_completion_evidence_level_valid'
      AND conrelid = 'public."GameInterruptionCompletionEvidence"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionCompletionEvidence"
      ADD CONSTRAINT "game_interruption_completion_evidence_level_valid"
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
    WHERE conname = 'game_interruption_completion_evidence_policy_valid'
      AND conrelid = 'public."GameInterruptionCompletionEvidence"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionCompletionEvidence"
      ADD CONSTRAINT "game_interruption_completion_evidence_policy_valid"
      CHECK (length(trim("policyVersion")) BETWEEN 1 AND 40);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_completion_evidence_event_count_valid'
      AND conrelid = 'public."GameInterruptionCompletionEvidence"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionCompletionEvidence"
      ADD CONSTRAINT "game_interruption_completion_evidence_event_count_valid"
      CHECK ("appliedEventCount" >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_completion_evidence_score_valid'
      AND conrelid = 'public."GameInterruptionCompletionEvidence"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionCompletionEvidence"
      ADD CONSTRAINT "game_interruption_completion_evidence_score_valid"
      CHECK (
        "baseScore" >= 75 AND "baseScore" <= 100
        AND "scoreDeduction" >= 0
        AND "finalScore" >= 75 AND "finalScore" <= 100
        AND "baseScore" - "scoreDeduction" = "finalScore"
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_completion_evidence_xp_valid'
      AND conrelid = 'public."GameInterruptionCompletionEvidence"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionCompletionEvidence"
      ADD CONSTRAINT "game_interruption_completion_evidence_xp_valid"
      CHECK (
        "grossCompletionXp" >= 0
        AND "xpDeduction" >= 0
        AND "netCompletionXp" >= 0
        AND "grossCompletionXp" - "xpDeduction" = "netCompletionXp"
      );
  END IF;
END
$completion_evidence_constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS "game_interruption_completion_evidence_student_level"
  ON "GameInterruptionCompletionEvidence" ("studentId", "levelKey");
CREATE UNIQUE INDEX IF NOT EXISTS "game_interruption_completion_evidence_id_student"
  ON "GameInterruptionCompletionEvidence" ("id", "studentId");

ALTER TABLE "GameInterruptionEvents"
  ADD COLUMN IF NOT EXISTS "completionEvidenceId" INTEGER;
ALTER TABLE "XpTransactions"
  ADD COLUMN IF NOT EXISTS "completionEvidenceId" INTEGER;

DO $completion_evidence_links$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_events_completion_evidence_fk'
      AND conrelid = 'public."GameInterruptionEvents"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionEvents"
      ADD CONSTRAINT "game_interruption_events_completion_evidence_fk"
      FOREIGN KEY ("completionEvidenceId")
      REFERENCES "GameInterruptionCompletionEvidence"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'game_interruption_events_evidence_application_valid'
      AND conrelid = 'public."GameInterruptionEvents"'::regclass
  ) THEN
    ALTER TABLE "GameInterruptionEvents"
      ADD CONSTRAINT "game_interruption_events_evidence_application_valid"
      CHECK (
        ("appliedAt" IS NULL
          AND "appliedScoreDeduction" IS NULL
          AND "appliedXpDeduction" IS NULL
          AND "completionEvidenceId" IS NULL)
        OR
        ("appliedAt" IS NOT NULL
          AND "appliedScoreDeduction" IS NOT NULL
          AND "appliedXpDeduction" IS NOT NULL
          AND "completionEvidenceId" IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'xp_transactions_completion_evidence_fk'
      AND conrelid = 'public."XpTransactions"'::regclass
  ) THEN
    ALTER TABLE "XpTransactions"
      ADD CONSTRAINT "xp_transactions_completion_evidence_fk"
      FOREIGN KEY ("completionEvidenceId")
      REFERENCES "GameInterruptionCompletionEvidence"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'xp_transactions_completion_evidence_reward_valid'
      AND conrelid = 'public."XpTransactions"'::regclass
  ) THEN
    ALTER TABLE "XpTransactions"
      ADD CONSTRAINT "xp_transactions_completion_evidence_reward_valid"
      CHECK (
        "completionEvidenceId" IS NULL
        OR ("kind" = 'level_completion' AND "referenceType" = 'level' AND "amount" > 0)
      );
  END IF;
END
$completion_evidence_links$;

CREATE INDEX IF NOT EXISTS "game_interruption_events_completion_evidence"
  ON "GameInterruptionEvents" ("completionEvidenceId")
  WHERE "completionEvidenceId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "xp_transactions_completion_evidence"
  ON "XpTransactions" ("completionEvidenceId")
  WHERE "completionEvidenceId" IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_game_interruption_completion_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Game interruption completion evidence is immutable';
END;
$$;

DROP TRIGGER IF EXISTS "game_interruption_completion_evidence_immutable"
  ON "GameInterruptionCompletionEvidence";
CREATE TRIGGER "game_interruption_completion_evidence_immutable"
  BEFORE UPDATE OR DELETE ON "GameInterruptionCompletionEvidence"
  FOR EACH ROW EXECUTE FUNCTION prevent_game_interruption_completion_evidence_mutation();

CREATE OR REPLACE FUNCTION validate_game_interruption_event_completion_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  evidence_student INTEGER;
  evidence_classroom INTEGER;
  evidence_level VARCHAR(64);
  session_student INTEGER;
  session_classroom INTEGER;
  session_level VARCHAR(64);
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."completionEvidenceId" IS NOT NULL THEN
      RAISE EXCEPTION 'Applied interruption event evidence is immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."completionEvidenceId" IS NOT NULL
    AND ROW(
      NEW."sessionId", NEW."studentId", NEW."eventKey", NEW."eventType",
      NEW."receivedAt", NEW."completionEvidenceId", NEW."appliedAt",
      NEW."appliedScoreDeduction", NEW."appliedXpDeduction"
    ) IS DISTINCT FROM ROW(
      OLD."sessionId", OLD."studentId", OLD."eventKey", OLD."eventType",
      OLD."receivedAt", OLD."completionEvidenceId", OLD."appliedAt",
      OLD."appliedScoreDeduction", OLD."appliedXpDeduction"
    ) THEN
    RAISE EXCEPTION 'Applied interruption event evidence is immutable';
  END IF;

  IF NEW."completionEvidenceId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "studentId", "classroomId", "levelKey"
    INTO evidence_student, evidence_classroom, evidence_level
  FROM "GameInterruptionCompletionEvidence"
  WHERE "id" = NEW."completionEvidenceId";

  SELECT "studentId", "classroomId", "levelKey"
    INTO session_student, session_classroom, session_level
  FROM "GameInterruptionSessions"
  WHERE "id" = NEW."sessionId";

  IF evidence_student IS NULL OR session_student IS NULL
    OR NEW."studentId" <> evidence_student
    OR NEW."studentId" <> session_student
    OR evidence_classroom <> session_classroom
    OR evidence_level <> session_level THEN
    RAISE EXCEPTION 'Interruption event completion evidence does not match its student, classroom, and level';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "game_interruption_events_validate_completion_evidence"
  ON "GameInterruptionEvents";
CREATE TRIGGER "game_interruption_events_validate_completion_evidence"
  BEFORE INSERT OR UPDATE OR DELETE ON "GameInterruptionEvents"
  FOR EACH ROW EXECUTE FUNCTION validate_game_interruption_event_completion_evidence();

CREATE OR REPLACE FUNCTION protect_game_interruption_session_evidence_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(NEW."studentId", NEW."classroomId", NEW."levelKey")
    IS DISTINCT FROM ROW(OLD."studentId", OLD."classroomId", OLD."levelKey")
    AND EXISTS (
      SELECT 1
      FROM "GameInterruptionEvents"
      WHERE "sessionId" = OLD."id" AND "completionEvidenceId" IS NOT NULL
    ) THEN
    RAISE EXCEPTION 'Interruption session scope linked to completion evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "game_interruption_sessions_protect_evidence_scope"
  ON "GameInterruptionSessions";
CREATE TRIGGER "game_interruption_sessions_protect_evidence_scope"
  BEFORE UPDATE ON "GameInterruptionSessions"
  FOR EACH ROW EXECUTE FUNCTION protect_game_interruption_session_evidence_scope();

CREATE OR REPLACE FUNCTION validate_xp_transaction_completion_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  evidence_student INTEGER;
  evidence_level VARCHAR(64);
  evidence_net_xp INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."completionEvidenceId" IS NOT NULL THEN
      RAISE EXCEPTION 'Evidence-linked XP transaction is immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."completionEvidenceId" IS NOT NULL
    AND ROW(
      NEW."userId", NEW."amount", NEW."kind", NEW."referenceType",
      NEW."referenceId", NEW."completionEvidenceId"
    ) IS DISTINCT FROM ROW(
      OLD."userId", OLD."amount", OLD."kind", OLD."referenceType",
      OLD."referenceId", OLD."completionEvidenceId"
    ) THEN
    RAISE EXCEPTION 'Evidence-linked XP transaction is immutable';
  END IF;

  IF NEW."completionEvidenceId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "studentId", "levelKey", "netCompletionXp"
    INTO evidence_student, evidence_level, evidence_net_xp
  FROM "GameInterruptionCompletionEvidence"
  WHERE "id" = NEW."completionEvidenceId";

  IF evidence_student IS NULL
    OR NEW."userId" <> evidence_student
    OR NEW."kind" <> 'level_completion'
    OR NEW."referenceType" <> 'level'
    OR NEW."referenceId" <> evidence_level
    OR NEW."amount" <> evidence_net_xp
    OR evidence_net_xp <= 0 THEN
    RAISE EXCEPTION 'XP transaction completion evidence does not match its student or level-completion reward';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "xp_transactions_validate_completion_evidence"
  ON "XpTransactions";
CREATE TRIGGER "xp_transactions_validate_completion_evidence"
  BEFORE INSERT OR UPDATE OR DELETE ON "XpTransactions"
  FOR EACH ROW EXECUTE FUNCTION validate_xp_transaction_completion_evidence();

ALTER TABLE "GameInterruptionCompletionEvidence" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "GameInterruptionCompletionEvidence" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SEQUENCE "GameInterruptionCompletionEvidence_id_seq" FROM PUBLIC;

DO $completion_evidence_privileges$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE %I FROM %I',
        'GameInterruptionCompletionEvidence', role_name
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE %I FROM %I',
        'GameInterruptionCompletionEvidence_id_seq', role_name
      );
    END IF;
  END LOOP;
END
$completion_evidence_privileges$;

COMMIT;
