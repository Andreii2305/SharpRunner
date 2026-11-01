const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { Client } = require("pg");
const {
  emitWorkerCompletionAcknowledgement,
  runPostgresWorker,
} = require("./support/postgresWorkerHarness");

const DATABASE_ENV = "GAME_INTERRUPTION_UPGRADE_DATABASE_URL";
const OPT_IN_ENV = "RUN_GAME_INTERRUPTION_UPGRADE_POSTGRES";
const WORKER_ENV = "GAME_INTERRUPTION_UPGRADE_WORKER";
const WORKER_SUITE_ID = "game-interruption-upgrade-path";
const WORKER_SCENARIO_IDS = Object.freeze([
  "historical-fixtures-fingerprinted",
  "phase7g-upgrade-preserves-history",
  "legacy-completion-remains-evidence-free",
  "migration-rerun-is-idempotent",
]);
const EXPECTED_DATABASE = "sharprunner_phase7g_upgrade_rehearsal_test";
const EXPECTED_ROLE = "sharprunner_phase7g_upgrade_owner";
const EXPECTED_MARKER = "SharpRunner disposable Phase 7G upgrade and privilege rehearsal";
const LOOPBACK_URL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const LOOPBACK_SERVER_ADDRESSES = new Set(["127.0.0.1", "::1"]);

const HISTORICAL_MIGRATIONS = Object.freeze([
  "000_schema_baseline",
  "001_legacy_schema_upgrade",
  "20260812000000_enable_rls_for_backend_tables",
  "20260819000000_protect_all_backend_tables",
  "20260822000000_panel_system_recommendations",
  "20260822120000_detailed_hint_purchases",
  "20260826000000_admin_governance",
  "20260827000000_password_reset_tokens",
  "20260905000000_level_timing_and_deadlines",
  "20260913000000_policy_acceptance",
  "20260914000000_situational_hints",
  "20260917000000_lesson_builder",
  "20260918000000_teacher_analytics_scope",
  "20260921000000_learning_analytics_events",
  "20260922000000_hint_purchase_event_cost",
  "20260925000000_lesson_assessments",
  "20261001000000_coding_assessments",
  "20261001010000_coding_reference_solution",
  "20261001020000_assessment_grading_lease",
  "20261002000000_coding_execution_modes",
  "20261003000000_method_parameter_names",
  "20261003010000_historical_assessment_baseline_status",
  "20261016000000_assessment_attempt_grants",
  "20261017000000_custom_lesson_assessment_foundation",
  "20261018000000_custom_lesson_lifecycle",
  "20261019000000_custom_lesson_pre_access_policy",
  "20261020000000_enable_guarded_custom_assessment_publication",
  "20261022000000_classroom_membership_requested_at",
  "20261023000000_attachment_scan_status_compatibility",
  "20261025000000_teacher_student_check_ins",
  "20261026000000_student_classroom_feedback",
]);
const PHASE_7G_MIGRATIONS = Object.freeze([
  "20261029000000_game_interruption_deduction_settings",
  "20261030000000_game_interruption_history",
  "20261031000000_game_interruption_completion_evidence",
  "20261031120000_game_interruption_report_index",
]);
const CURRENT_MIGRATIONS = Object.freeze([...HISTORICAL_MIGRATIONS, ...PHASE_7G_MIGRATIONS]);
const FIXTURE = Object.freeze({
  teacherUsername: "phase7g_upgrade_teacher",
  teacherEmail: "phase7g_upgrade_teacher@invalid.example",
  studentUsername: "phase7g_upgrade_student",
  studentEmail: "phase7g_upgrade_student@invalid.example",
  classCode: "P7GUPGRADE",
  completedAt: "2026-10-20T08:30:00.000Z",
  createdAt: "2026-10-20T08:00:00.000Z",
});

