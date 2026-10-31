const assert = require("node:assert/strict");
const { test } = require("node:test");

const buildHarness = ({
  actorRole = "teacher",
  classroom = {
    id: 25,
    teacherId: 7,
    className: "Section A",
    section: "A",
    isActive: true,
  },
  membership = { classroomId: 25, studentId: 11, status: "active" },
  student = {
    id: 11,
    role: "student",
    status: "active",
    firstName: "Test",
    lastName: "Student",
    username: "teststudent",
  },
  summary = {
    recordedEventCount: "3",
    appliedEventCount: "2",
    unappliedEventCount: "1",
    actualScoreDeduction: "0.00",
    actualXpDeduction: "10",
    minimumEvidenceId: "44",
    maximumEvidenceId: "44",
  },
  sessionTotal = "2",
  sessions = [{
    id: 71,
    lifecycleStatus: "SUPERSEDED",
    startedAt: new Date("2026-10-30T00:00:00.000Z"),
    supersededAt: new Date("2026-10-30T00:10:00.000Z"),
    completedAt: null,
    scoreDeductionSnapshot: "0.25",
    xpDeductionSnapshot: 0,
    recordedEventCount: "2",
    appliedEventCount: "1",
    unappliedEventCount: "1",
    actualScoreDeduction: "0.00",
    actualXpDeduction: "0",
  }, {
    id: 70,
    lifecycleStatus: "COMPLETED",
    startedAt: new Date("2026-10-29T00:00:00.000Z"),
    supersededAt: null,
    completedAt: new Date("2026-10-30T00:20:00.000Z"),
    scoreDeductionSnapshot: "1.00",
    xpDeductionSnapshot: 10,
    recordedEventCount: "1",
    appliedEventCount: "1",
    unappliedEventCount: "0",
    actualScoreDeduction: "0.00",
    actualXpDeduction: "10",
  }],
  eventTotal = "3",
  events = [{
    id: 101,
    sessionId: 71,
    eventType: "fullscreen_exit",
    receivedAt: new Date("2026-10-30T00:05:00.000Z"),
    appliedAt: new Date("2026-10-30T00:20:00.000Z"),
    appliedScoreDeduction: "0.00",
    appliedXpDeduction: 0,
    completionEvidenceId: 44,
  }, {
    id: 100,
    sessionId: 71,
    eventType: "hidden",
    receivedAt: new Date("2026-10-30T00:04:00.000Z"),
    appliedAt: null,
    appliedScoreDeduction: null,
    appliedXpDeduction: null,
    completionEvidenceId: null,
  }],
  evidence = {
    id: 44,
    studentId: 11,
    classroomId: 25,
    levelKey: "tutorial-level-1",
    policyVersion: "interruption-deductions-v1",
    appliedEventCount: 2,
    baseScore: "95.00",
    scoreDeduction: "0.00",
    finalScore: "95.00",
    grossCompletionXp: 20,
    xpDeduction: 10,
    netCompletionXp: 10,
    completedAt: new Date("2026-10-30T00:20:00.000Z"),
  },
} = {}) => {
  const calls = [];
  const transaction = { id: "report-transaction" };
  const database = {
    async transaction(options, callback) {
      calls.push({ kind: "transaction", options });
      return callback(transaction);
    },
    async query(sql, options) {
      const marker = /report:([a-z-]+)/.exec(sql)?.[1];
      calls.push({ kind: "query", marker, options, sql });
      if (marker === "summary") return [summary];
      if (marker === "session-count") return [{ total: sessionTotal }];
      if (marker === "sessions") return sessions;
      if (marker === "event-count") return [{ total: eventTotal }];
      if (marker === "events") return events;
      throw new Error(`Unexpected report query: ${marker}`);
    },
  };
  const models = {
    Classroom: {
      async findOne(options) {
        calls.push({ kind: "classroom", options });
        return classroom;
      },
    },
    ClassroomMembership: {
      async findOne(options) {
        calls.push({ kind: "membership", options });
        return membership;
      },
    },
    User: {
      async findOne(options) {
        calls.push({ kind: "student", options });
        return student;
      },
    },
    GameInterruptionCompletionEvidence: {
      async findOne(options) {
        calls.push({ kind: "evidence", options });
        return evidence;
      },
    },
  };
  return { actorRole, calls, database, models, transaction };
};

