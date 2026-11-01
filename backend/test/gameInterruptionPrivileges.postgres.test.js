const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { Client } = require("pg");
const {
  emitWorkerCompletionAcknowledgement,
  runPostgresWorker,
} = require("./support/postgresWorkerHarness");

const OPT_IN_ENV = "RUN_GAME_INTERRUPTION_PRIVILEGES_POSTGRES";
const OWNER_DATABASE_ENV = "GAME_INTERRUPTION_PRIVILEGE_OWNER_DATABASE_URL";
const PROBE_DATABASE_ENV = "GAME_INTERRUPTION_PRIVILEGE_PROBE_DATABASE_URL";
const WORKER_ENV = "GAME_INTERRUPTION_PRIVILEGES_WORKER";
const WORKER_SUITE_ID = "game-interruption-privileges";
const WORKER_SCENARIO_IDS = Object.freeze([
  "acl-denial-before-grants",
  "sessions-rls-enforcement",
  "events-rls-enforcement",
  "completion-evidence-rls-enforcement",
  "temporary-grants-revoked",
]);
const EXPECTED_DATABASE = "sharprunner_phase7g_upgrade_rehearsal_test";
const EXPECTED_OWNER_ROLE = "sharprunner_phase7g_upgrade_owner";
const EXPECTED_PROBE_ROLE = "sharprunner_phase7g_privilege_probe";
const EXPECTED_MARKER = "SharpRunner disposable Phase 7G upgrade and privilege rehearsal";
const LOOPBACK_URL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const LOOPBACK_SERVER_ADDRESSES = new Set(["127.0.0.1", "::1"]);
const PROTECTED_TABLES = Object.freeze([
  "GameInterruptionSessions",
  "GameInterruptionEvents",
  "GameInterruptionCompletionEvidence",
]);
const PROTECTED_SEQUENCES = Object.freeze([
  "GameInterruptionSessions_id_seq",
  "GameInterruptionEvents_id_seq",
  "GameInterruptionCompletionEvidence_id_seq",
]);
const TABLE_PRIVILEGES = Object.freeze([
  "SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER",
]);
const SEQUENCE_PRIVILEGES = Object.freeze(["SELECT", "USAGE", "UPDATE"]);

