BEGIN;

CREATE TABLE IF NOT EXISTS "PasswordResetTokens" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "tokenHash" VARCHAR(64) NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id"
  ON "PasswordResetTokens" ("userId");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_at"
  ON "PasswordResetTokens" ("expiresAt");

ALTER TABLE "PasswordResetTokens" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "PasswordResetTokens" FROM PUBLIC;

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON TABLE "PasswordResetTokens" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON TABLE "PasswordResetTokens" FROM authenticated;
  END IF;
END
$migration$;

COMMIT;
