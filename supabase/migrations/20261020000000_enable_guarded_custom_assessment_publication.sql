BEGIN;

-- Application code keeps publication behind
-- CUSTOM_LESSON_ASSESSMENT_PUBLICATION_ENABLED (default OFF). Removing the
-- dormant-only constraint permits the guarded transaction to publish while
-- retaining all target, revision, ownership, and history constraints added by
-- the preceding custom-assessment migrations.
ALTER TABLE "LessonAssessments"
  DROP CONSTRAINT IF EXISTS "lesson_assessment_custom_publication_dormant";

ALTER TABLE "LessonAssessments"
  ADD CONSTRAINT "lesson_assessment_custom_publication_state"
  CHECK (
    "targetKind" <> 'CLASSROOM_LESSON_PLACEMENT'
    OR (("isPublished" = TRUE) = ("publishedAt" IS NOT NULL))
  );

COMMIT;
