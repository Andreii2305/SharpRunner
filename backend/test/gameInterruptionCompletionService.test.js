const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const { test } = require("node:test");

const {
  GameInterruptionCompletionError,
  createGameInterruptionCompletionService,
} = require("../src/services/gameInterruptionCompletionService");

const LEVEL_KEY = "tutorial-level-1";
const COMPLETED_AT = new Date("2026-10-29T08:00:00.000Z");

const row = (values, state, kind) => ({
  ...values,
  get() {
    return Object.fromEntries(Object.entries(this).filter(([, value]) => typeof value !== "function"));
  },
  async save() {
    if (state.failAt === kind) throw new Error(`${kind} write failed`);
    state.writes.push(kind);
    return this;
  },
});

const snapshotRecord = (record) => Object.fromEntries(
  Object.entries(record).filter(([, value]) => typeof value !== "function"),
);

const restoreRecord = (record, values) => {
  for (const key of Object.keys(record)) {
    if (typeof record[key] !== "function" && !(key in values)) delete record[key];
  }
  Object.assign(record, values);
};

const createHarness = ({
  events = [], sessions = [], evidence = null, progressValues = {}, userValues = {},
  classroomValues = {}, membershipValues = {}, access = { allowed: true, effectiveDueAt: null },
  analyticsRecord: analyticsRecordInput = undefined, failAt = null,
} = {}) => {
  const state = {
    writes: [], transactionCount: 0, analyticsWrites: 0, xpCalls: 0,
    pendingCalls: 0, pendingEntries: [], evidenceRows: [], reads: [], failAt,
  };
  const classroom = row({ id: 25, isActive: true, ...classroomValues }, state, "classroom");
  const membership = row({ id: 7, classroomId: 25, studentId: 11, status: "active", ...membershipValues }, state, "membership");
  const user = row({ id: 11, role: "student", status: "active", xpTotal: 100, ...userValues }, state, "user");
  const progress = row({
    id: 5, userId: 11, levelKey: LEVEL_KEY, orderIndex: 1, progressPercent: 50,
    isCompleted: false, completedAt: null, attemptCount: 0, timeSpentSeconds: 0,
    hintUsed: false, activeSessionId: null, finalScore: null, xpAwarded: 0,
    xpAwardedAt: null, ...progressValues,
  }, state, "progress");
  const sessionRows = sessions.map((values) => row(values, state, "session"));
  const eventRows = events.map((values) => row({
    appliedAt: null, appliedScoreDeduction: null, appliedXpDeduction: null,
    completionEvidenceId: null, ...values,
  }, state, "event"));
  if (evidence) state.evidenceRows.push(row(evidence, state, "evidence"));
  state.analyticsRecord = analyticsRecordInput === undefined && evidence
    ? {
        studentId: evidence.studentId,
        classroomId: evidence.classroomId,
        levelKey: evidence.levelKey,
        eventType: "level_completed",
        score: Number(evidence.finalScore),
        occurredAt: evidence.completedAt,
      }
    : analyticsRecordInput;

  const takeSnapshot = () => ({
    user: snapshotRecord(user), progress: snapshotRecord(progress),
    sessions: sessionRows.map(snapshotRecord), events: eventRows.map(snapshotRecord),
    evidenceRows: [...state.evidenceRows], writesLength: state.writes.length,
    analyticsWrites: state.analyticsWrites, analyticsRecord: state.analyticsRecord,
    xpCalls: state.xpCalls,
  });
  const rollback = (before) => {
    restoreRecord(user, before.user);
    restoreRecord(progress, before.progress);
    sessionRows.forEach((record, index) => restoreRecord(record, before.sessions[index]));
    eventRows.forEach((record, index) => restoreRecord(record, before.events[index]));
    state.evidenceRows.splice(0, state.evidenceRows.length, ...before.evidenceRows);
    state.writes.length = before.writesLength;
    state.analyticsWrites = before.analyticsWrites;
    state.analyticsRecord = before.analyticsRecord;
    state.xpCalls = before.xpCalls;
  };
  const database = {
    async transaction(callback) {
      state.transactionCount += 1;
      const before = takeSnapshot();
      const transaction = { LOCK: { UPDATE: "UPDATE" }, finished: false };
      try {
        return await callback(transaction);
      } catch (error) {
        rollback(before);
        throw error;
      } finally {
        transaction.finished = true;
      }
    },
  };
  const models = {
    Classroom: { findByPk: async () => { state.reads.push("classroom"); return classroom; } },
    ClassroomMembership: { findOne: async () => { state.reads.push("membership"); return membership; } },
    User: { findByPk: async () => { state.reads.push("user"); return user; } },
    UserProgress: {
      findOne: async () => { state.reads.push("progress"); return progress; },
      findAll: async () => [progress],
    },
    GameInterruptionSession: {
      findAll: async () => {
        state.reads.push("sessions");
        return sessionRows.slice().sort((left, right) => left.id - right.id);
      },
    },
    GameInterruptionCompletionEvidence: {
      findOne: async () => state.evidenceRows[0] ?? null,
      create: async (values) => {
        if (failAt === "evidence") throw new Error("evidence write failed");
        const created = row({ id: 40, ...values }, state, "evidence");
        state.evidenceRows.push(created);
        state.writes.push("evidence-create");
        return created;
      },
    },
    GameInterruptionEvent: {
      findAll: async ({ where }) => {
        if (where.completionEvidenceId !== undefined) {
          return eventRows.filter((event) => Number(event.completionEvidenceId) === Number(where.completionEvidenceId));
        }
        const sessionIds = where.sessionId?.[Op.in] ?? [];
        return eventRows.filter((event) => (
          Number(event.studentId) === Number(where.studentId)
          && sessionIds.includes(Number(event.sessionId))
          && (!("appliedAt" in where) || event.appliedAt == null)
        )).sort((left, right) => (
          new Date(left.receivedAt) - new Date(right.receivedAt) || left.id - right.id
        ));
      },
    },
  };
  const pendingEventRecorder = async ({ entries, sessions: lockedSessions }) => {
    state.pendingCalls += 1;
    state.pendingEntries.push(...entries);
    if (entries.length && failAt === "pending") throw new Error("pending insert failed");
    const lockedById = new Map(lockedSessions.map((session) => [Number(session.id), session]));
    return entries.map((entry) => {
      const existing = eventRows.find((event) => event.eventKey === entry.eventKey);
      if (existing) {
        if (Number(existing.sessionId) !== Number(entry.sessionId)
          || existing.eventType !== entry.eventType) {
          const error = new Error("Event key conflict");
          error.code = "EVENT_KEY_CONFLICT";
          throw error;
        }
        return { changed: false, event: existing };
      }
      const session = lockedById.get(Number(entry.sessionId));
      if (!session || session.lifecycleStatus !== "CURRENT") {
        const error = new Error("Interruption session is not current");
        error.code = "SESSION_NOT_CURRENT";
        throw error;
      }
      const created = row({
        id: eventRows.length + 100,
        sessionId: Number(entry.sessionId),
        studentId: 11,
        eventKey: entry.eventKey,
        eventType: entry.eventType,
        receivedAt: new Date(COMPLETED_AT.getTime() - 1000),
        appliedAt: null,
        appliedScoreDeduction: null,
        appliedXpDeduction: null,
        completionEvidenceId: null,
      }, state, "event");
      eventRows.push(created);
      state.writes.push("event-create");
      return { changed: true, event: created };
    });
  };
  const xpAwarder = async ({ completionEvidenceId }) => {
    state.xpCalls += 1;
    if (failAt === "xp") throw new Error("XP write failed");
    const evidenceRow = state.evidenceRows.find((item) => item.id === completionEvidenceId);
    const netAmount = Number(evidenceRow.netCompletionXp);
    if (progress.xpAwardedAt != null) {
      return {
        changed: false, xpGrantedNow: 0, totalXp: user.xpTotal,
        completionAward: { netAmount, breakdown: [{ key: "net", label: "Net completion XP", amount: netAmount }] },
      };
    }
    user.xpTotal += netAmount;
    progress.xpAwarded = netAmount;
    progress.xpAwardedAt = COMPLETED_AT;
    return {
      changed: true, xpGrantedNow: netAmount, totalXp: user.xpTotal,
      completionAward: { netAmount, breakdown: [{ key: "net", label: "Net completion XP", amount: netAmount }] },
    };
  };
  const service = createGameInterruptionCompletionService({
    database, models,
    settingsLoader: async () => [{
      levelKey: LEVEL_KEY, isEnabled: true, wrongAttemptDeduction: 5, lateDeductionPerDay: 3,
    }],
    accessLoader: async () => access,
    pendingEventRecorder,
    completionXpBuilder: () => ({ total: 25 }),
    completionAnalyticsFinder: async () => state.analyticsRecord ?? null,
    progressSessionPauser: async () => undefined,
    completionAnalyticsRecorder: async (values) => {
      if (failAt === "analytics") throw new Error("analytics write failed");
      state.analyticsWrites += 1;
      state.analyticsRecord = {
        studentId: values.studentId,
        classroomId: values.classroomId,
        levelKey: values.levelKey,
        eventType: "level_completed",
        score: values.score,
        occurredAt: values.occurredAt,
      };
    },
    scoreCalculator: () => 95,
    parTimeLoader: () => 60,
    xpAwarder,
    now: () => COMPLETED_AT,
  });
  const complete = (overrides = {}) => service.completeLevel({
    actorId: 11, actorRole: "student", classroomId: 25,
    classroomWasExplicit: sessionRows.length > 0, levelKey: LEVEL_KEY,
    completionActionId: "completion_action_123", completionOccurredAt: COMPLETED_AT,
    interruptionEvents: [], ...overrides,
  });
  return { complete, eventRows, progress, sessionRows, state, user };
};

