const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { Client } = require("pg");
const {
  emitWorkerCompletionAcknowledgement,
  runPostgresWorker,
} = require("./support/postgresWorkerHarness");

const DATABASE_ENV = "TEACHER_GAME_INTERRUPTION_REPORT_DATABASE_URL";
const OPT_IN_ENV = "RUN_TEACHER_GAME_INTERRUPTION_REPORT_POSTGRES";
const WORKER_ENV = "TEACHER_GAME_INTERRUPTION_REPORT_WORKER";
const WORKER_SUITE_ID = "teacher-game-interruption-report";
const WORKER_SCENARIO_IDS = Object.freeze([
  "scope-authorization-isolation",
  "applied-zero-versus-unapplied",
  "independent-pagination-ordering",
  "repeatable-read-snapshot",
]);
const EXPECTED_DATABASE = "sharprunner_game_interruption_full_rehearsal_test";
const EXPECTED_ROLE = "sharprunner_phase7g_rehearsal_app";
const EXPECTED_MARKER = "SharpRunner disposable Phase 7G PostgreSQL rehearsal";
const REQUIRED_PHASE_7G_MIGRATIONS = Object.freeze([
  "20261029000000_game_interruption_deduction_settings",
  "20261030000000_game_interruption_history",
  "20261031000000_game_interruption_completion_evidence",
  "20261031120000_game_interruption_report_index",
]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
};

