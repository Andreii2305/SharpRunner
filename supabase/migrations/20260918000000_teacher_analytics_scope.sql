-- Classroom identity is part of reusable lesson progress. The previous unique
-- index on (lessonId, studentId) could make a placement in one classroom reuse
-- another classroom's progress row for the same student.
BEGIN;

DROP INDEX IF EXISTS "classroom_lesson_progress_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "classroom_lesson_progress_class_scope"
  ON "ClassroomLessonProgresses" ("classroomId", "lessonId", "studentId");

-- These indexes support the bounded classroom/student/date predicates used by
-- teacher analytics without adding redundant analytics columns or event data.
CREATE INDEX IF NOT EXISTS "user_progress_analytics_scope"
  ON "UserProgresses" ("userId", "levelKey", "updatedAt");

CREATE INDEX IF NOT EXISTS "classroom_lesson_submission_analytics_scope"
  ON "ClassroomLessonSubmissions" ("classroomId", "lessonId", "studentId");

COMMIT;