test("first completion persists zero-event evidence and preserves legacy score and XP", async () => {
  const harness = createHarness();
  const result = await harness.complete({ classroomWasExplicit: false });
  assert.equal(result.completedNow, true);
  assert.equal(result.levelRow, harness.progress);
  assert.deepEqual(result.completionDeductions, {
    policyVersion: "game-interruption-deduction/v1", classroomId: 25, levelKey: LEVEL_KEY,
    eventCount: 0, score: { base: 95, deducted: 0, final: 95 },
    xp: { gross: 25, deducted: 0, net: 25 },
  });
  assert.equal(result.xpAward.awarded, true);
  assert.equal(result.xpAward.amount, 25);
  assert.equal(result.xpAward.originalAmount, 25);
  assert.equal(harness.progress.finalScore, 95);
  assert.equal(harness.progress.xpAwarded, 25);
  assert.equal(harness.user.xpTotal, 125);
  assert.equal(harness.state.analyticsWrites, 1);
  assert.deepEqual(harness.state.reads.slice(0, 5), [
    "classroom", "membership", "user", "progress", "sessions",
  ]);
});

test("pending events are inserted then applied in the same completion transaction", async () => {
  const harness = createHarness({ sessions: [{
    id: 2, studentId: 11, classroomId: 25, levelKey: LEVEL_KEY,
    lifecycleStatus: "CURRENT", scoreDeductionSnapshot: "1.00", xpDeductionSnapshot: 10,
  }] });
  const result = await harness.complete({
    interruptionEvents: [{ sessionId: 2, eventKey: "pending_event_001", eventType: "hidden" }],
  });
  assert.equal(result.completionDeductions.eventCount, 1);
  assert.deepEqual(result.completionDeductions.score, { base: 95, deducted: 1, final: 94 });
  assert.deepEqual(result.completionDeductions.xp, { gross: 25, deducted: 10, net: 15 });
  assert.equal(harness.eventRows.length, 1);
  assert.equal(harness.eventRows[0].completionEvidenceId, 40);
  assert.equal(harness.state.pendingCalls, 1);
});