const validateConfiguredTarget = (databaseUrl) => {
  assert.equal(typeof databaseUrl, "string");
  const target = new URL(databaseUrl);
  assert.ok(LOOPBACK_URL_HOSTS.has(target.hostname), "upgrade rehearsal requires literal loopback");
  assert.equal(target.pathname.replace(/^\//u, ""), EXPECTED_DATABASE);
  assert.notEqual(target.pathname.replace(/^\//u, ""), "sharprunner_browser_test");
  return target;
};

const assertVerifiedTargetIdentity = (identity) => {
  assert.deepEqual(identity, {
    database: EXPECTED_DATABASE,
    address: identity?.address,
    role: EXPECTED_ROLE,
    owner: EXPECTED_ROLE,
    marker: EXPECTED_MARKER,
    superuser: false,
    createDatabase: false,
    createRole: false,
    bypassRls: false,
    inherit: false,
    membershipCount: 0,
  });
  assert.ok(LOOPBACK_SERVER_ADDRESSES.has(identity.address));
};

const historicalSchemaFixture = (overrides = {}) => ({
  users: true,
  classrooms: true,
  memberships: true,
  settings: true,
  progress: true,
  analytics: true,
  xpTransactions: true,
  requiredHistoricalColumns: true,
  interruptionSessions: false,
  interruptionEvents: false,
  completionEvidence: false,
  scoreDeductionColumn: false,
  xpDeductionColumn: false,
  xpEvidenceColumn: false,
  ...overrides,
});

const assertHistoricalState = ({ migrationNames, schema }) => {
  assert.deepEqual(migrationNames, HISTORICAL_MIGRATIONS);
  assert.deepEqual(schema, historicalSchemaFixture());
};

test("upgrade rehearsal URL guard accepts only the exact loopback database", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    assert.doesNotThrow(() => validateConfiguredTarget(
      `postgresql://rehearsal.invalid@${host}:5432/${EXPECTED_DATABASE}`,
    ));
  }
  assert.throws(() => validateConfiguredTarget(
    `postgresql://rehearsal.invalid@10.0.0.5:5432/${EXPECTED_DATABASE}`,
  ));
  assert.throws(() => validateConfiguredTarget(
    "postgresql://rehearsal.invalid@127.0.0.1:5432/sharprunner_browser_test",
  ));
});

test("upgrade rehearsal identity and historical-state guards fail closed", () => {
  const identity = {
    database: EXPECTED_DATABASE,
    address: "127.0.0.1",
    role: EXPECTED_ROLE,
    owner: EXPECTED_ROLE,
    marker: EXPECTED_MARKER,
    superuser: false,
    createDatabase: false,
    createRole: false,
    bypassRls: false,
    inherit: false,
    membershipCount: 0,
  };
  assert.doesNotThrow(() => assertVerifiedTargetIdentity(identity));
  assert.doesNotThrow(() => assertVerifiedTargetIdentity({ ...identity, address: "::1" }));
  for (const substitution of [
    { database: "sharprunner_browser_test" }, { address: null }, { address: "127.0.0.1/32" },
    { role: "postgres" }, { owner: "postgres" }, { marker: "unexpected" },
    { superuser: true }, { createDatabase: true }, { createRole: true },
    { bypassRls: true }, { inherit: true },
    { membershipCount: 1 },
  ]) {
    assert.throws(() => assertVerifiedTargetIdentity({ ...identity, ...substitution }));
  }
  assert.throws(() => assertVerifiedTargetIdentity({}));
  assert.doesNotThrow(() => assertHistoricalState({
    migrationNames: HISTORICAL_MIGRATIONS,
    schema: historicalSchemaFixture(),
  }));
  assert.throws(() => assertHistoricalState({
    migrationNames: [...HISTORICAL_MIGRATIONS, PHASE_7G_MIGRATIONS[0]],
    schema: historicalSchemaFixture(),
  }));
  assert.throws(() => assertHistoricalState({
    migrationNames: HISTORICAL_MIGRATIONS,
    schema: historicalSchemaFixture({ interruptionSessions: true }),
  }));
});

const queryTargetIdentity = async (client) => {
  const result = await client.query(`
    SELECT current_database() AS database,
           host(inet_server_addr()) AS address,
           current_user AS role,
           pg_get_userbyid(database_owner.datdba) AS owner,
           shobj_description(database_owner.oid, 'pg_database') AS marker,
           role.rolsuper AS superuser,
           role.rolcreatedb AS "createDatabase",
           role.rolcreaterole AS "createRole",
           role.rolbypassrls AS "bypassRls",
           role.rolinherit AS inherit,
           (SELECT COUNT(*)::integer FROM pg_auth_members WHERE member = role.oid) AS "membershipCount"
    FROM pg_database AS database_owner
    JOIN pg_roles AS role ON role.rolname = current_user
    WHERE database_owner.datname = current_database()
  `);
  assert.equal(result.rowCount, 1);
  return result.rows[0];
};

const loadMigrationRows = async (client) => {
  const result = await client.query(`
    SELECT "name", "appliedAt" FROM "SharpRunnerMigrations" ORDER BY "name"
  `);
  return result.rows;
};

const loadHistoricalSchema = async (client) => {
  const result = await client.query(`
    SELECT to_regclass('public."Users"') IS NOT NULL AS users,
           to_regclass('public."Classrooms"') IS NOT NULL AS classrooms,
           to_regclass('public."ClassroomMemberships"') IS NOT NULL AS memberships,
           to_regclass('public."LevelContentOverrides"') IS NOT NULL AS settings,
           to_regclass('public."UserProgresses"') IS NOT NULL AS progress,
           to_regclass('public."LearningAnalyticsEvents"') IS NOT NULL AS analytics,
           to_regclass('public."XpTransactions"') IS NOT NULL AS "xpTransactions",
           (SELECT COUNT(*) = 12 FROM information_schema.columns
             WHERE table_schema = 'public' AND (table_name, column_name) IN (
               ('LevelContentOverrides', 'wrongAttemptDeduction'),
               ('LevelContentOverrides', 'lateDeductionPerDay'), ('UserProgresses', 'finalScore'),
               ('UserProgresses', 'completedAt'), ('UserProgresses', 'xpAwarded'),
               ('UserProgresses', 'xpAwardedAt'), ('LearningAnalyticsEvents', 'dedupeKey'),
               ('LearningAnalyticsEvents', 'occurredAt'), ('LearningAnalyticsEvents', 'score'),
               ('XpTransactions', 'metadata'), ('XpTransactions', 'referenceType'),
               ('XpTransactions', 'referenceId')
             )) AS "requiredHistoricalColumns",
           to_regclass('public."GameInterruptionSessions"') IS NOT NULL AS "interruptionSessions",
           to_regclass('public."GameInterruptionEvents"') IS NOT NULL AS "interruptionEvents",
           to_regclass('public."GameInterruptionCompletionEvidence"') IS NOT NULL AS "completionEvidence",
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
             AND table_name = 'LevelContentOverrides' AND column_name = 'interruptionScoreDeduction')
             AS "scoreDeductionColumn",
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
             AND table_name = 'LevelContentOverrides' AND column_name = 'interruptionXpDeduction')
             AS "xpDeductionColumn",
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
             AND table_name = 'XpTransactions' AND column_name = 'completionEvidenceId')
             AS "xpEvidenceColumn"
  `);
  return result.rows[0];
};

const assertFixtureAbsent = async (client) => {
  const result = await client.query(`
    SELECT (SELECT COUNT(*)::integer FROM "Users" WHERE "username" IN ($1, $2)) AS users,
           (SELECT COUNT(*)::integer FROM "Classrooms" WHERE "classCode" = $3) AS classrooms
  `, [FIXTURE.teacherUsername, FIXTURE.studentUsername, FIXTURE.classCode]);
  assert.deepEqual(result.rows[0], { users: 0, classrooms: 0 },
    "the one-shot rehearsal requires an untouched historical fixture state");
};

const verifyTargetBeforeMutation = async (databaseUrl) => {
  validateConfiguredTarget(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    assertVerifiedTargetIdentity(await queryTargetIdentity(client));
    const migrationRows = await loadMigrationRows(client);
    assertHistoricalState({
      migrationNames: migrationRows.map(({ name }) => name),
      schema: await loadHistoricalSchema(client),
    });
    await assertFixtureAbsent(client);
    return client;
  } catch (error) {
    await client.end();
    throw error;
  }
};

const normalizeValue = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeValue(item)]));
  }
  return value;
};

