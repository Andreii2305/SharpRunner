const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { Client } = require("pg");
const {
  emitWorkerCompletionAcknowledgement,
  runPostgresWorker,
} = require("./support/postgresWorkerHarness");

const DATABASE_ENV = "GAME_INTERRUPTION_FULL_STACK_DATABASE_URL";
const OPT_IN_ENV = "RUN_GAME_INTERRUPTION_FULL_STACK_POSTGRES";
const WORKER_ENV = "GAME_INTERRUPTION_FULL_STACK_WORKER";
const WORKER_SUITE_ID = "game-interruption-full-stack";
const WORKER_SCENARIO_IDS = Object.freeze([
  "positive-xp-evidence-ledger-retry",
  "zero-xp-evidence-without-ledger",
  "post-xp-failure-rollback",
  "cross-classroom-first-completion",
  "event-session-before-completion",
  "completion-before-event-session",
]);
const EXPECTED_DATABASE = "sharprunner_game_interruption_full_rehearsal_test";
const EXPECTED_ROLE = "sharprunner_phase7g_rehearsal_app";
const EXPECTED_MARKER = "SharpRunner disposable Phase 7G PostgreSQL rehearsal";
const REQUIRED_MIGRATIONS = Object.freeze([
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

const validateConfiguredTarget = (databaseUrl) => {
  const target = new URL(databaseUrl);
  assert.ok(LOOPBACK_HOSTS.has(target.hostname), "full-stack rehearsal requires literal loopback");
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

test("full-stack rehearsal identity guard accepts only normalized loopback addresses", () => {
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

test("full-stack rehearsal identity guard rejects substituted database metadata", () => {
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

    // Load only the registry after SQL has established that this process is
    // connected to the exact marked rehearsal database as its dedicated role.
    const { migrations: registeredMigrations } = require("../src/services/migrationService");
    const registeredNames = registeredMigrations.map(([name]) => name);
    assert.deepEqual(
      REQUIRED_MIGRATIONS.filter((name) => !registeredNames.includes(name)),
      [],
      "the production registry must retain every Phase 7G migration",
    );
    const migrations = await client.query(`
      SELECT "name"
      FROM "SharpRunnerMigrations"
      ORDER BY "name"
    `);
    const appliedNames = new Set(migrations.rows.map(({ name }) => name));
    assert.deepEqual(
      registeredNames.filter((name) => !appliedNames.has(name)),
      [],
      "all registered migrations must already be applied",
    );
    const schema = await client.query(`
      SELECT to_regclass('public."GameInterruptionSessions"') IS NOT NULL AS sessions,
             to_regclass('public."GameInterruptionEvents"') IS NOT NULL AS events,
             to_regclass('public."GameInterruptionCompletionEvidence"') IS NOT NULL AS evidence,
             to_regclass('public."XpTransactions"') IS NOT NULL AS xp_transactions
    `);
    assert.deepEqual(schema.rows[0], {
      sessions: true,
      events: true,
      evidence: true,
      xp_transactions: true,
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
    awardCompletionXpFromEvidence,
  } = require("../src/services/gamificationService");
  const {
    getClassroomLevelSettings,
  } = require("../src/services/classroomLevelSettingsService");
  const {
    getStudentLevelAccess,
  } = require("../src/services/levelAccessService");
  return {
    awardCompletionXpFromEvidence,
    createGameInterruptionCompletionService,
    createGameInterruptionEventService,
    createGameInterruptionSessionService,
    database,
    getClassroomLevelSettings,
    getStudentLevelAccess,
    models,
  };
};

const uniqueSuffix = () => crypto.randomUUID().replaceAll("-", "").slice(0, 16);

const createFixture = async (runtime, {
  classroomCount = 1,
  levelKey = "tutorial-level-1",
  xpTotal = 0,
} = {}) => {
  const suffix = uniqueSuffix();
  const teacher = await runtime.models.User.create({
    firstName: "Phase",
    lastName: "Teacher",
    username: `p7g_teacher_${suffix}`,
    email: `p7g_teacher_${suffix}@invalid.example`,
    emailVerifiedAt: new Date(),
    role: "teacher",
    status: "active",
  });
  const student = await runtime.models.User.create({
    firstName: "Phase",
    lastName: "Student",
    username: `p7g_student_${suffix}`,
    email: `p7g_student_${suffix}@invalid.example`,
    emailVerifiedAt: new Date(),
    role: "student",
    status: "active",
    xpTotal,
  });
  const classrooms = [];
  for (let index = 0; index < classroomCount; index += 1) {
    const classroom = await runtime.models.Classroom.create({
      teacherId: teacher.id,
      className: `Phase 7G ${suffix} ${index + 1}`,
      section: `R${index + 1}`,
      schoolYear: "2099-2100",
      classCode: `P7G${suffix}${index}`,
      isActive: true,
    });
    await runtime.models.ClassroomMembership.create({
      classroomId: classroom.id,
      studentId: student.id,
      status: "active",
      joinedAt: new Date(),
    });
    classrooms.push(classroom);
  }
  const progress = await runtime.models.UserProgress.create({
    userId: student.id,
    levelKey,
    lessonTitle: "Phase 7G rehearsal",
    orderIndex: 1,
    progressPercent: 50,
    isCompleted: false,
    attemptCount: 0,
    timeSpentSeconds: 0,
    hintUsed: false,
    xpAwarded: 0,
  });
  return { classrooms, levelKey, progress, student, suffix, teacher };
};

const startSession = (runtime, fixture, classroom, label = "session") => (
  runtime.sessionService.startInterruptionSession({
    actorId: fixture.student.id,
    actorRole: "student",
    classroomId: classroom.id,
    levelKey: fixture.levelKey,
    sessionKey: `${label}_${fixture.suffix}`,
  })
);

const completionInput = (fixture, classroom, label, interruptionEvents = []) => ({
  actorId: fixture.student.id,
  actorRole: "student",
  classroomId: classroom.id,
  classroomWasExplicit: true,
  levelKey: fixture.levelKey,
  completionActionId: `${label}_${fixture.suffix}`,
  completionOccurredAt: new Date(),
  interruptionEvents,
});

const eventInput = (fixture, classroom, session, label, eventType = "hidden") => ({
  actorId: fixture.student.id,
  actorRole: "student",
  classroomId: classroom.id,
  levelKey: fixture.levelKey,
  sessionId: session.id,
  eventKey: `${label}_${fixture.suffix}`,
  eventType,
});

const evidenceFor = (runtime, fixture) => runtime.models.GameInterruptionCompletionEvidence.findOne({
  where: { studentId: fixture.student.id, levelKey: fixture.levelKey },
});

const analyticsCount = (runtime, fixture) => runtime.models.LearningAnalyticsEvent.count({
  where: {
    studentId: fixture.student.id,
    levelKey: fixture.levelKey,
    eventType: "level_completed",
  },
});

const xpCount = (runtime, fixture) => runtime.models.XpTransaction.count({
  where: {
    userId: fixture.student.id,
    kind: "level_completion",
    referenceType: "level",
    referenceId: fixture.levelKey,
  },
});

const registerWorkerTest = (databaseUrl) => {
  test("full registered schema preserves atomic interruption completion behavior", {
    timeout: 120000,
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
    await runtime.database.authenticate();
    try {
      await runScenario(WORKER_SCENARIO_IDS[0], "positive XP links immutable evidence, event application, analytics, and ledger exactly once", async () => {
        const fixture = await createFixture(runtime);
        const classroom = fixture.classrooms[0];
        const started = await startSession(runtime, fixture, classroom, "positive_session");
        const pending = eventInput(fixture, classroom, started.session, "positive_event");
        const input = completionInput(fixture, classroom, "positive_completion", [{
          sessionId: pending.sessionId,
          eventKey: pending.eventKey,
          eventType: pending.eventType,
        }]);

        const first = await runtime.completionService.completeLevel(input);
        assert.equal(first.completedNow, true);
        assert.equal(first.completionDeductions.eventCount, 1);
        assert.ok(first.completionDeductions.xp.net > 0);
        assert.equal(first.xpAward.amount, first.completionDeductions.xp.net);
        const evidence = await evidenceFor(runtime, fixture);
        assert.ok(evidence);
        const event = await runtime.models.GameInterruptionEvent.findOne({
          where: { studentId: fixture.student.id, eventKey: pending.eventKey },
        });
        assert.equal(Number(event.completionEvidenceId), Number(evidence.id));
        assert.ok(event.appliedAt);
        const ledger = await runtime.models.XpTransaction.findOne({
          where: { completionEvidenceId: evidence.id },
        });
        assert.equal(Number(ledger.amount), Number(evidence.netCompletionXp));
        assert.equal(await analyticsCount(runtime, fixture), 1);

        const retry = await runtime.completionService.completeLevel(input);
        assert.equal(retry.completedNow, false);
        assert.equal(retry.xpAward.amount, 0);
        assert.equal(retry.xpAward.originalAmount, first.xpAward.originalAmount);
        assert.equal(await runtime.models.GameInterruptionCompletionEvidence.count({
          where: { studentId: fixture.student.id, levelKey: fixture.levelKey },
        }), 1);
        assert.equal(await xpCount(runtime, fixture), 1);
        assert.equal(await analyticsCount(runtime, fixture), 1);
      });

      await runScenario(WORKER_SCENARIO_IDS[1], "zero net XP persists evidence without inserting a prohibited zero ledger row", async () => {
        const fixture = await createFixture(runtime, { xpTotal: 7 });
        const classroom = fixture.classrooms[0];
        await runtime.models.LevelContentOverride.create({
          classroomId: classroom.id,
          levelKey: fixture.levelKey,
          interruptionScoreDeduction: 0,
          interruptionXpDeduction: 100,
        });
        const started = await startSession(runtime, fixture, classroom, "zero_session");
        assert.equal(started.session.xpDeductionSnapshot, 100);
        const pending = eventInput(fixture, classroom, started.session, "zero_event");
        const result = await runtime.completionService.completeLevel(completionInput(
          fixture,
          classroom,
          "zero_completion",
          [{ sessionId: pending.sessionId, eventKey: pending.eventKey, eventType: pending.eventType }],
        ));
        assert.equal(result.completionDeductions.xp.net, 0);
        assert.equal(result.xpAward.amount, 0);
        assert.equal(await xpCount(runtime, fixture), 0);
        const evidence = await evidenceFor(runtime, fixture);
        assert.equal(Number(evidence.netCompletionXp), 0);
        const progress = await runtime.models.UserProgress.findByPk(fixture.progress.id);
        const student = await runtime.models.User.findByPk(fixture.student.id);
        assert.ok(progress.xpAwardedAt);
        assert.equal(progress.xpAwarded, 0);
        assert.equal(student.xpTotal, 7);
      });

      await runScenario(WORKER_SCENARIO_IDS[2], "failure after the real XP award rolls back every completion write", async () => {
        const fixture = await createFixture(runtime, { xpTotal: 12 });
        const classroom = fixture.classrooms[0];
        const started = await startSession(runtime, fixture, classroom, "rollback_session");
        const pending = eventInput(fixture, classroom, started.session, "rollback_event");
        const injectedFailure = "phase7g_full_stack_after_xp";
        const rollbackService = runtime.createGameInterruptionCompletionService({
          xpAwarder: async (input, options) => {
            await runtime.awardCompletionXpFromEvidence(input, options);
            throw new Error(injectedFailure);
          },
        });
        await assert.rejects(
          rollbackService.completeLevel(completionInput(
            fixture,
            classroom,
            "rollback_completion",
            [{ sessionId: pending.sessionId, eventKey: pending.eventKey, eventType: pending.eventType }],
          )),
          new RegExp(injectedFailure),
        );
        const progress = await runtime.models.UserProgress.findByPk(fixture.progress.id);
        const student = await runtime.models.User.findByPk(fixture.student.id);
        const session = await runtime.models.GameInterruptionSession.findByPk(started.session.id);
        assert.equal(progress.isCompleted, false);
        assert.equal(progress.finalScore, null);
        assert.equal(progress.xpAwardedAt, null);
        assert.equal(student.xpTotal, 12);
        assert.equal(session.lifecycleStatus, "CURRENT");
        assert.equal(await evidenceFor(runtime, fixture), null);
        assert.equal(await runtime.models.GameInterruptionEvent.count({
          where: { studentId: fixture.student.id, eventKey: pending.eventKey },
        }), 0);
        assert.equal(await xpCount(runtime, fixture), 0);
        assert.equal(await analyticsCount(runtime, fixture), 0);
      });

      await runScenario(WORKER_SCENARIO_IDS[3], "cross-classroom first completion applies only the authoritative classroom event", async () => {
        const fixture = await createFixture(runtime, { classroomCount: 2 });
        const [leftClassroom, rightClassroom] = fixture.classrooms;
        const leftSession = (await startSession(runtime, fixture, leftClassroom, "left_session")).session;
        const rightSession = (await startSession(runtime, fixture, rightClassroom, "right_session")).session;
        const leftEvent = eventInput(fixture, leftClassroom, leftSession, "left_event", "hidden");
        const rightEvent = eventInput(
          fixture,
          rightClassroom,
          rightSession,
          "right_event",
          "fullscreen_exit",
        );
        await runtime.eventService.recordInterruptionEvent(leftEvent);
        await runtime.eventService.recordInterruptionEvent(rightEvent);
        const results = await Promise.all([
          runtime.completionService.completeLevel(completionInput(
            fixture,
            leftClassroom,
            "left_completion",
          )),
          runtime.completionService.completeLevel(completionInput(
            fixture,
            rightClassroom,
            "right_completion",
          )),
        ]);
        assert.equal(results.filter(({ completedNow }) => completedNow).length, 1);
        const evidence = await evidenceFor(runtime, fixture);
        assert.ok([leftClassroom.id, rightClassroom.id].includes(Number(evidence.classroomId)));
        const events = await runtime.models.GameInterruptionEvent.findAll({
          where: { studentId: fixture.student.id },
          order: [["id", "ASC"]],
        });
        assert.equal(events.length, 2);
        for (const event of events) {
          const session = Number(event.sessionId) === Number(leftSession.id) ? leftSession : rightSession;
          const shouldApply = Number(session.classroomId) === Number(evidence.classroomId);
          assert.equal(event.appliedAt != null, shouldApply);
          assert.equal(event.completionEvidenceId == null, !shouldApply);
        }
        assert.equal(await runtime.models.GameInterruptionCompletionEvidence.count({
          where: { studentId: fixture.student.id, levelKey: fixture.levelKey },
        }), 1);
        assert.equal(await xpCount(runtime, fixture), 1);
        assert.equal(await analyticsCount(runtime, fixture), 1);
        assert.equal(await runtime.models.GameInterruptionSession.count({
          where: { studentId: fixture.student.id, levelKey: fixture.levelKey, lifecycleStatus: "CURRENT" },
        }), 0);
      });

      await runScenario(WORKER_SCENARIO_IDS[4], "event and session requests holding production locks settle before completion deterministically", async () => {
        const eventFixture = await createFixture(runtime);
        const eventClassroom = eventFixture.classrooms[0];
        const eventSession = (await startSession(
          runtime,
          eventFixture,
          eventClassroom,
          "race_event_session",
        )).session;
        const eventEntered = deferred();
        const releaseEvent = deferred();
        const gatedEventService = runtime.createGameInterruptionEventService({
          levelAccessLoader: async (input) => {
            const access = await runtime.getStudentLevelAccess(input);
            eventEntered.resolve();
            await releaseEvent.promise;
            return access;
          },
        });
        const eventRequest = gatedEventService.recordInterruptionEvent(eventInput(
          eventFixture,
          eventClassroom,
          eventSession,
          "race_event",
        ));
        await eventEntered.promise;
        const eventCompletion = runtime.completionService.completeLevel(completionInput(
          eventFixture,
          eventClassroom,
          "race_event_completion",
        ));
        releaseEvent.resolve();
        await eventRequest;
        await eventCompletion;
        const recorded = await runtime.models.GameInterruptionEvent.findOne({
          where: { studentId: eventFixture.student.id, eventKey: `race_event_${eventFixture.suffix}` },
        });
        assert.ok(recorded.appliedAt);
        assert.ok(recorded.completionEvidenceId);

        const sessionFixture = await createFixture(runtime);
        const sessionClassroom = sessionFixture.classrooms[0];
        const sessionEntered = deferred();
        const releaseSession = deferred();
        const gatedSessionService = runtime.createGameInterruptionSessionService({
          levelAccessLoader: async (input) => {
            const access = await runtime.getStudentLevelAccess(input);
            sessionEntered.resolve();
            await releaseSession.promise;
            return access;
          },
        });
        const sessionRequest = gatedSessionService.startInterruptionSession({
          actorId: sessionFixture.student.id,
          actorRole: "student",
          classroomId: sessionClassroom.id,
          levelKey: sessionFixture.levelKey,
          sessionKey: `race_session_${sessionFixture.suffix}`,
        });
        await sessionEntered.promise;
        const sessionCompletion = runtime.completionService.completeLevel(completionInput(
          sessionFixture,
          sessionClassroom,
          "race_session_completion",
        ));
        releaseSession.resolve();
        const started = await sessionRequest;
        await sessionCompletion;
        const settled = await runtime.models.GameInterruptionSession.findByPk(started.session.id);
        assert.equal(settled.lifecycleStatus, "COMPLETED");
        assert.ok(settled.completedAt);
      });

      await runScenario(WORKER_SCENARIO_IDS[5], "completion holding production locks rejects later event and session mutations", async () => {
        const eventFixture = await createFixture(runtime);
        const eventClassroom = eventFixture.classrooms[0];
        const eventSession = (await startSession(
          runtime,
          eventFixture,
          eventClassroom,
          "completion_first_event_session",
        )).session;
        const eventCompletionEntered = deferred();
        const releaseEventCompletion = deferred();
        const gatedEventCompletionService = runtime.createGameInterruptionCompletionService({
          accessLoader: async (input) => {
            const access = await runtime.getStudentLevelAccess(input);
            eventCompletionEntered.resolve();
            await releaseEventCompletion.promise;
            return access;
          },
        });
        const eventCompletion = gatedEventCompletionService.completeLevel(completionInput(
          eventFixture,
          eventClassroom,
          "completion_first_event",
        ));
        await eventCompletionEntered.promise;
        const lateEvent = runtime.eventService.recordInterruptionEvent(eventInput(
          eventFixture,
          eventClassroom,
          eventSession,
          "completion_first_late_event",
        ));
        releaseEventCompletion.resolve();
        await eventCompletion;
        await assert.rejects(lateEvent, (error) => (
          ["LEVEL_ALREADY_COMPLETED", "SESSION_NOT_CURRENT"].includes(error?.code)
        ));
        assert.equal(await runtime.models.GameInterruptionEvent.count({
          where: {
            studentId: eventFixture.student.id,
            eventKey: `completion_first_late_event_${eventFixture.suffix}`,
          },
        }), 0);

        const sessionFixture = await createFixture(runtime);
        const sessionClassroom = sessionFixture.classrooms[0];
        const sessionCompletionEntered = deferred();
        const releaseSessionCompletion = deferred();
        const gatedSessionCompletionService = runtime.createGameInterruptionCompletionService({
          accessLoader: async (input) => {
            const access = await runtime.getStudentLevelAccess(input);
            sessionCompletionEntered.resolve();
            await releaseSessionCompletion.promise;
            return access;
          },
        });
        const sessionCompletion = gatedSessionCompletionService.completeLevel(completionInput(
          sessionFixture,
          sessionClassroom,
          "completion_first_session",
        ));
        await sessionCompletionEntered.promise;
        const lateSession = runtime.sessionService.startInterruptionSession({
          actorId: sessionFixture.student.id,
          actorRole: "student",
          classroomId: sessionClassroom.id,
          levelKey: sessionFixture.levelKey,
          sessionKey: `completion_first_late_session_${sessionFixture.suffix}`,
        });
        releaseSessionCompletion.resolve();
        await sessionCompletion;
        await assert.rejects(lateSession, (error) => error?.code === "LEVEL_ALREADY_COMPLETED");
        assert.equal(await runtime.models.GameInterruptionSession.count({
          where: {
            studentId: sessionFixture.student.id,
            sessionKey: `completion_first_late_session_${sessionFixture.suffix}`,
          },
        }), 0);
      });
    } finally {
      // Immutable evidence and RESTRICT history are intentionally retained.
      // The explicitly marked disposable database is the isolation and cleanup boundary.
      await runtime.database.close();
    }
    assert.deepEqual(
      completedScenarios,
      WORKER_SCENARIO_IDS.map((id) => ({ id, status: "passed" })),
      "all full-stack PostgreSQL scenarios must complete before acknowledgement",
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
  postgresTest("guarded full-schema interruption completion integration", {
    timeout: 150000,
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