test("all exact-classroom current and superseded events use snapshotted mixed rates", async () => {
  const sessions = [
    { id: 2, studentId: 11, classroomId: 25, levelKey: LEVEL_KEY, lifecycleStatus: "SUPERSEDED", scoreDeductionSnapshot: "0.25", xpDeductionSnapshot: 10 },
    { id: 3, studentId: 11, classroomId: 25, levelKey: LEVEL_KEY, lifecycleStatus: "CURRENT", scoreDeductionSnapshot: "1.00", xpDeductionSnapshot: 20 },
    { id: 4, studentId: 11, classroomId: 26, levelKey: LEVEL_KEY, lifecycleStatus: "CURRENT", scoreDeductionSnapshot: "5.00", xpDeductionSnapshot: 50 },
  ];
  const events = [
    { id: 20, sessionId: 3, studentId: 11, eventKey: "event_key_20", eventType: "hidden", receivedAt: "2026-10-29T07:02:00Z" },
    { id: 10, sessionId: 2, studentId: 11, eventKey: "event_key_10", eventType: "fullscreen_exit", receivedAt: "2026-10-29T07:01:00Z" },
    { id: 30, sessionId: 4, studentId: 11, eventKey: "event_key_30", eventType: "hidden", receivedAt: "2026-10-29T07:00:00Z" },
  ];
  const harness = createHarness({ sessions, events });
  const result = await harness.complete();
  assert.deepEqual(result.completionDeductions.score, { base: 95, deducted: 1.25, final: 93.75 });
  assert.deepEqual(result.completionDeductions.xp, { gross: 25, deducted: 25, net: 0 });
  assert.equal(result.completionDeductions.eventCount, 2);
  assert.equal(harness.eventRows[0].completionEvidenceId, 40);
  assert.equal(harness.eventRows[1].completionEvidenceId, 40);
  assert.equal(harness.eventRows[2].completionEvidenceId, null);
  assert.equal(harness.sessionRows[0].lifecycleStatus, "SUPERSEDED");
  assert.equal(harness.sessionRows[1].lifecycleStatus, "COMPLETED");
  assert.equal(harness.sessionRows[2].lifecycleStatus, "COMPLETED");
  assert.equal(harness.user.xpTotal, 100);
});

