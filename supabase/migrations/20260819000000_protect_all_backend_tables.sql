-- Keep every Sequelize-owned table inaccessible through the Supabase Data API.
-- The Express backend connects as the owner and remains the sole data-access layer.
BEGIN;

DO $migration$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'AdminActivityLogs',
    'AdminInvites',
    'ClassroomAnnouncementViews',
    'ClassroomAnnouncements',
    'ClassroomLessonAttachments',
    'ClassroomLessonAudits',
    'ClassroomLessonProgresses',
    'ClassroomLessons',
    'ClassroomLessonSubmissionAttachments',
    'ClassroomLessonSubmissions',
    'ClassroomLessonVersions',
    'ClassroomMemberships',
    'Classrooms',
    'EmailVerificationTokens',
    'LevelContentOverrides',
    'LevelDeadlines',
    'SharpRunnerMigrations',
    'UserNotificationViews',
    'UserProgresses',
    'Users'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', table_name);
      END IF;
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated', table_name);
      END IF;
    END IF;
  END LOOP;
END
$migration$;

COMMIT;