const input = (extra = {}) => ({
  actorId: 7,
  actorRole: "teacher",
  classroomId: 25,
  studentId: 11,
  levelKey: "tutorial-level-1",
  sessionPage: 1,
  sessionLimit: 20,
  sessionOffset: 0,
  eventPage: 1,
  eventLimit: 20,
  eventOffset: 0,
  ...extra,
});

test("teacher interruption report authorizes exact active scope before returning allowlisted applied and unapplied history", async () => {
  const {
    createTeacherGameInterruptionReportService,
  } = require("../src/services/teacherGameInterruptionReportService");
  const harness = buildHarness();
  const service = createTeacherGameInterruptionReportService({
    database: harness.database,
    models: harness.models,
    now: () => new Date("2026-10-31T00:00:00.000Z"),
  });

  const result = await service.getTeacherGameInterruptionReport(input());

  assert.deepEqual(result.scope, {
    classroom: { id: 25, className: "Section A", section: "A", isActive: true },
    student: {
      id: 11,
      firstName: "Test",
      lastName: "Student",
      username: "teststudent",
    },
    level: {
      levelKey: "tutorial-level-1",
      lessonTitle: "Tutorial: First Compile Trial",
      levelNumber: 1,
    },
  });
  assert.deepEqual(result.summary, {
    recordedEventCount: 3,
    appliedEventCount: 2,
    unappliedEventCount: 1,
    actualScoreDeduction: 0,
    actualXpDeduction: 10,
  });
  assert.equal(result.sessions.total, 2);
  assert.deepEqual(result.sessions.items[0], {
    id: 71,
    lifecycleStatus: "SUPERSEDED",
    startedAt: new Date("2026-10-30T00:00:00.000Z"),
    supersededAt: new Date("2026-10-30T00:10:00.000Z"),
    completedAt: null,
    scoreDeductionSnapshot: 0.25,
    xpDeductionSnapshot: 0,
    recordedEventCount: 2,
    appliedEventCount: 1,
    unappliedEventCount: 1,
    actualScoreDeduction: 0,
    actualXpDeduction: 0,
  });
  assert.deepEqual(result.sessions.items[1], {
    id: 70,
    lifecycleStatus: "COMPLETED",
    startedAt: new Date("2026-10-29T00:00:00.000Z"),
    supersededAt: null,
    completedAt: new Date("2026-10-30T00:20:00.000Z"),
    scoreDeductionSnapshot: 1,
    xpDeductionSnapshot: 10,
    recordedEventCount: 1,
    appliedEventCount: 1,
    unappliedEventCount: 0,
    actualScoreDeduction: 0,
    actualXpDeduction: 10,
  });
  assert.equal(result.events.total, 3);
  assert.deepEqual(result.events.items.map((event) => ({
    id: event.id,
    applicationStatus: event.applicationStatus,
    actualScoreDeduction: event.actualScoreDeduction,
    actualXpDeduction: event.actualXpDeduction,
  })), [
    { id: 101, applicationStatus: "applied", actualScoreDeduction: 0, actualXpDeduction: 0 },
    { id: 100, applicationStatus: "unapplied", actualScoreDeduction: null, actualXpDeduction: null },
  ]);
  assert.equal(result.completionEvidence.availability, "available");
  assert.equal(result.completionEvidence.eventCount, 2);
  assert.equal(result.generatedAt.toISOString(), "2026-10-31T00:00:00.000Z");
  assert.equal("sessionKey" in result.sessions.items[0], false);
  assert.equal("eventKey" in result.events.items[0], false);
  assert.equal("completionEvidenceId" in result.events.items[0], false);
  assert.deepEqual(Object.keys(result.events.items[0]), [
    "id",
    "sessionId",
    "type",
    "receivedAt",
    "applicationStatus",
    "appliedAt",
    "actualScoreDeduction",
    "actualXpDeduction",
  ]);
  assert.deepEqual(Object.keys(result.completionEvidence), [
    "availability",
    "policyVersion",
    "eventCount",
    "completedAt",
    "score",
    "xp",
  ]);

  const classroomCall = harness.calls.find((call) => call.kind === "classroom");
  const transactionCall = harness.calls.find((call) => call.kind === "transaction");
  assert.equal(transactionCall.options.readOnly, true);
  assert.equal(transactionCall.options.isolationLevel, "REPEATABLE READ");
  assert.deepEqual(classroomCall.options.where, { id: 25, teacherId: 7, isActive: true });
  assert.equal(classroomCall.options.transaction, harness.transaction);
  assert.equal(harness.calls.find((call) => call.kind === "membership").options.transaction, harness.transaction);
  assert.equal(harness.calls.find((call) => call.kind === "student").options.transaction, harness.transaction);
  assert.ok(harness.calls.filter((call) => call.kind === "query").every(
    (call) => call.options.transaction === harness.transaction
      && call.options.replacements.studentId === 11
      && call.options.replacements.classroomId === 25
      && call.options.replacements.levelKey === "tutorial-level-1",
  ));
  assert.ok(harness.calls.filter((call) => call.kind === "query").every(
    (call) => /s\."studentId" = :studentId/.test(call.sql)
      && /s\."classroomId" = :classroomId/.test(call.sql)
      && /s\."levelKey" = :levelKey/.test(call.sql),
  ));
});