test("stored event history is not limited by the 100-entry pending batch bound", async () => {
  const sessions = [{ id: 2, studentId: 11, classroomId: 25, levelKey: LEVEL_KEY, lifecycleStatus: "CURRENT", scoreDeductionSnapshot: "0.10", xpDeductionSnapshot: 1 }];
  const events = Array.from({ length: 101 }, (_, index) => ({
    id: index + 1, sessionId: 2, studentId: 11,
    eventKey: `stored_event_${String(index).padStart(3, "0")}`, eventType: "hidden",
    receivedAt: new Date(COMPLETED_AT.getTime() - (101 - index) * 1000),
  }));
  const harness = createHarness({ sessions, events });
  const result = await harness.complete();
  assert.equal(result.completionDeductions.eventCount, 101);
  assert.equal(result.completionDeductions.score.final, 84.9);
  assert.equal(result.completionDeductions.xp.net, 0);
  assert.equal(harness.eventRows.filter((event) => event.completionEvidenceId === 40).length, 101);
});

test("completed retries use immutable evidence and do not repeat analytics or awards", async () => {
  const sessions = [{ id: 2, studentId: 11, classroomId: 25, levelKey: LEVEL_KEY, lifecycleStatus: "COMPLETED", scoreDeductionSnapshot: "1.00", xpDeductionSnapshot: 10 }];
  const events = [{
    id: 10, sessionId: 2, studentId: 11, eventKey: "event_key_10", eventType: "hidden",
    receivedAt: "2026-10-29T07:01:00Z", appliedAt: COMPLETED_AT,
    appliedScoreDeduction: "1.00", appliedXpDeduction: 10, completionEvidenceId: 40,
  }];
  const evidence = {
    id: 40, studentId: 11, classroomId: 25, levelKey: LEVEL_KEY,
    policyVersion: "game-interruption-deduction/v1", appliedEventCount: 1,
    baseScore: "95.00", scoreDeduction: "1.00", finalScore: "94.00",
    grossCompletionXp: 25, xpDeduction: 10, netCompletionXp: 15, completedAt: COMPLETED_AT,
  };
  const harness = createHarness({
    sessions, events, evidence,
    progressValues: { progressPercent: 100, isCompleted: true, completedAt: COMPLETED_AT, finalScore: 94, xpAwarded: 15, xpAwardedAt: COMPLETED_AT },
    userValues: { xpTotal: 115 },
  });
  const result = await harness.complete();
  assert.equal(result.completedNow, false);
  assert.equal(result.xpAward.awarded, false);
  assert.equal(result.xpAward.amount, 0);
  assert.equal(result.xpAward.originalAmount, 15);
  assert.equal(harness.state.analyticsWrites, 0);
  assert.equal(harness.state.evidenceRows.length, 1);
  assert.deepEqual(harness.state.writes, []);
});