const insertHistoricalFixtures = async (client) => {
  const timestamp = new Date(FIXTURE.createdAt);
  const completedAt = new Date(FIXTURE.completedAt);
  await client.query("BEGIN");
  try {
    const teacher = await client.query(`
      INSERT INTO "Users" ("firstName", "lastName", "username", "email", "emailVerifiedAt",
        "authProvider", "role", "status", "tokenVersion", "isPlayingGame", "xpTotal",
        "researchConsent", "createdAt", "updatedAt")
      VALUES ('Upgrade', 'Teacher', $1, $2, $3, 'password', 'teacher', 'active', 0, FALSE, 0,
        FALSE, $3, $3) RETURNING "id"
    `, [FIXTURE.teacherUsername, FIXTURE.teacherEmail, timestamp]);
    const student = await client.query(`
      INSERT INTO "Users" ("firstName", "lastName", "username", "email", "emailVerifiedAt",
        "authProvider", "role", "status", "tokenVersion", "isPlayingGame", "xpTotal",
        "researchConsent", "createdAt", "updatedAt")
      VALUES ('Upgrade', 'Student', $1, $2, $3, 'password', 'student', 'active', 0, FALSE, 25,
        FALSE, $3, $3) RETURNING "id"
    `, [FIXTURE.studentUsername, FIXTURE.studentEmail, timestamp]);
    const teacherId = teacher.rows[0].id;
    const studentId = student.rows[0].id;
    const classroom = await client.query(`
      INSERT INTO "Classrooms" ("teacherId", "className", "section", "schoolYear", "classCode",
        "isActive", "createdAt", "updatedAt")
      VALUES ($1, 'Phase 7G Upgrade', 'A', '2026-2027', $2, TRUE, $3, $3) RETURNING "id"
    `, [teacherId, FIXTURE.classCode, timestamp]);
    const classroomId = classroom.rows[0].id;
    await client.query(`
      INSERT INTO "ClassroomMemberships" ("classroomId", "studentId", "status", "joinedAt",
        "requestedAt", "createdAt", "updatedAt") VALUES ($1, $2, 'active', $3, $3, $3, $3)
    `, [classroomId, studentId, timestamp]);
    await client.query(`
      INSERT INTO "LevelContentOverrides" ("classroomId", "levelKey", "isEnabled", "hintsEnabled",
        "hintUnlockThreshold", "wrongAttemptDeduction", "lateDeductionPerDay", "createdAt", "updatedAt")
      VALUES ($1, 'tutorial-level-1', TRUE, TRUE, 3, 0, 0, $2, $2),
             ($1, 'tutorial-level-2', TRUE, TRUE, 4, 7.25, 2.50, $2, $2)
    `, [classroomId, timestamp]);
    await client.query(`
      INSERT INTO "UserProgresses" ("userId", "levelKey", "lessonTitle", "orderIndex",
        "progressPercent", "isCompleted", "completedAt", "attemptCount", "timeSpentSeconds",
        "finalScore", "startedAt", "hintUsed", "detailedHintUnlocked", "latestFailureMetadata",
        "xpAwarded", "xpAwardedAt", "createdAt", "updatedAt")
      VALUES ($1, 'tutorial-level-1', 'Tutorial Level 1', 1, 100, TRUE, $3, 1, 120, 92, $2,
               FALSE, FALSE, '{}'::jsonb, 25, $3, $2, $3),
             ($1, 'tutorial-level-2', 'Tutorial Level 2', 2, 25, FALSE, NULL, 1, 30, NULL, $2,
               FALSE, FALSE, '{"legacy":"preserved"}'::jsonb, 0, NULL, $2, $2)
    `, [studentId, timestamp, completedAt]);
    const dedupeKey = `level-completed:${crypto.createHash("sha256")
      .update(JSON.stringify([studentId, "tutorial-level-1"])).digest("hex")}`;
    await client.query(`
      INSERT INTO "LearningAnalyticsEvents" ("studentId", "classroomId", "levelKey", "lessonKey",
        "eventType", "occurredAt", "attemptNumber", "score", "dedupeKey", "createdAt")
      VALUES ($1, $2, 'tutorial-level-1', 'tutorial', 'level_completed', $3, 1, 92, $4, $3)
    `, [studentId, classroomId, completedAt, dedupeKey]);
    await client.query(`
      INSERT INTO "XpTransactions" ("userId", "amount", "kind", "referenceType", "referenceId",
        "metadata", "createdAt", "updatedAt")
      VALUES ($1, 25, 'level_completion', 'level', 'tutorial-level-1',
        '{"legacy":true,"gross":25}'::jsonb, $2, $2)
    `, [studentId, completedAt]);
    await client.query("COMMIT");
    return { classroomId, studentId, teacherId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

const loadHistoricalFingerprint = async (client, fixture) => {
  const [settings, progress, analytics, xpTransactions, users] = await Promise.all([
    client.query(`SELECT "id", "classroomId", "levelKey", "isEnabled", "hintsEnabled",
      "hintUnlockThreshold", "wrongAttemptDeduction", "lateDeductionPerDay", "createdAt", "updatedAt"
      FROM "LevelContentOverrides" WHERE "classroomId" = $1 ORDER BY "levelKey"`, [fixture.classroomId]),
    client.query(`SELECT "id", "userId", "levelKey", "progressPercent", "isCompleted", "completedAt",
      "attemptCount", "timeSpentSeconds", "finalScore", "startedAt", "hintUsed",
      "detailedHintUnlocked", "latestFailureMetadata", "xpAwarded", "xpAwardedAt", "createdAt", "updatedAt"
      FROM "UserProgresses" WHERE "userId" = $1 ORDER BY "levelKey"`, [fixture.studentId]),
    client.query(`SELECT "id", "studentId", "classroomId", "levelKey", "lessonKey", "eventType",
      "occurredAt", "attemptNumber", "score", "dedupeKey", "createdAt"
      FROM "LearningAnalyticsEvents" WHERE "studentId" = $1 ORDER BY "id"`, [fixture.studentId]),
    client.query(`SELECT "id", "userId", "amount", "kind", "referenceType", "referenceId", "metadata",
      "createdAt", "updatedAt" FROM "XpTransactions" WHERE "userId" = $1 ORDER BY "id"`, [fixture.studentId]),
    client.query(`SELECT "id", "username", "email", "role", "status", "xpTotal", "createdAt", "updatedAt"
      FROM "Users" WHERE "id" IN ($1, $2) ORDER BY "id"`, [fixture.teacherId, fixture.studentId]),
  ]);
  return normalizeValue({
    analytics: analytics.rows,
    progress: progress.rows,
    settings: settings.rows,
    users: users.rows,
    xpTransactions: xpTransactions.rows,
  });
};

const loadPhaseSchemaSnapshot = async (client) => {
  const [columns, constraints, triggers, indexes, rls] = await Promise.all([
    client.query(`SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name IN ('LevelContentOverrides', 'GameInterruptionSessions',
        'GameInterruptionEvents', 'GameInterruptionCompletionEvidence', 'XpTransactions')
      AND column_name IN ('interruptionScoreDeduction', 'interruptionXpDeduction',
        'completionEvidenceId', 'scoreDeductionSnapshot', 'xpDeductionSnapshot',
        'appliedScoreDeduction', 'appliedXpDeduction', 'appliedAt')
      ORDER BY table_name, column_name`),
    client.query(`SELECT conrelid::regclass::text AS table_name, conname, contype FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace AND conrelid IN (
        'public."GameInterruptionSessions"'::regclass, 'public."GameInterruptionEvents"'::regclass,
        'public."GameInterruptionCompletionEvidence"'::regclass, 'public."XpTransactions"'::regclass)
      ORDER BY table_name, conname`),
    client.query(`SELECT event_object_table AS table_name, trigger_name FROM information_schema.triggers
      WHERE trigger_schema = 'public' AND event_object_table IN ('GameInterruptionSessions',
        'GameInterruptionEvents', 'GameInterruptionCompletionEvidence', 'XpTransactions')
      ORDER BY event_object_table, trigger_name`),
    client.query(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
      AND tablename IN ('GameInterruptionSessions', 'GameInterruptionEvents',
        'GameInterruptionCompletionEvidence', 'XpTransactions') ORDER BY tablename, indexname`),
    client.query(`SELECT relname, relrowsecurity FROM pg_class WHERE oid IN (
        'public."GameInterruptionSessions"'::regclass, 'public."GameInterruptionEvents"'::regclass,
        'public."GameInterruptionCompletionEvidence"'::regclass) ORDER BY relname`),
  ]);
  return normalizeValue({
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    rls: rls.rows,
    triggers: triggers.rows,
  });
};

const assertPhaseSchema = (snapshot) => {
  assert.deepEqual(new Set(snapshot.rls.map(({ relname }) => relname)), new Set([
    "GameInterruptionCompletionEvidence", "GameInterruptionEvents", "GameInterruptionSessions",
  ]));
  assert.ok(snapshot.rls.every(({ relrowsecurity }) => relrowsecurity === true));
  const triggerNames = new Set(snapshot.triggers.map(({ trigger_name: name }) => name));
  for (const name of [
    "game_interruption_completion_evidence_immutable",
    "game_interruption_events_validate_completion_evidence",
    "game_interruption_sessions_protect_evidence_scope",
    "xp_transactions_validate_completion_evidence",
  ]) assert.ok(triggerNames.has(name), `required trigger ${name} must exist`);
  const indexNames = new Set(snapshot.indexes.map(({ indexname }) => indexname));
  for (const name of [
    "game_interruption_sessions_one_current", "game_interruption_events_student_key",
    "game_interruption_completion_evidence_student_level", "xp_transactions_completion_evidence",
    "game_interruption_events_session_history",
  ]) assert.ok(indexNames.has(name), `required index ${name} must exist`);
};

const loadPhaseDataState = async (client, fixture) => {
  const result = await client.query(`SELECT
    (SELECT COUNT(*)::integer FROM "GameInterruptionSessions" WHERE "studentId" = $1) AS sessions,
    (SELECT COUNT(*)::integer FROM "GameInterruptionEvents" WHERE "studentId" = $1) AS events,
    (SELECT COUNT(*)::integer FROM "GameInterruptionCompletionEvidence" WHERE "studentId" = $1) AS evidence,
    (SELECT COUNT(*)::integer FROM "XpTransactions" WHERE "userId" = $1
      AND "completionEvidenceId" IS NOT NULL) AS "linkedXp"`, [fixture.studentId]);
  return result.rows[0];
};

const assertUpgradeDefaultsAndAbsence = async (client, fixture) => {
  const settings = await client.query(`SELECT "levelKey", "wrongAttemptDeduction",
    "lateDeductionPerDay", "interruptionScoreDeduction", "interruptionXpDeduction"
    FROM "LevelContentOverrides" WHERE "classroomId" = $1 ORDER BY "levelKey"`, [fixture.classroomId]);
  assert.deepEqual(settings.rows, [
    { levelKey: "tutorial-level-1", wrongAttemptDeduction: "0.00", lateDeductionPerDay: "0.00",
      interruptionScoreDeduction: "1.00", interruptionXpDeduction: 10 },
    { levelKey: "tutorial-level-2", wrongAttemptDeduction: "7.25", lateDeductionPerDay: "2.50",
      interruptionScoreDeduction: "1.00", interruptionXpDeduction: 10 },
  ]);
  assert.deepEqual(await loadPhaseDataState(client, fixture), {
    sessions: 0, events: 0, evidence: 0, linkedXp: 0,
  });
};

const loadPersistenceFingerprint = async (client, fixture) => normalizeValue({
  historical: await loadHistoricalFingerprint(client, fixture),
  phaseData: await loadPhaseDataState(client, fixture),
  migrations: await loadMigrationRows(client),
});

const redactDiagnostics = (databaseUrl, value) => String(value)
  .replaceAll(databaseUrl, "<redacted-upgrade-database-url>")
  .replace(/postgres(?:ql)?:\/\/[^\s@]+@/giu, "postgresql://<redacted>@");

const registerWorkerTest = (databaseUrl) => {
  // This is intentionally one-shot: fixtures and upgraded schema are retained
  // for review. A later run must fail the historical-state guards rather than
  // resetting, deleting, or disguising the already-upgraded database.
  test("historical Phase 7G upgrade path preserves existing data", async (t) => {
    const client = await verifyTargetBeforeMutation(databaseUrl);
    let database;
    const completedScenarios = [];
    const runScenario = async (id, name, operation) => {
      await t.test(name, async () => {
        await operation();
        completedScenarios.push({ id, status: "passed" });
      });
    };
    try {
      const fixture = await insertHistoricalFixtures(client);
      const beforeFingerprint = await loadHistoricalFingerprint(client, fixture);
      await runScenario(WORKER_SCENARIO_IDS[0],
        "historical fixtures have stable pre-upgrade fingerprints", async () => {
          assert.equal(beforeFingerprint.settings.length, 2);
          assert.equal(beforeFingerprint.progress.length, 2);
          assert.equal(beforeFingerprint.analytics.length, 1);
          assert.equal(beforeFingerprint.xpTransactions.length, 1);
          assert.equal(beforeFingerprint.users.find(({ id }) => id === fixture.studentId).xpTotal, 25);
        });

      // Current schema code is deliberately loaded only after the SQL identity,
      // registry, and historical-schema checks have all passed.
      const migrationService = require("../src/services/migrationService");
      assert.deepEqual(migrationService.migrations.map(([name]) => name), CURRENT_MIGRATIONS);
      await migrationService.runMigrations();
      database = require("../src/config/database");
      const firstMigrationRows = await loadMigrationRows(client);
      const firstSchemaSnapshot = await loadPhaseSchemaSnapshot(client);
      await runScenario(WORKER_SCENARIO_IDS[1],
        "current migrations add Phase 7G without changing historical records", async () => {
          assert.deepEqual(firstMigrationRows.map(({ name }) => name), CURRENT_MIGRATIONS);
          assertPhaseSchema(firstSchemaSnapshot);
          assert.deepEqual(await loadHistoricalFingerprint(client, fixture), beforeFingerprint);
          await assertUpgradeDefaultsAndAbsence(client, fixture);
        });

      const beforeLegacyRetry = await loadPersistenceFingerprint(client, fixture);
      await runScenario(WORKER_SCENARIO_IDS[2],
        "legacy completion retry returns no fabricated deduction evidence", async () => {
          const {
            completeLevelWithInterruptionDeductions,
          } = require("../src/services/gameInterruptionCompletionService");
          const result = await completeLevelWithInterruptionDeductions({
            actorId: fixture.studentId,
            actorRole: "student",
            classroomId: fixture.classroomId,
            classroomWasExplicit: true,
            levelKey: "tutorial-level-1",
            progressPercent: 100,
            completionActionId: "upgrade_legacy_retry",
            completionOccurredAt: new Date("2026-10-21T08:30:00.000Z"),
            interruptionEvents: [],
          });
          assert.equal(result.completedNow, false);
          assert.equal(result.completionDeductions, null);
          assert.deepEqual(await loadPersistenceFingerprint(client, fixture), beforeLegacyRetry);
        });

      await runScenario(WORKER_SCENARIO_IDS[3],
        "second migration run is a no-op for registry data and Phase 7G objects", async () => {
          await migrationService.runMigrations();
          assert.deepEqual(await loadMigrationRows(client), firstMigrationRows);
          assert.deepEqual(await loadHistoricalFingerprint(client, fixture), beforeFingerprint);
          assert.deepEqual(await loadPhaseSchemaSnapshot(client), firstSchemaSnapshot);
          await assertUpgradeDefaultsAndAbsence(client, fixture);
        });
      assert.deepEqual(completedScenarios, WORKER_SCENARIO_IDS.map((id) => ({ id, status: "passed" })));
      emitWorkerCompletionAcknowledgement({ suiteId: WORKER_SUITE_ID, scenarios: completedScenarios });
    } finally {
      if (database) await database.close();
      await client.end();
    }
  });
};

if (process.env[WORKER_ENV] === "1") {
  registerWorkerTest(process.env[DATABASE_ENV]);
} else {
  const configured = process.env[OPT_IN_ENV] === "1" || Boolean(process.env[DATABASE_ENV]);
  const integrationTest = configured ? test : test.skip;
  integrationTest("historical Phase 7G PostgreSQL upgrade rehearsal", async () => {
    assert.equal(process.env[OPT_IN_ENV], "1", `${OPT_IN_ENV}=1 is required`);
    assert.equal(typeof process.env[DATABASE_ENV], "string", `${DATABASE_ENV} is required`);
    const databaseUrl = process.env[DATABASE_ENV];
    validateConfiguredTarget(databaseUrl);
    await runPostgresWorker({
      scriptPath: __filename,
      suiteId: WORKER_SUITE_ID,
      expectedScenarioIds: WORKER_SCENARIO_IDS,
      environment: {
        DATABASE_URL: databaseUrl,
        DB_SSL: "false",
        [DATABASE_ENV]: databaseUrl,
        [OPT_IN_ENV]: "1",
        [WORKER_ENV]: "1",
      },
      redactDiagnostics: (value) => redactDiagnostics(databaseUrl, value),
    });
  });
}
