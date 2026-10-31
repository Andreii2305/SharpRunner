BEGIN;

-- Supports bounded applied-and-unapplied event history reads for a previously
-- authorized session scope. Cross-session ordering can still require a sort.
CREATE INDEX IF NOT EXISTS "game_interruption_events_session_history"
  ON "GameInterruptionEvents" ("sessionId", "receivedAt" DESC, "id" DESC);

COMMIT;