const validateConfiguredTarget = (databaseUrl) => {
  assert.equal(typeof databaseUrl, "string");
  const target = new URL(databaseUrl);
  assert.ok(LOOPBACK_URL_HOSTS.has(target.hostname), "privilege rehearsal requires literal loopback");
  assert.equal(target.pathname.replace(/^\//u, ""), EXPECTED_DATABASE);
  return target;
};

const assertLaunchConfiguration = ({ optIn, ownerUrl, probeUrl }) => {
  assert.equal(optIn, "1", `${OPT_IN_ENV}=1 is required`);
  validateConfiguredTarget(ownerUrl);
  validateConfiguredTarget(probeUrl);
  assert.notEqual(ownerUrl, probeUrl, "owner and probe connections must be distinct");
};

const verifiedIdentity = (role, address = "127.0.0.1") => ({
  database: EXPECTED_DATABASE,
  address,
  role,
  owner: EXPECTED_OWNER_ROLE,
  marker: EXPECTED_MARKER,
  superuser: false,
  createDatabase: false,
  createRole: false,
  bypassRls: false,
  inherit: false,
  membershipCount: 0,
});

const assertVerifiedIdentity = (identity, expectedRole) => {
  assert.deepEqual(identity, verifiedIdentity(expectedRole, identity?.address));
  assert.ok(LOOPBACK_SERVER_ADDRESSES.has(identity.address));
};

const assertSqlState = (error, expectedCode) => {
  assert.equal(error?.code, expectedCode);
};

const assertRlsViolation = (error, table = null) => {
  assertSqlState(error, "42501");
  assert.match(String(error?.message), /new row violates row-level security policy/u);
  if (table) assert.match(String(error?.message), new RegExp(`"?${table}"?`, "u"));
};

test("privilege rehearsal URL and launch guards require both exact connections", () => {
  const ownerUrl = "postgresql://owner.invalid@127.0.0.1:5432/sharprunner_phase7g_upgrade_rehearsal_test";
  const probeUrl = "postgresql://probe.invalid@[::1]:5432/sharprunner_phase7g_upgrade_rehearsal_test";

  assert.doesNotThrow(() => assertLaunchConfiguration({
    optIn: "1",
    ownerUrl,
    probeUrl,
  }));
  assert.throws(() => assertLaunchConfiguration({ optIn: "1", ownerUrl }));
  assert.throws(() => assertLaunchConfiguration({ optIn: "1", probeUrl }));
  assert.throws(() => assertLaunchConfiguration({ ownerUrl, probeUrl }));
  assert.throws(() => validateConfiguredTarget(
    "postgresql://owner.invalid@10.0.0.5:5432/sharprunner_phase7g_upgrade_rehearsal_test",
  ));
});

test("privilege rehearsal SQL identity guard rejects substituted or privileged roles", () => {
  const identity = verifiedIdentity("sharprunner_phase7g_upgrade_owner");
  assert.doesNotThrow(() => assertVerifiedIdentity(identity, "sharprunner_phase7g_upgrade_owner"));
  assert.doesNotThrow(() => assertVerifiedIdentity(
    verifiedIdentity("sharprunner_phase7g_privilege_probe", "::1"),
    "sharprunner_phase7g_privilege_probe",
  ));
  for (const substitution of [
    { address: "127.0.0.1/32" },
    { database: "sharprunner_browser_test" },
    { owner: "postgres" },
    { superuser: true },
    { membershipCount: 1 },
  ]) {
    assert.throws(() => assertVerifiedIdentity(
      { ...identity, ...substitution },
      "sharprunner_phase7g_upgrade_owner",
    ));
  }
});

test("privilege rehearsal distinguishes ACL denial from an RLS insert denial", () => {
  assert.doesNotThrow(() => assertSqlState({ code: "42501" }, "42501"));
  assert.throws(() => assertSqlState({ code: "23503" }, "42501"));
  assert.doesNotThrow(() => assertRlsViolation({
    code: "42501",
    message: "new row violates row-level security policy for table GameInterruptionSessions",
  }, "GameInterruptionSessions"));
  assert.throws(() => assertRlsViolation({ code: "42501", message: "permission denied" }));
});

test("each protected table has an explicit-ID RLS probe independent of sequence access", () => {
  const fixture = {
    classroom: { id: 31 },
    evidence: {
      appliedEventCount: 1,
      baseScore: "100.00",
      completedAt: new Date("2026-10-30T10:00:00.000Z"),
      finalScore: "99.00",
      grossCompletionXp: 100,
      netCompletionXp: 90,
      policyVersion: "game-interruption-deduction/v1",
      scoreDeduction: "1.00",
      xpDeduction: 10,
    },
    session: { id: 41 },
    student: { id: 51 },
    suffix: "explicitprobe1234",
  };
  for (const [index, table] of PROTECTED_TABLES.entries()) {
    const probe = buildExplicitInsertProbe(table, fixture, 1000 + index);
    assert.equal(probe.table, table);
    assert.equal(probe.values[0], 1000 + index);
    assert.doesNotMatch(probe.sql, /nextval/iu);
    assert.match(probe.sql, new RegExp(`INSERT INTO "${table}"`, "u"));
  }
  assert.throws(() => buildExplicitInsertProbe("Users", fixture, 2000));
});

const buildExplicitInsertProbe = (table, fixture, id) => {
  assert.ok(Number.isSafeInteger(id) && id > 0);
  const now = new Date();
  if (table === "GameInterruptionSessions") {
    return {
      table,
      sql: `INSERT INTO "GameInterruptionSessions" (
        "id", "studentId", "classroomId", "levelKey", "sessionKey",
        "scoreDeductionSnapshot", "xpDeductionSnapshot", "lifecycleStatus",
        "startedAt", "supersededAt", "completedAt", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, 'tutorial-level-1', $4, 1.00, 10, 'SUPERSEDED',
        $5, $5, NULL, $5, $5)`,
      values: [id, fixture.student.id, fixture.classroom.id, `priv_probe_session_${fixture.suffix}`, now],
    };
  }
  if (table === "GameInterruptionEvents") {
    return {
      table,
      sql: `INSERT INTO "GameInterruptionEvents" (
        "id", "sessionId", "studentId", "eventKey", "eventType", "receivedAt",
        "appliedAt", "appliedScoreDeduction", "appliedXpDeduction",
        "completionEvidenceId", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, 'hidden', $5, NULL, NULL, NULL, NULL, $5, $5)`,
      values: [id, fixture.session.id, fixture.student.id, `priv_probe_event_${fixture.suffix}`, now],
    };
  }
  if (table === "GameInterruptionCompletionEvidence") {
    const evidence = fixture.evidence;
    return {
      table,
      sql: `INSERT INTO "GameInterruptionCompletionEvidence" (
        "id", "studentId", "classroomId", "levelKey", "policyVersion", "appliedEventCount",
        "baseScore", "scoreDeduction", "finalScore", "grossCompletionXp", "xpDeduction",
        "netCompletionXp", "completedAt", "createdAt"
      ) VALUES ($1, $2, $3, 'tutorial-level-2', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      values: [
        id,
        fixture.student.id,
        fixture.classroom.id,
        evidence.policyVersion,
        evidence.appliedEventCount,
        evidence.baseScore,
        evidence.scoreDeduction,
        evidence.finalScore,
        evidence.grossCompletionXp,
        evidence.xpDeduction,
        evidence.netCompletionXp,
        evidence.completedAt,
        now,
      ],
    };
  }
  throw new TypeError("Unsupported protected table");
};

const queryIdentity = async (client) => {
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

const assertRegisteredSchema = async (ownerClient) => {
  const { migrations } = require("../src/services/migrationService");
  const registeredNames = migrations.map(([name]) => name);
  assert.equal(registeredNames.length, 35);
  const applied = await ownerClient.query(`
    SELECT "name" FROM "SharpRunnerMigrations" ORDER BY "name"
  `);
  assert.deepEqual(
    applied.rows.map(({ name }) => name),
    [...registeredNames].sort(),
    "the privilege rehearsal requires the complete registered schema",
  );

  const objects = await ownerClient.query(`
    SELECT to_regclass('public."GameInterruptionSessions"') IS NOT NULL AS sessions,
           to_regclass('public."GameInterruptionEvents"') IS NOT NULL AS events,
           to_regclass('public."GameInterruptionCompletionEvidence"') IS NOT NULL AS evidence,
           to_regclass('public."GameInterruptionSessions_id_seq"') IS NOT NULL AS session_sequence,
           to_regclass('public."GameInterruptionEvents_id_seq"') IS NOT NULL AS event_sequence,
           to_regclass('public."GameInterruptionCompletionEvidence_id_seq"') IS NOT NULL
             AS evidence_sequence
  `);
  assert.deepEqual(objects.rows[0], {
    sessions: true,
    events: true,
    evidence: true,
    session_sequence: true,
    event_sequence: true,
    evidence_sequence: true,
  });

  const rls = await ownerClient.query(`
    SELECT relname, relrowsecurity, relforcerowsecurity
    FROM pg_class
    WHERE oid IN (
      'public."GameInterruptionSessions"'::regclass,
      'public."GameInterruptionEvents"'::regclass,
      'public."GameInterruptionCompletionEvidence"'::regclass
    )
    ORDER BY relname
  `);
  assert.deepEqual(rls.rows, PROTECTED_TABLES.slice().sort().map((relname) => ({
    relname,
    relrowsecurity: true,
    relforcerowsecurity: false,
  })));
  const policies = await ownerClient.query(`
    SELECT COUNT(*)::integer AS count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY($1::text[])
  `, [PROTECTED_TABLES]);
  assert.equal(policies.rows[0].count, 0,
    "no RLS policy may permit the privilege probe's SELECT or INSERT");
};

const connectVerifiedClients = async ({ ownerUrl, probeUrl }) => {
  validateConfiguredTarget(ownerUrl);
  validateConfiguredTarget(probeUrl);
  const ownerClient = new Client({ connectionString: ownerUrl });
  const probeClient = new Client({ connectionString: probeUrl });
  await ownerClient.connect();
  try {
    await probeClient.connect();
    assertVerifiedIdentity(await queryIdentity(ownerClient), EXPECTED_OWNER_ROLE);
    assertVerifiedIdentity(await queryIdentity(probeClient), EXPECTED_PROBE_ROLE);
    await assertRegisteredSchema(ownerClient);
    return { ownerClient, probeClient };
  } catch (error) {
    await Promise.allSettled([ownerClient.end(), probeClient.end()]);
    throw error;
  }
};

const roleExists = async (client, role) => {
  const result = await client.query(`SELECT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = $1
  ) AS exists`, [role]);
  return result.rows[0].exists;
};

const roleHasAnyProtectedPrivilege = async (client, role) => {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM unnest($2::text[]) AS object_name
      CROSS JOIN unnest($3::text[]) AS privilege
      WHERE has_table_privilege($1, format('%I.%I', 'public', object_name), privilege)
    ) OR EXISTS (
      SELECT 1
      FROM unnest($4::text[]) AS object_name
      CROSS JOIN unnest($5::text[]) AS privilege
      WHERE has_sequence_privilege($1, format('%I.%I', 'public', object_name), privilege)
    ) AS allowed
  `, [role, PROTECTED_TABLES, TABLE_PRIVILEGES, PROTECTED_SEQUENCES, SEQUENCE_PRIVILEGES]);
  return result.rows[0].allowed;
};

const assertPublicHasNoProtectedAcl = async (client) => {
  const result = await client.query(`
    SELECT COUNT(*)::integer AS count
    FROM pg_class AS object
    CROSS JOIN LATERAL aclexplode(COALESCE(
      object.relacl,
      acldefault(CASE WHEN object.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, object.relowner)
    )) AS acl
    WHERE object.oid = ANY(ARRAY[
      'public."GameInterruptionSessions"'::regclass,
      'public."GameInterruptionEvents"'::regclass,
      'public."GameInterruptionCompletionEvidence"'::regclass,
      'public."GameInterruptionSessions_id_seq"'::regclass,
      'public."GameInterruptionEvents_id_seq"'::regclass,
      'public."GameInterruptionCompletionEvidence_id_seq"'::regclass
    ]) AND acl.grantee = 0
  `);
  assert.equal(result.rows[0].count, 0, "PUBLIC must have no protected table or sequence ACL");
};

const assertAclDenied = async (ownerClient, probeClient) => {
  await assertPublicHasNoProtectedAcl(ownerClient);
  assert.equal(await roleHasAnyProtectedPrivilege(ownerClient, EXPECTED_PROBE_ROLE), false);
  for (const optionalRole of ["anon", "authenticated"]) {
    if (await roleExists(ownerClient, optionalRole)) {
      assert.equal(await roleHasAnyProtectedPrivilege(ownerClient, optionalRole), false,
        `${optionalRole} must not have protected table or sequence privileges`);
    }
  }

  await assert.rejects(
    probeClient.query('SELECT "id" FROM "GameInterruptionSessions" LIMIT 1'),
    (error) => {
      assertSqlState(error, "42501");
      return true;
    },
  );
  await assert.rejects(
    probeClient.query('SELECT nextval(\'public."GameInterruptionSessions_id_seq"\')'),
    (error) => {
      assertSqlState(error, "42501");
      return true;
    },
  );
};

const loadRuntime = () => {
  const database = require("../src/config/database");
  const models = require("../src/models");
  const {
    createGameInterruptionCompletionService,
  } = require("../src/services/gameInterruptionCompletionService");
  const {
    createGameInterruptionEventService,
  } = require("../src/services/gameInterruptionEventService");
  const {
    createGameInterruptionSessionService,
  } = require("../src/services/gameInterruptionSessionService");
  return {
    completionService: createGameInterruptionCompletionService(),
    database,
    eventService: createGameInterruptionEventService(),
    models,
    sessionService: createGameInterruptionSessionService(),
  };
};

const createProductionFixture = async (runtime) => {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  const teacher = await runtime.models.User.create({
    firstName: "Privilege",
    lastName: "Teacher",
    username: `p7g_priv_teacher_${suffix}`,
    email: `p7g_priv_teacher_${suffix}@invalid.example`,
    emailVerifiedAt: new Date(),
    role: "teacher",
    status: "active",
  });
  const student = await runtime.models.User.create({
    firstName: "Privilege",
    lastName: "Student",
    username: `p7g_priv_student_${suffix}`,
    email: `p7g_priv_student_${suffix}@invalid.example`,
    emailVerifiedAt: new Date(),
    role: "student",
    status: "active",
  });
  const classroom = await runtime.models.Classroom.create({
    teacherId: teacher.id,
    className: `Phase 7G privilege ${suffix}`,
    section: "RLS",
    schoolYear: "2099-2100",
    classCode: `P7GP${suffix}`,
    isActive: true,
  });
  await runtime.models.ClassroomMembership.create({
    classroomId: classroom.id,
    studentId: student.id,
    status: "active",
    joinedAt: new Date(),
  });
  await runtime.models.UserProgress.create({
    userId: student.id,
    levelKey: "tutorial-level-1",
    lessonTitle: "Privilege rehearsal",
    orderIndex: 1,
    progressPercent: 20,
    isCompleted: false,
    attemptCount: 0,
    timeSpentSeconds: 0,
    hintUsed: false,
    xpAwarded: 0,
  });
  const started = await runtime.sessionService.startInterruptionSession({
    actorId: student.id,
    actorRole: "student",
    classroomId: classroom.id,
    levelKey: "tutorial-level-1",
    sessionKey: `priv_session_${suffix}`,
  });
  const recorded = await runtime.eventService.recordInterruptionEvent({
    actorId: student.id,
    actorRole: "student",
    classroomId: classroom.id,
    levelKey: "tutorial-level-1",
    sessionId: started.session.id,
    eventKey: `priv_event_${suffix}`,
    eventType: "hidden",
  });
  assert.equal(started.changed, true);
  assert.equal(recorded.changed, true);
  const completion = await runtime.completionService.completeLevel({
    actorId: student.id,
    actorRole: "student",
    classroomId: classroom.id,
    classroomWasExplicit: true,
    levelKey: "tutorial-level-1",
    progressPercent: 100,
    completionActionId: `priv_complete_${suffix}`,
    completionOccurredAt: new Date(),
    interruptionEvents: [],
  });
  assert.equal(completion.completedNow, true);
  assert.equal(completion.completionDeductions.eventCount, 1);
  const [session, event, evidence] = await Promise.all([
    runtime.models.GameInterruptionSession.findByPk(started.session.id),
    runtime.models.GameInterruptionEvent.findByPk(recorded.event.id),
    runtime.models.GameInterruptionCompletionEvidence.findOne({
      where: { studentId: student.id, levelKey: "tutorial-level-1" },
    }),
  ]);
  assert.ok(session);
  assert.ok(event);
  assert.ok(evidence);
  assert.equal(Number(event.completionEvidenceId), Number(evidence.id));
  return {
    classroom,
    completion,
    evidence: evidence.get({ plain: true }),
    event: event.get({ plain: true }),
    session: session.get({ plain: true }),
    student,
    suffix,
  };
};

const protectedTableSql = (table) => {
  assert.ok(PROTECTED_TABLES.includes(table));
  return `"${table}"`;
};

const grantProbeTablePrivileges = (ownerClient, table) => ownerClient.query(
  `GRANT SELECT, INSERT ON TABLE ${protectedTableSql(table)} TO "${EXPECTED_PROBE_ROLE}"`,
);

const revokeProbeTablePrivileges = (ownerClient, table) => ownerClient.query(
  `REVOKE SELECT, INSERT ON TABLE ${protectedTableSql(table)} FROM "${EXPECTED_PROBE_ROLE}"`,
);

const assertMinimalGrantsEffective = async (ownerClient, table) => {
  const result = await ownerClient.query(`
    SELECT has_table_privilege($1, format('%I.%I', 'public', $2::text), 'SELECT') AS select_allowed,
           has_table_privilege($1, format('%I.%I', 'public', $2::text), 'INSERT') AS insert_allowed
  `, [EXPECTED_PROBE_ROLE, table]);
  assert.deepEqual(result.rows[0], { select_allowed: true, insert_allowed: true });
  for (const otherTable of PROTECTED_TABLES) {
    if (otherTable === table) continue;
    const other = await ownerClient.query(`
      SELECT has_table_privilege($1, format('%I.%I', 'public', $2::text), 'SELECT')
        OR has_table_privilege($1, format('%I.%I', 'public', $2::text), 'INSERT') AS allowed
    `, [EXPECTED_PROBE_ROLE, otherTable]);
    assert.equal(other.rows[0].allowed, false);
  }
  for (const sequence of PROTECTED_SEQUENCES) {
    const sequencePrivilege = await ownerClient.query(`
      SELECT has_sequence_privilege($1, format('%I.%I', 'public', $2::text), 'USAGE')
        OR has_sequence_privilege($1, format('%I.%I', 'public', $2::text), 'SELECT')
        OR has_sequence_privilege($1, format('%I.%I', 'public', $2::text), 'UPDATE') AS allowed
    `, [EXPECTED_PROBE_ROLE, sequence]);
    assert.equal(sequencePrivilege.rows[0].allowed, false);
  }
};

const assertOwnerSeesProtectedRows = async (ownerClient, fixture) => {
  const ownerRows = await ownerClient.query(`
    SELECT
      (SELECT COUNT(*)::integer FROM "GameInterruptionSessions"
        WHERE "id" = $1 AND "studentId" = $2 AND "classroomId" = $3) AS sessions,
      (SELECT COUNT(*)::integer FROM "GameInterruptionEvents"
        WHERE "id" = $4 AND "studentId" = $2) AS events,
      (SELECT COUNT(*)::integer FROM "GameInterruptionCompletionEvidence"
        WHERE "id" = $5 AND "studentId" = $2 AND "classroomId" = $3) AS evidence
  `, [fixture.session.id, fixture.student.id, fixture.classroom.id,
    fixture.event.id, fixture.evidence.id]);
  assert.deepEqual(ownerRows.rows[0], { sessions: 1, events: 1, evidence: 1 });
};

const assertTableRlsState = async (ownerClient, table) => {
  const state = await ownerClient.query(`
    SELECT relrowsecurity, relforcerowsecurity
    FROM pg_class
    WHERE oid = format('%I.%I', 'public', $1::text)::regclass
  `, [table]);
  assert.deepEqual(state.rows, [{ relrowsecurity: true, relforcerowsecurity: false }]);
  const policies = await ownerClient.query(`
    SELECT COUNT(*)::integer AS count FROM pg_policies
    WHERE schemaname = 'public' AND tablename = $1
  `, [table]);
  assert.equal(policies.rows[0].count, 0);
};

const nextExplicitId = async (ownerClient, table) => {
  const result = await ownerClient.query(
    `SELECT COALESCE(MAX("id"), 0) + 1000000 AS id FROM ${protectedTableSql(table)}`,
  );
  return Number(result.rows[0].id);
};

const assertCandidateSatisfiesConstraints = async (ownerClient, probe) => {
  await ownerClient.query("BEGIN");
  try {
    await ownerClient.query(probe.sql, probe.values);
    await ownerClient.query("ROLLBACK");
  } catch (error) {
    await ownerClient.query("ROLLBACK");
    throw error;
  }
};

const assertTableRlsEnforced = async ({ ownerClient, probeClient, fixture, table }) => {
  await assertTableRlsState(ownerClient, table);
  const probe = buildExplicitInsertProbe(table, fixture, await nextExplicitId(ownerClient, table));
  await assertCandidateSatisfiesConstraints(ownerClient, probe);
  await grantProbeTablePrivileges(ownerClient, table);
  let operationError;
  let cleanupError;
  try {
    await assertMinimalGrantsEffective(ownerClient, table);
    const rows = await probeClient.query(
      `SELECT COUNT(*)::integer AS count FROM ${protectedTableSql(table)}`,
    );
    assert.equal(rows.rows[0].count, 0, `RLS must hide ${table} rows from the probe`);
    await assert.rejects(probeClient.query(probe.sql, probe.values), (error) => {
      assertRlsViolation(error, table);
      return true;
    });
  } catch (error) {
    operationError = error;
  } finally {
    try {
      await revokeProbeTablePrivileges(ownerClient, table);
      assert.equal(await roleHasAnyProtectedPrivilege(ownerClient, EXPECTED_PROBE_ROLE), false);
    } catch (error) {
      cleanupError = error;
    }
  }
  if (cleanupError) {
    throw new AggregateError(
      [operationError, cleanupError].filter(Boolean),
      `Privilege cleanup failed for ${table}; temporary grants may remain`,
    );
  }
  if (operationError) throw operationError;
};

const redactDiagnostics = (ownerUrl, probeUrl, value) => String(value)
  .replaceAll(ownerUrl, "<redacted-owner-database-url>")
  .replaceAll(probeUrl, "<redacted-probe-database-url>")
  .replace(/postgres(?:ql)?:\/\/[^\s@]+@/giu, "postgresql://<redacted>@");

const registerWorkerTest = ({ ownerUrl, probeUrl }) => {
  test("Phase 7G tables deny direct access and enforce RLS for a restricted non-owner", {
    timeout: 120000,
  }, async () => {
    const { ownerClient, probeClient } = await connectVerifiedClients({ ownerUrl, probeUrl });
    let runtime;
    let operationError;
    const completedScenarios = [];
    try {
      await assertAclDenied(ownerClient, probeClient);
      completedScenarios.push({ id: WORKER_SCENARIO_IDS[0], status: "passed" });

      runtime = loadRuntime();
      await runtime.database.authenticate();
      const fixture = await createProductionFixture(runtime);
      await assertOwnerSeesProtectedRows(ownerClient, fixture);
      for (const [index, table] of PROTECTED_TABLES.entries()) {
        await assertTableRlsEnforced({ ownerClient, probeClient, fixture, table });
        completedScenarios.push({ id: WORKER_SCENARIO_IDS[index + 1], status: "passed" });
      }
    } catch (error) {
      operationError = error;
    } finally {
      let cleanupError;
      try {
        for (const table of PROTECTED_TABLES) {
          await revokeProbeTablePrivileges(ownerClient, table);
        }
        await assertAclDenied(ownerClient, probeClient);
        completedScenarios.push({ id: WORKER_SCENARIO_IDS[4], status: "passed" });
      } catch (error) {
        cleanupError = error;
      }
      if (runtime) await runtime.database.close();
      await Promise.allSettled([ownerClient.end(), probeClient.end()]);
      if (cleanupError) {
        throw new AggregateError(
          [operationError, cleanupError].filter(Boolean),
          "Privilege rehearsal cleanup failed; temporary grants may remain",
        );
      }
    }
    if (operationError) throw operationError;
    assert.deepEqual(completedScenarios, WORKER_SCENARIO_IDS.map((id) => ({ id, status: "passed" })));
    emitWorkerCompletionAcknowledgement({ suiteId: WORKER_SUITE_ID, scenarios: completedScenarios });
  });
};

if (process.env[WORKER_ENV] === "1") {
  registerWorkerTest({
    ownerUrl: process.env[OWNER_DATABASE_ENV],
    probeUrl: process.env[PROBE_DATABASE_ENV],
  });
} else {
  const configured = process.env[OPT_IN_ENV] === "1"
    || Boolean(process.env[OWNER_DATABASE_ENV])
    || Boolean(process.env[PROBE_DATABASE_ENV]);
  const integrationTest = configured ? test : test.skip;
  integrationTest("Phase 7G PostgreSQL non-owner privilege rehearsal", async () => {
    const ownerUrl = process.env[OWNER_DATABASE_ENV];
    const probeUrl = process.env[PROBE_DATABASE_ENV];
    assertLaunchConfiguration({
      optIn: process.env[OPT_IN_ENV],
      ownerUrl,
      probeUrl,
    });
    await runPostgresWorker({
      scriptPath: __filename,
      suiteId: WORKER_SUITE_ID,
      expectedScenarioIds: WORKER_SCENARIO_IDS,
      environment: {
        DATABASE_URL: ownerUrl,
        DB_SSL: "false",
        [OPT_IN_ENV]: "1",
        [OWNER_DATABASE_ENV]: ownerUrl,
        [PROBE_DATABASE_ENV]: probeUrl,
        [WORKER_ENV]: "1",
      },
      redactDiagnostics: (value) => redactDiagnostics(ownerUrl, probeUrl, value),
    });
  });
}