test("teacher interruption report preserves administrator override without weakening teacher ownership", async () => {
  const {
    createTeacherGameInterruptionReportService,
  } = require("../src/services/teacherGameInterruptionReportService");
  const harness = buildHarness({ actorRole: "admin" });
  const service = createTeacherGameInterruptionReportService({ database: harness.database, models: harness.models });
  await service.getTeacherGameInterruptionReport(input({ actorId: 99, actorRole: "admin" }));
  assert.deepEqual(harness.calls.find((call) => call.kind === "classroom").options.where, {
    id: 25,
    isActive: true,
  });
});

test("authorization failures occur before any interruption history read", async () => {
  const {
    createTeacherGameInterruptionReportService,
    TeacherGameInterruptionReportError,
  } = require("../src/services/teacherGameInterruptionReportService");
  for (const harness of [
    buildHarness({ classroom: null }),
    buildHarness({ membership: null }),
    buildHarness({ student: null }),
  ]) {
    const service = createTeacherGameInterruptionReportService({ database: harness.database, models: harness.models });
    await assert.rejects(
      service.getTeacherGameInterruptionReport(input()),
      (error) => error instanceof TeacherGameInterruptionReportError && error.status === 403,
    );
    assert.equal(harness.calls.some((call) => call.kind === "query" || call.kind === "evidence"), false);
  }
});

test("report validates exact scope and returns neutral integrity failures without exposing other-classroom evidence", async () => {
  const {
    createTeacherGameInterruptionReportService,
    TeacherGameInterruptionReportError,
  } = require("../src/services/teacherGameInterruptionReportService");

  const unavailableHarness = buildHarness({
    summary: {
      recordedEventCount: "2",
      appliedEventCount: "0",
      unappliedEventCount: "2",
      actualScoreDeduction: "0.00",
      actualXpDeduction: "0",
      minimumEvidenceId: null,
      maximumEvidenceId: null,
    },
    events: [{
      id: 100,
      sessionId: 71,
      eventType: "hidden",
      receivedAt: new Date("2026-10-30T00:04:00.000Z"),
      appliedAt: null,
      appliedScoreDeduction: null,
      appliedXpDeduction: null,
      completionEvidenceId: null,
    }],
    evidence: null,
  });
  const unavailableService = createTeacherGameInterruptionReportService({
    database: unavailableHarness.database,
    models: unavailableHarness.models,
  });
  const unavailable = await unavailableService.getTeacherGameInterruptionReport(input());
  assert.deepEqual(unavailable.completionEvidence, { availability: "unavailable" });
  assert.equal(unavailable.summary.recordedEventCount, 2);
  assert.deepEqual(
    unavailableHarness.calls.find((call) => call.kind === "evidence").options.where,
    { studentId: 11, classroomId: 25, levelKey: "tutorial-level-1" },
  );

  for (const harness of [
    buildHarness({
      evidence: {
        id: 44, studentId: 11, classroomId: 99, levelKey: "tutorial-level-1",
        policyVersion: "v1", appliedEventCount: 2, baseScore: "95.00",
        scoreDeduction: "0.00", finalScore: "95.00", grossCompletionXp: 20,
        xpDeduction: 10, netCompletionXp: 10, completedAt: new Date(),
      },
    }),
    buildHarness({
      evidence: {
        id: 44, studentId: 11, classroomId: 25, levelKey: "tutorial-level-1",
        policyVersion: "v1", appliedEventCount: 3, baseScore: "95.00",
        scoreDeduction: "0.00", finalScore: "95.00", grossCompletionXp: 20,
        xpDeduction: 10, netCompletionXp: 10, completedAt: new Date(),
      },
    }),
    buildHarness({
      summary: {
        recordedEventCount: "1", appliedEventCount: "1", unappliedEventCount: "0",
        actualScoreDeduction: "0.00", actualXpDeduction: "0",
        minimumEvidenceId: "45", maximumEvidenceId: "45",
      },
    }),
  ]) {
    const service = createTeacherGameInterruptionReportService({ database: harness.database, models: harness.models });
    await assert.rejects(
      service.getTeacherGameInterruptionReport(input()),
      (error) => error instanceof TeacherGameInterruptionReportError
        && error.status === 409
        && error.code === "REPORT_INTEGRITY_ERROR",
    );
  }
});

