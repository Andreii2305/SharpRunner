-- Record when access evidence became complete for a placement and when a
-- particular custom PRE first became an enforced gate. Existing placements
-- intentionally remain NULL: this migration cannot establish whether older
-- content access occurred and must not invent historical coverage.
BEGIN;

ALTER TABLE "ClassroomLessonPlacements"
  ADD COLUMN IF NOT EXISTS "accessPolicyEstablishedAt" TIMESTAMPTZ;

ALTER TABLE "LessonAssessments"
  ADD COLUMN IF NOT EXISTS "accessGateEstablishedAt" TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION prevent_classroom_lesson_access_policy_timestamp_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD."accessPolicyEstablishedAt" IS DISTINCT FROM NEW."accessPolicyEstablishedAt" THEN
    RAISE EXCEPTION 'Classroom lesson access policy establishment is immutable';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS "classroom_lesson_access_policy_timestamp_immutable"
  ON "ClassroomLessonPlacements";
CREATE TRIGGER "classroom_lesson_access_policy_timestamp_immutable"
  BEFORE UPDATE ON "ClassroomLessonPlacements"
  FOR EACH ROW EXECUTE FUNCTION prevent_classroom_lesson_access_policy_timestamp_change();

CREATE OR REPLACE FUNCTION prevent_custom_pre_access_gate_timestamp_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD."accessGateEstablishedAt" IS NOT NULL
     AND OLD."accessGateEstablishedAt" IS DISTINCT FROM NEW."accessGateEstablishedAt" THEN
    RAISE EXCEPTION 'Custom PRE access gate establishment is immutable';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS "custom_pre_access_gate_timestamp_immutable"
  ON "LessonAssessments";
CREATE TRIGGER "custom_pre_access_gate_timestamp_immutable"
  BEFORE UPDATE ON "LessonAssessments"
  FOR EACH ROW EXECUTE FUNCTION prevent_custom_pre_access_gate_timestamp_change();

COMMIT;