const withFailureTimeout = async (promise, label, milliseconds = 10000) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out while waiting for ${label}`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const validateConfiguredTarget = (databaseUrl) => {
  const target = new URL(databaseUrl);
  assert.ok(LOOPBACK_HOSTS.has(target.hostname), "report rehearsal requires literal loopback");
  assert.equal(target.pathname.replace(/^\//, ""), EXPECTED_DATABASE);
  assert.notEqual(target.pathname.replace(/^\//, ""), "sharprunner_browser_test");
  return target;
};

const assertVerifiedTargetIdentity = (identity) => {
  assert.deepEqual(identity, {
    database: EXPECTED_DATABASE,
    address: identity.address,
    role: EXPECTED_ROLE,
    owner: EXPECTED_ROLE,
    marker: EXPECTED_MARKER,
  });
  assert.ok(["127.0.0.1", "::1"].includes(identity.address));
};

test("report rehearsal identity guard accepts only normalized loopback addresses", () => {
  const identity = {
    database: EXPECTED_DATABASE,
    address: "127.0.0.1",
    role: EXPECTED_ROLE,
    owner: EXPECTED_ROLE,
    marker: EXPECTED_MARKER,
  };

  assert.doesNotThrow(() => assertVerifiedTargetIdentity(identity));
  assert.doesNotThrow(() => assertVerifiedTargetIdentity({ ...identity, address: "::1" }));

  for (const address of [
    "10.0.0.4",
    null,
    undefined,
    "",
    "127.0.0.1/32",
    "::1/128",
    "localhost",
  ]) {
    assert.throws(() => assertVerifiedTargetIdentity({ ...identity, address }));
  }
  for (const missingIdentity of [null, undefined, {}, []]) {
    assert.throws(() => assertVerifiedTargetIdentity(missingIdentity));
  }
});

test("report rehearsal identity guard rejects substituted database metadata", () => {
  const identity = {
    database: EXPECTED_DATABASE,
    address: "127.0.0.1",
    role: EXPECTED_ROLE,
    owner: EXPECTED_ROLE,
    marker: EXPECTED_MARKER,
  };

  for (const substitution of [
    { database: "sharprunner_browser_test" },
    { role: "postgres" },
    { owner: "postgres" },
    { marker: "unexpected marker" },
  ]) {
    assert.throws(() => assertVerifiedTargetIdentity({ ...identity, ...substitution }));
  }
});

const verifyTargetBeforeMutation = async (databaseUrl) => {
  validateConfiguredTarget(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const identity = await client.query(`
      SELECT current_database() AS database,
             host(inet_server_addr()) AS address,
             current_user AS role,
             pg_get_userbyid(database_owner.datdba) AS owner,
             shobj_description(database_owner.oid, 'pg_database') AS marker
      FROM pg_database AS database_owner
      WHERE database_owner.datname = current_database()
    `);
    assert.equal(identity.rowCount, 1);
    assertVerifiedTargetIdentity(identity.rows[0]);

    // Import the production registry only after SQL proves this is the exact
    // marked loopback rehearsal target under the dedicated application role.
    const { migrations: registeredMigrations } = require("../src/services/migrationService");
    const registeredNames = registeredMigrations.map(([name]) => name);
    assert.deepEqual(
      REQUIRED_PHASE_7G_MIGRATIONS.filter((name) => !registeredNames.includes(name)),
      [],
      "the production registry must retain every Phase 7G migration",
    );
    const migrationRows = await client.query(`
      SELECT "name"
      FROM "SharpRunnerMigrations"
      ORDER BY "name"
    `);
    const appliedNames = new Set(migrationRows.rows.map(({ name }) => name));
    assert.deepEqual(
      registeredNames.filter((name) => !appliedNames.has(name)),
      [],
      "all registered migrations must already be applied",
    );

    const schema = await client.query(`
      SELECT to_regclass('public."GameInterruptionSessions"') IS NOT NULL AS sessions,
             to_regclass('public."GameInterruptionEvents"') IS NOT NULL AS events,
             to_regclass('public."GameInterruptionCompletionEvidence"') IS NOT NULL AS evidence,
             to_regclass('public."LearningAnalyticsEvents"') IS NOT NULL AS analytics,
             to_regclass('public."XpTransactions"') IS NOT NULL AS xp_transactions,
             to_regclass('public."game_interruption_events_session_history"') IS NOT NULL AS history_index
    `);
    assert.deepEqual(schema.rows[0], {
      sessions: true,
      events: true,
      evidence: true,
      analytics: true,
      xp_transactions: true,
      history_index: true,
    });
  } finally {
    await client.end();
  }
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
  const {
    createTeacherGameInterruptionReportService,
  } = require("../src/services/teacherGameInterruptionReportService");
  return {
    createGameInterruptionCompletionService,
    createGameInterruptionEventService,
    createGameInterruptionSessionService,
    createTeacherGameInterruptionReportService,
    database,
    models,
  };
};

const uniqueSuffix = () => crypto.randomUUID().replaceAll("-", "").slice(0, 16);

const createAccount = (runtime, suffix, label, role) => runtime.models.User.create({
  firstName: "Phase",
  lastName: label,
  username: `p7g_report_${label.toLowerCase()}_${suffix}`,
  email: `p7g_report_${label.toLowerCase()}_${suffix}@invalid.example`,
  emailVerifiedAt: new Date(),
  role,
  status: "active",
});

const createClassroom = (runtime, teacher, suffix, label) => runtime.models.Classroom.create({
  teacherId: teacher.id,
  className: `Phase 7G report ${label} ${suffix}`,
  section: label,
  schoolYear: "2099-2100",
  classCode: `R${label}${suffix}`,
  isActive: true,
});

const addStudent = async (runtime, {
  classrooms,
  suffix,
  label = "Student",
  levelKey = "tutorial-level-1",
}) => {
  const student = await createAccount(runtime, suffix, label, "student");
  const memberships = [];
  for (const classroom of classrooms) {
    memberships.push(await runtime.models.ClassroomMembership.create({
      classroomId: classroom.id,
      studentId: student.id,
      status: "active",
      joinedAt: new Date(),
    }));
  }
  const progress = await runtime.models.UserProgress.create({
    userId: student.id,
    levelKey,
    lessonTitle: "Phase 7G reporting rehearsal",
    orderIndex: 1,
    progressPercent: 50,
    isCompleted: false,
    attemptCount: 0,
    timeSpentSeconds: 0,
    hintUsed: false,
    xpAwarded: 0,
  });
  return { memberships, progress, student };
};

const createFixture = async (runtime, { classroomCount = 1 } = {}) => {
  const suffix = uniqueSuffix();
  const teacher = await createAccount(runtime, suffix, "Teacher", "teacher");
  const foreignTeacher = await createAccount(runtime, suffix, "Foreign", "teacher");
  const admin = await createAccount(runtime, suffix, "Admin", "admin");
  const classrooms = [];
  for (let index = 0; index < classroomCount; index += 1) {
    classrooms.push(await createClassroom(runtime, teacher, suffix, `C${index + 1}`));
  }
  const studentFixture = await addStudent(runtime, {
    classrooms,
    suffix,
    label: "Student",
  });
  return {
    admin,
    classrooms,
    foreignTeacher,
    levelKey: "tutorial-level-1",
    suffix,
    teacher,
    ...studentFixture,
  };
};

const startSession = (runtime, fixture, classroom, label, service = runtime.sessionService) => (
  service.startInterruptionSession({
    actorId: fixture.student.id,
    actorRole: "student",
    classroomId: classroom.id,
    levelKey: fixture.levelKey,
    sessionKey: `${label}_${fixture.suffix}`,
  })
);

const recordEvent = (
  runtime,
  fixture,
  classroom,
  session,
  label,
  eventType = "hidden",
  service = runtime.eventService,
) => service.recordInterruptionEvent({
  actorId: fixture.student.id,
  actorRole: "student",
  classroomId: classroom.id,
  levelKey: fixture.levelKey,
  sessionId: session.id,
  eventKey: `${label}_${fixture.suffix}`,
  eventType,
});

const completeLevel = (runtime, fixture, classroom, label) => (
  runtime.completionService.completeLevel({
    actorId: fixture.student.id,
    actorRole: "student",
    classroomId: classroom.id,
    classroomWasExplicit: true,
    levelKey: fixture.levelKey,
    completionActionId: `${label}_${fixture.suffix}`,
    completionOccurredAt: new Date(),
    interruptionEvents: [],
  })
);

const reportInput = (fixture, classroom, overrides = {}) => {
  const sessionPage = overrides.sessionPage ?? 1;
  const sessionLimit = overrides.sessionLimit ?? 20;
  const eventPage = overrides.eventPage ?? 1;
  const eventLimit = overrides.eventLimit ?? 20;
  return {
    actorId: overrides.actorId ?? fixture.teacher.id,
    actorRole: overrides.actorRole ?? "teacher",
    classroomId: classroom.id,
    studentId: overrides.studentId ?? fixture.student.id,
    levelKey: overrides.levelKey ?? fixture.levelKey,
    sessionPage,
    sessionLimit,
    sessionOffset: (sessionPage - 1) * sessionLimit,
    eventPage,
    eventLimit,
    eventOffset: (eventPage - 1) * eventLimit,
  };
};

const getReport = (
  runtime,
  fixture,
  classroom,
  overrides = {},
  service = runtime.reportService,
) => service.getTeacherGameInterruptionReport(reportInput(fixture, classroom, overrides));

const expectCode = async (promise, code) => assert.rejects(
  promise,
  (error) => error?.code === code,
);

const countReportQueries = async (runtime, operation) => {
  const hookName = `phase7g-report-${uniqueSuffix()}`;
  let count = 0;
  runtime.database.addHook("beforeQuery", hookName, () => { count += 1; });
  try {
    const result = await operation();
    return { count, result };
  } finally {
    runtime.database.removeHook("beforeQuery", hookName);
  }
};

const registerWorkerTest = (databaseUrl) => {
  test("production report queries preserve exact full-schema interruption history", {
    timeout: 180000,
  }, async (t) => {
    const completedScenarios = [];
    const runScenario = (id, name, callback) => t.test(name, async () => {
      await callback();
      completedScenarios.push({ id, status: "passed" });
    });
    await verifyTargetBeforeMutation(databaseUrl);
    const runtime = loadRuntime();
    runtime.sessionService = runtime.createGameInterruptionSessionService();
    runtime.eventService = runtime.createGameInterruptionEventService();
    runtime.completionService = runtime.createGameInterruptionCompletionService();
    runtime.reportService = runtime.createTeacherGameInterruptionReportService();
    await runtime.database.authenticate();
    try {
      await runScenario(WORKER_SCENARIO_IDS[0], "exact scope authorization isolates applied and unapplied classroom history", async () => {
        const fixture = await createFixture(runtime, { classroomCount: 2 });
        const [completionClassroom, otherClassroom] = fixture.classrooms;
        const otherStudentFixture = await addStudent(runtime, {
          classrooms: [completionClassroom],
          suffix: uniqueSuffix(),
          label: "OtherStudent",
        });
        const otherStudent = {
          ...fixture,
          ...otherStudentFixture,
          suffix: uniqueSuffix(),
        };

        const completionSession = (await startSession(
          runtime,
          fixture,
          completionClassroom,
          "scope_completion_session",
        )).session;
        await recordEvent(
          runtime,
          fixture,
          completionClassroom,
          completionSession,
          "scope_applied_hidden",
        );
        await recordEvent(
          runtime,
          fixture,
          completionClassroom,
          completionSession,
          "scope_applied_fullscreen",
          "fullscreen_exit",
        );
        const otherClassroomSession = (await startSession(
          runtime,
          fixture,
          otherClassroom,
          "scope_other_classroom_session",
        )).session;
        await recordEvent(
          runtime,
          fixture,
          otherClassroom,
          otherClassroomSession,
          "scope_other_classroom_event",
        );
        const otherStudentSession = (await startSession(
          runtime,
          otherStudent,
          completionClassroom,
          "scope_other_student_session",
        )).session;
        await recordEvent(
          runtime,
          otherStudent,
          completionClassroom,
          otherStudentSession,
          "scope_other_student_event",
        );
        await completeLevel(runtime, fixture, completionClassroom, "scope_completion");

        const applied = await getReport(runtime, fixture, completionClassroom);
        assert.deepEqual(applied.summary, {
          recordedEventCount: 2,
          appliedEventCount: 2,
          unappliedEventCount: 0,
          actualScoreDeduction: 2,
          actualXpDeduction: 20,
        });
        assert.equal(applied.completionEvidence.availability, "available");
        assert.equal(applied.completionEvidence.eventCount, 2);
        assert.equal(applied.scope.classroom.id, completionClassroom.id);
        assert.equal(applied.scope.student.id, fixture.student.id);
        assert.equal(applied.scope.level.levelKey, fixture.levelKey);

        const otherClassroomReport = await getReport(runtime, fixture, otherClassroom);
        assert.deepEqual(otherClassroomReport.summary, {
          recordedEventCount: 1,
          appliedEventCount: 0,
          unappliedEventCount: 1,
          actualScoreDeduction: 0,
          actualXpDeduction: 0,
        });
        assert.deepEqual(otherClassroomReport.completionEvidence, {
          availability: "unavailable",
        });
        assert.equal(otherClassroomReport.events.items[0].applicationStatus, "unapplied");
        assert.equal(otherClassroomReport.events.items[0].actualScoreDeduction, null);
        assert.equal(otherClassroomReport.events.items[0].actualXpDeduction, null);

        const otherStudentReport = await getReport(runtime, fixture, completionClassroom, {
          studentId: otherStudent.student.id,
        });
        assert.equal(otherStudentReport.summary.recordedEventCount, 1);
        assert.equal(otherStudentReport.summary.appliedEventCount, 0);
        const otherLevelReport = await getReport(runtime, fixture, completionClassroom, {
          levelKey: "tutorial-level-2",
        });
        assert.equal(otherLevelReport.summary.recordedEventCount, 0);
        assert.equal(otherLevelReport.sessions.total, 0);
        assert.equal(otherLevelReport.events.total, 0);

        await expectCode(getReport(runtime, fixture, completionClassroom, {
          actorId: fixture.foreignTeacher.id,
        }), "CLASSROOM_NOT_AVAILABLE");
        const administratorReport = await getReport(runtime, fixture, completionClassroom, {
          actorId: fixture.admin.id,
          actorRole: "admin",
        });
        assert.equal(administratorReport.summary.recordedEventCount, 2);

        await completionClassroom.update({ isActive: false });
        await expectCode(
          getReport(runtime, fixture, completionClassroom),
          "CLASSROOM_NOT_AVAILABLE",
        );
        await completionClassroom.update({ isActive: true });

        const membership = fixture.memberships.find(
          (item) => Number(item.classroomId) === Number(completionClassroom.id),
        );
        await membership.update({ status: "removed" });
        await expectCode(
          getReport(runtime, fixture, completionClassroom),
          "STUDENT_NOT_AVAILABLE",
        );
        await membership.update({ status: "active" });

        await fixture.student.update({ status: "inactive" });
        await expectCode(
          getReport(runtime, fixture, completionClassroom),
          "STUDENT_NOT_AVAILABLE",
        );
        await fixture.student.update({ status: "active" });
      });

      await runScenario(WORKER_SCENARIO_IDS[1], "applied zero remains distinct from unapplied null on the migrated schema", async () => {
        const fixture = await createFixture(runtime);
        const classroom = fixture.classrooms[0];
        await runtime.models.LevelContentOverride.create({
          classroomId: classroom.id,
          levelKey: fixture.levelKey,
          interruptionScoreDeduction: 0,
          interruptionXpDeduction: 0,
        });
        const session = (await startSession(
          runtime,
          fixture,
          classroom,
          "zero_session",
        )).session;
        await recordEvent(runtime, fixture, classroom, session, "zero_event");
        await completeLevel(runtime, fixture, classroom, "zero_completion");

        const report = await getReport(runtime, fixture, classroom);
        assert.deepEqual(report.summary, {
          recordedEventCount: 1,
          appliedEventCount: 1,
          unappliedEventCount: 0,
          actualScoreDeduction: 0,
          actualXpDeduction: 0,
        });
        assert.equal(report.completionEvidence.availability, "available");
        assert.equal(report.events.items[0].applicationStatus, "applied");
        assert.equal(report.events.items[0].actualScoreDeduction, 0);
        assert.equal(report.events.items[0].actualXpDeduction, 0);
        assert.ok(report.events.items[0].appliedAt);
      });

      await runScenario(WORKER_SCENARIO_IDS[2], "independent pagination uses stable timestamp and numeric-ID tie ordering", async () => {
        const fixture = await createFixture(runtime);
        const classroom = fixture.classrooms[0];
        const fixedTime = new Date("2099-01-01T00:00:00.000Z");
        const fixedSessionService = runtime.createGameInterruptionSessionService({
          now: () => fixedTime,
        });
        const fixedEventService = runtime.createGameInterruptionEventService({
          now: () => fixedTime,
        });
        const sessionIds = [];
        const eventIds = [];
        for (let index = 0; index < 4; index += 1) {
          const session = (await startSession(
            runtime,
            fixture,
            classroom,
            `tie_session_${index}`,
            fixedSessionService,
          )).session;
          const event = (await recordEvent(
            runtime,
            fixture,
            classroom,
            session,
            `tie_event_${index}`,
            index % 2 === 0 ? "hidden" : "fullscreen_exit",
            fixedEventService,
          )).event;
          sessionIds.push(Number(session.id));
          eventIds.push(Number(event.id));
        }
        const descendingSessions = [...sessionIds].sort((left, right) => right - left);
        const descendingEvents = [...eventIds].sort((left, right) => right - left);

        const sessionSecondPage = await getReport(runtime, fixture, classroom, {
          sessionPage: 2,
          sessionLimit: 2,
          eventPage: 1,
          eventLimit: 2,
        });
        assert.deepEqual(
          sessionSecondPage.sessions.items.map(({ id }) => id),
          descendingSessions.slice(2, 4),
        );
        assert.deepEqual(
          sessionSecondPage.events.items.map(({ id }) => id),
          descendingEvents.slice(0, 2),
        );
        assert.equal(sessionSecondPage.sessions.total, 4);
        assert.equal(sessionSecondPage.events.total, 4);

        const eventSecondPage = await getReport(runtime, fixture, classroom, {
          sessionPage: 1,
          sessionLimit: 2,
          eventPage: 2,
          eventLimit: 2,
        });
        assert.deepEqual(
          eventSecondPage.sessions.items.map(({ id }) => id),
          descendingSessions.slice(0, 2),
        );
        assert.deepEqual(
          eventSecondPage.events.items.map(({ id }) => id),
          descendingEvents.slice(2, 4),
        );

        const beforeGrowth = await countReportQueries(
          runtime,
          () => getReport(runtime, fixture, classroom),
        );
        const fifthSession = (await startSession(
          runtime,
          fixture,
          classroom,
          "tie_session_4",
          fixedSessionService,
        )).session;
        await recordEvent(
          runtime,
          fixture,
          classroom,
          fifthSession,
          "tie_event_4",
          "hidden",
          fixedEventService,
        );
        const afterGrowth = await countReportQueries(
          runtime,
          () => getReport(runtime, fixture, classroom),
        );
        assert.ok(beforeGrowth.count > 0);
        assert.equal(afterGrowth.count, beforeGrowth.count);
        assert.equal(beforeGrowth.result.summary.recordedEventCount, 4);
        assert.equal(afterGrowth.result.summary.recordedEventCount, 5);
      });

      await runScenario(WORKER_SCENARIO_IDS[3], "repeatable-read report excludes a coordinated event committed between reads", async () => {
        const fixture = await createFixture(runtime);
        const classroom = fixture.classrooms[0];
        const session = (await startSession(
          runtime,
          fixture,
          classroom,
          "repeatable_session",
        )).session;
        await recordEvent(runtime, fixture, classroom, session, "repeatable_initial_event");

        const summaryRead = deferred();
        const releaseReport = deferred();
        let held = false;
        const coordinatedDatabase = {
          transaction: (...args) => runtime.database.transaction(...args),
          query: async (sql, options) => {
            const result = await runtime.database.query(sql, options);
            if (!held && /report:summary/.test(sql)) {
              held = true;
              summaryRead.resolve();
              await withFailureTimeout(releaseReport.promise, "coordinated report release");
            }
            return result;
          },
        };
        const coordinatedService = runtime.createTeacherGameInterruptionReportService({
          database: coordinatedDatabase,
        });
        const reportPromise = getReport(
          runtime,
          fixture,
          classroom,
          {},
          coordinatedService,
        );
        reportPromise.catch((error) => summaryRead.reject(error));
        await withFailureTimeout(summaryRead.promise, "the production summary query");
        try {
          await withFailureTimeout(
            recordEvent(
              runtime,
              fixture,
              classroom,
              session,
              "repeatable_committed_event",
              "fullscreen_exit",
            ),
            "the coordinated event writer",
          );
        } finally {
          releaseReport.resolve();
        }
        const snapshot = await withFailureTimeout(reportPromise, "the repeatable-read report");
        assert.equal(snapshot.summary.recordedEventCount, 1);
        assert.equal(snapshot.events.total, 1);

        const fresh = await getReport(runtime, fixture, classroom);
        assert.equal(fresh.summary.recordedEventCount, 2);
        assert.equal(fresh.events.total, 2);
      });
    } finally {
      // Immutable evidence and RESTRICT history are intentionally retained.
      // Dropping the explicitly marked disposable database is the cleanup boundary.
      await runtime.database.close();
    }
    assert.deepEqual(
      completedScenarios,
      WORKER_SCENARIO_IDS.map((id) => ({ id, status: "passed" })),
      "all reporting PostgreSQL scenarios must complete before acknowledgement",
    );
    emitWorkerCompletionAcknowledgement({
      suiteId: WORKER_SUITE_ID,
      scenarios: completedScenarios,
    });
  });
};

const redactSecrets = (value, databaseUrl) => String(value || "")
  .replaceAll(databaseUrl, "<redacted-database-url>")
  .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://<redacted>@");

if (process.env[WORKER_ENV] === "1") {
  registerWorkerTest(process.env[DATABASE_ENV]);
} else {
  const databaseUrl = process.env[DATABASE_ENV];
  const optedIn = process.env[OPT_IN_ENV] === "1";
  const configured = optedIn || Boolean(databaseUrl);
  const postgresTest = configured ? test : test.skip;
  postgresTest("guarded full-schema teacher interruption report integration", {
    timeout: 210000,
  }, async () => {
    assert.equal(optedIn, true, `${OPT_IN_ENV}=1 is required`);
    assert.equal(typeof databaseUrl, "string", `${DATABASE_ENV} is required`);
    validateConfiguredTarget(databaseUrl);
    await runPostgresWorker({
      scriptPath: __filename,
      suiteId: WORKER_SUITE_ID,
      expectedScenarioIds: WORKER_SCENARIO_IDS,
      environment: {
        DATABASE_URL: databaseUrl,
        DB_SSL: "false",
        [WORKER_ENV]: "1",
      },
      redactDiagnostics: (value) => redactSecrets(value, databaseUrl).slice(-12000),
    });
  });
}
