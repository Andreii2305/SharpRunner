-- SharpRunner uses its Express API as the only application data-access layer.
-- Authentication is handled by SharpRunner JWTs and integer user IDs, not by
-- Supabase Auth. Consequently, auth.uid()-based Data API policies would not
-- represent the application's authorization model.
--
-- The backend currently connects as the postgres table owner, which bypasses
-- RLS. Keep that connection string and every privileged database credential on
-- the backend only. The anon and authenticated Supabase Data API roles receive
-- no policies and therefore cannot access these tables.

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
    'ClassroomMemberships',
    'Classrooms',
    'LevelContentOverrides',
    'LevelDeadlines',
    'UserNotificationViews',
    'UserProgresses',
    'Users'
  ]
  LOOP
    -- Make the migration safe for a freshly provisioned database where
    -- Sequelize has not created every model table yet.
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
        table_name
      );

      -- Defense in depth: these are backend-only tables, so the Data API roles
      -- do not need table privileges even if a policy is added accidentally.
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC',
        table_name
      );

      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format(
          'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon',
          table_name
        );
      END IF;

      IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated'
      ) THEN
        EXECUTE format(
          'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated',
          table_name
        );
      END IF;
    END IF;
  END LOOP;
END
$migration$;

COMMIT;