test("zero-event completion evidence remains available without fabricated linked event IDs", async () => {
  const {
    createTeacherGameInterruptionReportService,
  } = require("../src/services/teacherGameInterruptionReportService");
  const harness = buildHarness({
    summary: {
      recordedEventCount: "0",
      appliedEventCount: "0",
      unappliedEventCount: "0",
      actualScoreDeduction: "0.00",
      actualXpDeduction: "0",
      minimumEvidenceId: null,
      maximumEvidenceId: null,
    },
    sessionTotal: "0",
    sessions: [],
    eventTotal: "0",
    events: [],
    evidence: {
      id: 44,
      studentId: 11,
      classroomId: 25,
      levelKey: "tutorial-level-1",
      policyVersion: "interruption-deductions-v1",
      appliedEventCount: 0,
      baseScore: "95.00",
      scoreDeduction: "0.00",
      finalScore: "95.00",
      grossCompletionXp: 20,
      xpDeduction: 0,
      netCompletionXp: 20,
      completedAt: new Date("2026-10-30T00:20:00.000Z"),
    },
  });
  const service = createTeacherGameInterruptionReportService({ database: harness.database, models: harness.models });
  const result = await service.getTeacherGameInterruptionReport(input());
  assert.equal(result.completionEvidence.availability, "available");
  assert.equal(result.completionEvidence.eventCount, 0);
  assert.equal(result.summary.recordedEventCount, 0);
});

test("report query count is constant as bounded page rows grow and validates service inputs", async () => {
  const {
    createTeacherGameInterruptionReportService,
    TeacherGameInterruptionReportError,
  } = require("../src/services/teacherGameInterruptionReportService");
  const rows = Array.from({ length: 20 }, (_, index) => ({
    id: 500 - index,
    sessionId: 71,
    eventType: index % 2 ? "hidden" : "fullscreen_exit",
    receivedAt: new Date(1_800_000_000_000 - index),
    appliedAt: null,
    appliedScoreDeduction: null,
    appliedXpDeduction: null,
    completionEvidenceId: null,
  }));
  for (const events of [[], rows]) {
    const harness = buildHarness({ events });
    const service = createTeacherGameInterruptionReportService({ database: harness.database, models: harness.models });
    await service.getTeacherGameInterruptionReport(input());
    assert.equal(harness.calls.filter((call) => call.kind === "query").length, 5);
    const sessionQuery = harness.calls.find((call) => call.marker === "sessions");
    const eventQuery = harness.calls.find((call) => call.marker === "events");
    assert.match(sessionQuery.sql, /ORDER BY s\."startedAt" DESC, s\."id" DESC/);
    assert.match(eventQuery.sql, /ORDER BY e\."receivedAt" DESC, e\."id" DESC/);
    assert.equal(sessionQuery.options.replacements.limit, 20);
    assert.equal(eventQuery.options.replacements.limit, 20);
  }

  const harness = buildHarness();
  const service = createTeacherGameInterruptionReportService({ database: harness.database, models: harness.models });
  for (const invalid of [
    input({ actorRole: "student" }),
    input({ classroomId: 0 }),
    input({ studentId: Number.MAX_SAFE_INTEGER + 1 }),
    input({ levelKey: "not-a-level" }),
    input({ eventOffset: 1 }),
    input({ sessionLimit: 101 }),
  ]) {
    await assert.rejects(
      service.getTeacherGameInterruptionReport(invalid),
      (error) => error instanceof TeacherGameInterruptionReportError && error.status === 400,
    );
  }
});