test("completed retries reject progress score or completion-time contradictions before writes", async () => {
  const evidence = {
    id: 40, studentId: 11, classroomId: 25, levelKey: LEVEL_KEY,
    policyVersion: "game-interruption-deduction/v1", appliedEventCount: 0,
    baseScore: "95.00", scoreDeduction: "0.00", finalScore: "95.00",
    grossCompletionXp: 25, xpDeduction: 0, netCompletionXp: 25, completedAt: COMPLETED_AT,
  };
  const cases = [
    { finalScore: "94.99", completedAt: COMPLETED_AT },
    { finalScore: 95, completedAt: new Date(COMPLETED_AT.getTime() + 1) },
  ];
  for (const progressValues of cases) {
    const harness = createHarness({
      evidence,
      progressValues: {
        isCompleted: true, progressPercent: 100, xpAwarded: 25,
        xpAwardedAt: COMPLETED_AT, ...progressValues,
      },
    });
    await assert.rejects(
      harness.complete({ classroomWasExplicit: false }),
      (error) => error.code === "COMPLETION_INTEGRITY_ERROR",
    );
    assert.equal(harness.state.xpCalls, 0);
    assert.equal(harness.state.analyticsWrites, 0);
    assert.deepEqual(harness.state.writes, []);
  }
});

test("completed retries reject missing or contradictory completion analytics before writes", async () => {
  const evidence = {
    id: 40, studentId: 11, classroomId: 25, levelKey: LEVEL_KEY,
    policyVersion: "game-interruption-deduction/v1", appliedEventCount: 0,
    baseScore: "95.00", scoreDeduction: "0.00", finalScore: "95.00",
    grossCompletionXp: 0, xpDeduction: 0, netCompletionXp: 0, completedAt: COMPLETED_AT,
  };
  const validAnalytics = {
    studentId: 11, classroomId: 25, levelKey: LEVEL_KEY,
    eventType: "level_completed", score: 95, occurredAt: COMPLETED_AT,
  };
  const cases = [
    null,
    { ...validAnalytics, studentId: 12 },
    { ...validAnalytics, classroomId: 26 },
    { ...validAnalytics, levelKey: "tutorial-level-2" },
    { ...validAnalytics, score: "94.99" },
    { ...validAnalytics, occurredAt: new Date(COMPLETED_AT.getTime() + 1) },
  ];
  for (const analyticsRecord of cases) {
    const harness = createHarness({
      evidence,
      analyticsRecord,
      progressValues: {
        isCompleted: true, progressPercent: 100, completedAt: COMPLETED_AT,
        finalScore: "95.00", xpAwarded: 0, xpAwardedAt: COMPLETED_AT,
      },
    });
    await assert.rejects(
      harness.complete({ classroomWasExplicit: false }),
      (error) => error.code === "COMPLETION_INTEGRITY_ERROR",
    );
    assert.equal(harness.state.xpCalls, 0);
    assert.equal(harness.state.analyticsWrites, 0);
    assert.deepEqual(harness.state.writes, []);
  }
});

test("completed retries accept equivalent decimal and timestamp representations without mutation", async () => {
  const evidence = {
    id: 40, studentId: 11, classroomId: 25, levelKey: LEVEL_KEY,
    policyVersion: "game-interruption-deduction/v1", appliedEventCount: 0,
    baseScore: "95.00", scoreDeduction: "0.00", finalScore: "95.00",
    grossCompletionXp: 0, xpDeduction: 0, netCompletionXp: 0,
    completedAt: COMPLETED_AT.toISOString(),
  };
  const harness = createHarness({
    evidence,
    analyticsRecord: {
      studentId: 11, classroomId: 25, levelKey: LEVEL_KEY,
      eventType: "level_completed", score: "95.0", occurredAt: COMPLETED_AT.toISOString(),
    },
    progressValues: {
      isCompleted: true, progressPercent: 100, completedAt: COMPLETED_AT,
      finalScore: 95, xpAwarded: 0, xpAwardedAt: COMPLETED_AT,
    },
  });
  const result = await harness.complete({ classroomWasExplicit: false });
  assert.equal(result.completedNow, false);
  assert.equal(result.xpAward.awarded, false);
  assert.equal(result.xpAward.originalAmount, 0);
  assert.equal(harness.state.analyticsWrites, 0);
  assert.deepEqual(harness.state.writes, []);
});

test("completed retries fail closed when exact-classroom event history is not fully linked", async () => {
  const harness = createHarness({
    sessions: [{ id: 2, studentId: 11, classroomId: 25, levelKey: LEVEL_KEY, lifecycleStatus: "COMPLETED", scoreDeductionSnapshot: "1.00", xpDeductionSnapshot: 10 }],
    events: [{ id: 10, sessionId: 2, studentId: 11, eventKey: "event_key_10", eventType: "hidden", receivedAt: "2026-10-29T07:01:00Z" }],
    evidence: {
      id: 40, studentId: 11, classroomId: 25, levelKey: LEVEL_KEY,
      policyVersion: "game-interruption-deduction/v1", appliedEventCount: 0,
      baseScore: "95.00", scoreDeduction: "0.00", finalScore: "95.00",
      grossCompletionXp: 25, xpDeduction: 0, netCompletionXp: 25, completedAt: COMPLETED_AT,
    },
    progressValues: { isCompleted: true, xpAwarded: 25, xpAwardedAt: COMPLETED_AT },
  });
  await assert.rejects(
    harness.complete(),
    (error) => error.code === "COMPLETION_INTEGRITY_ERROR",
  );
  assert.equal(harness.state.xpCalls, 0);
});

