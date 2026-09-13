BEGIN;

ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "termsVersionAccepted" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "privacyVersionAcknowledged" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "privacyAcknowledgedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "researchConsent" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "researchConsentAt" TIMESTAMPTZ;

UPDATE "Users"
SET "researchConsent" = FALSE,
    "researchConsentAt" = NULL
WHERE "researchConsent" IS NULL;

COMMIT;