test("legacy completions return no fabricated deduction summary", async () => {
  const harness = createHarness({ progressValues: { isCompleted: true, progressPercent: 100, completedAt: COMPLETED_AT } });
  const result = await harness.complete({ classroomWasExplicit: false });
  assert.equal(result.completedNow, false);
  assert.equal(result.xpAward, null);
  assert.equal(result.completionDeductions, null);
  assert.equal(harness.state.xpCalls, 0);
});

test("history requires explicit classroom and oversized pending batches mutate nothing", async () => {
  const withHistory = createHarness({ sessions: [{ id: 2, studentId: 11, classroomId: 25, levelKey: LEVEL_KEY, lifecycleStatus: "CURRENT", scoreDeductionSnapshot: "1.00", xpDeductionSnapshot: 10 }] });
  await assert.rejects(withHistory.complete({ classroomWasExplicit: false }), (error) => (
    error instanceof GameInterruptionCompletionError && error.code === "CLASSROOM_ID_REQUIRED"
  ));
  assert.equal(withHistory.state.evidenceRows.length, 0);

  const oversized = createHarness();
  await assert.rejects(oversized.complete({
    classroomWasExplicit: true,
    interruptionEvents: Array.from({ length: 101 }, (_, index) => ({ sessionId: 1, eventKey: `pending_${String(index).padStart(3, "0")}`, eventType: "hidden" })),
  }), (error) => error.code === "INVALID_PENDING_EVENTS");
  assert.equal(oversized.state.transactionCount, 0);
});

test("transactional classroom, membership, student, and level access checks precede writes", async () => {
  const cases = [
    [createHarness({ classroomValues: { isActive: false } }), "CLASSROOM_INACTIVE"],
    [createHarness({ membershipValues: { status: "removed" } }), "FORBIDDEN"],
    [createHarness({ userValues: { status: "inactive" } }), "FORBIDDEN"],
    [createHarness({ access: { allowed: false, reason: "DEADLINE_PASSED", effectiveDueAt: COMPLETED_AT } }), "DEADLINE_PASSED"],
  ];
  for (const [harness, code] of cases) {
    await assert.rejects(
      harness.complete({ classroomWasExplicit: false }),
      (error) => error.code === code,
    );
    assert.equal(harness.state.evidenceRows.length, 0, code);
    assert.equal(harness.state.analyticsWrites, 0, code);
    assert.equal(harness.state.xpCalls, 0, code);
  }
});

test("failures at each completion write stage roll back the full mutation", async () => {
  const session = {
    id: 2, studentId: 11, classroomId: 25, levelKey: LEVEL_KEY,
    lifecycleStatus: "CURRENT", scoreDeductionSnapshot: "1.00", xpDeductionSnapshot: 10,
  };
  const event = {
    id: 10, sessionId: 2, studentId: 11, eventKey: "event_key_10",
    eventType: "hidden", receivedAt: "2026-10-29T07:01:00Z",
  };
  for (const failAt of ["evidence", "event", "progress", "analytics", "xp", "session"]) {
    const needsHistory = failAt === "event" || failAt === "session";
    const harness = createHarness({
      failAt,
      ...(needsHistory ? { sessions: [session], events: [event] } : {}),
    });
    await assert.rejects(harness.complete({ classroomWasExplicit: needsHistory }));
    assert.equal(harness.progress.isCompleted, false, failAt);
    assert.equal(harness.progress.finalScore, null, failAt);
    assert.equal(harness.progress.xpAwardedAt, null, failAt);
    assert.equal(harness.user.xpTotal, 100, failAt);
    assert.equal(harness.state.evidenceRows.length, 0, failAt);
    assert.equal(harness.state.analyticsWrites, 0, failAt);
    if (needsHistory) assert.equal(harness.eventRows[0].completionEvidenceId, null, failAt);
  }
});
