const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const { test } = require("node:test");

const {
  GameInterruptionEventError,
  createGameInterruptionEventService,
} = require("../src/services/gameInterruptionEventService");

const LEVEL_KEY = "tutorial-level-1";

const record = (values) => ({
  ...values,
  get() { return { ...this }; },
});

const session = (overrides = {}) => record({
  id: 70,
  studentId: 11,
  classroomId: 25,
  levelKey: LEVEL_KEY,
  lifecycleStatus: "CURRENT",
  startedAt: new Date("2026-10-29T00:00:00.000Z"),
  supersededAt: null,
  completedAt: null,
  ...overrides,
});

const entry = (overrides = {}) => ({
  sessionId: 70,
  eventKey: "event_key_12345",
  eventType: "hidden",
  ...overrides,
});

const createHarness = ({
  events = [],
  failOnKey = null,
  uniqueOnKey = null,
  uniqueWinner = {},
} = {}) => {
  const state = {
    events: events.map((item) => record(item)),
    nextId: 100,
    outerTransactions: 0,
    savepoints: 0,
    eventQueries: 0,
    eventCreates: 0,
    uniqueOnKey,
  };
  const makeTransaction = (id, parent = null) => ({
    id,
    parent,
    LOCK: { UPDATE: "UPDATE" },
    finished: false,
  });
  const callerTransaction = makeTransaction("caller");
  const database = {
    async transaction(optionsOrCallback, maybeCallback) {
      if (typeof optionsOrCallback === "function") {
        state.outerTransactions += 1;
        const transaction = makeTransaction(`outer-${state.outerTransactions}`);
        const snapshot = [...state.events];
        try {
          return await optionsOrCallback(transaction);
        } catch (error) {
          state.events.splice(0, state.events.length, ...snapshot);
          throw error;
        } finally {
          transaction.finished = true;
        }
      }
      state.savepoints += 1;
      const parent = optionsOrCallback.transaction;
      const savepoint = makeTransaction(`savepoint-${state.savepoints}`, parent);
      const snapshot = [...state.events];
      try {
        return await maybeCallback(savepoint);
      } catch (error) {
        state.events.splice(0, state.events.length, ...snapshot);
        const afterRollback = state.afterRollback;
        state.afterRollback = null;
        afterRollback?.();
        throw error;
      } finally {
        savepoint.finished = true;
      }
    },
  };
  const models = {
    GameInterruptionEvent: {
      async findAll(options) {
        state.eventQueries += 1;
        const keyCondition = options.where.eventKey;
        const keys = keyCondition?.[Op.in] ?? [];
        return state.events.filter((item) => (
          Number(item.studentId) === Number(options.where.studentId)
          && keys.includes(item.eventKey)
        ));
      },
      async create(values, options) {
        state.eventCreates += 1;
        assert.ok(options.transaction.parent, "event inserts must use a batch savepoint");
        if (values.eventKey === failOnKey) throw new Error("injected insert failure");
        if (values.eventKey === state.uniqueOnKey) {
          state.uniqueOnKey = null;
          state.afterRollback = () => state.events.push(record({
            id: 90,
            ...values,
            ...uniqueWinner,
          }));
          throw Object.assign(new Error("duplicate event key"), {
            name: "SequelizeUniqueConstraintError",
            constraint: "game_interruption_events_student_key",
          });
        }
        if (state.events.some((item) => (
          Number(item.studentId) === Number(values.studentId)
          && item.eventKey === values.eventKey
        ))) {
          throw Object.assign(new Error("duplicate event key"), {
            name: "SequelizeUniqueConstraintError",
            constraint: "game_interruption_events_student_key",
          });
        }
        const created = record({ id: state.nextId++, ...values });
        state.events.push(created);
        return created;
      },
    },
  };
  const service = createGameInterruptionEventService({
    database,
    models,
    now: () => new Date("2026-10-29T00:05:00.000Z"),
  });
  const context = (overrides = {}) => ({
    transaction: callerTransaction,
    actorId: 11,
    classroomId: 25,
    levelKey: LEVEL_KEY,
    student: record({ id: 11, role: "student", status: "active" }),
    classroom: record({ id: 25, isActive: true }),
    membership: record({ id: 3, classroomId: 25, studentId: 11, status: "active" }),
    progress: record({ id: 5, userId: 11, levelKey: LEVEL_KEY, isCompleted: false }),
    sessions: [session(), session({
      id: 69,
      lifecycleStatus: "SUPERSEDED",
      supersededAt: new Date("2026-10-29T00:01:00.000Z"),
    })],
    entries: [],
    ...overrides,
  });
  return { callerTransaction, context, database, service, state };
};

const rejectsWith = (promise, status, code) => assert.rejects(
  promise,
  (error) => error instanceof GameInterruptionEventError
    && error.status === status
    && error.code === code,
);

test("pending batch accepts empty, one-entry, and 100-entry caller-owned transactions", async () => {
  const empty = createHarness();
  assert.deepEqual(await empty.service.recordPendingInterruptionEventBatch(
    empty.context(),
  ), []);
  assert.equal(empty.state.savepoints, 0);

  const one = createHarness();
  const oneResult = await one.service.recordPendingInterruptionEventBatch(
    one.context({ entries: [entry()] }),
  );
  assert.equal(oneResult.length, 1);
  assert.equal(oneResult[0].changed, true);
  assert.equal(oneResult[0].event.receivedAt.toISOString(), "2026-10-29T00:05:00.000Z");
  assert.equal(one.state.events[0].appliedAt, null);
  assert.equal(one.state.events[0].appliedScoreDeduction, null);
  assert.equal(one.state.events[0].appliedXpDeduction, null);
  assert.equal(one.state.events[0].completionEvidenceId, null);

  const hundred = createHarness();
  const entries = Array.from({ length: 100 }, (_, index) => entry({
    eventKey: `event_key_${String(index).padStart(3, "0")}`,
  }));
  const results = await hundred.service.recordPendingInterruptionEventBatch(
    hundred.context({ entries }),
  );
  assert.equal(results.length, 100);
  assert.equal(results.every((result) => result.changed), true);
  assert.equal(hundred.state.events.length, 100);
  assert.equal(hundred.state.outerTransactions, 0);
  assert.equal(hundred.state.savepoints, 1);
});

test("pending batch strictly rejects oversized, malformed, and duplicate entries before writes", async () => {
  const invalidBatches = [
    Array.from({ length: 101 }, (_, index) => entry({
      eventKey: `event_key_${String(index).padStart(3, "0")}`,
    })),
    null,
    [{ ...entry(), receivedAt: new Date() }],
    [{ ...entry(), studentId: 11 }],
    [{ ...entry(), scoreDeductionSnapshot: 1 }],
    [{ ...entry(), appliedXpDeduction: 10 }],
    [entry({ sessionId: "1e2" })],
    [entry({ eventKey: "short" })],
    [entry({ eventType: "blur" })],
    [entry(), entry()],
    [entry(), entry({ eventType: "fullscreen_exit" })],
  ];
  for (const entries of invalidBatches) {
    const harness = createHarness();
    await rejectsWith(
      harness.service.recordPendingInterruptionEventBatch(harness.context({ entries })),
      400,
      "INVALID_PENDING_EVENTS",
    );
    assert.equal(harness.state.events.length, 0);
    assert.equal(harness.state.eventCreates, 0);
    assert.equal(harness.state.savepoints, 0);
  }
});

test("pending batch enforces its exact locked context and every session scope", async () => {
  const missingTransaction = createHarness();
  await assert.rejects(
    missingTransaction.service.recordPendingInterruptionEventBatch(
      missingTransaction.context({ transaction: null, entries: [entry()] }),
    ),
    /caller-owned transaction/i,
  );
  assert.equal(missingTransaction.state.savepoints, 0);

  for (const overrides of [
    { student: record({ id: 12, role: "student", status: "active" }) },
    { classroom: record({ id: 26, isActive: true }) },
    { membership: record({ id: 3, classroomId: 26, studentId: 11, status: "active" }) },
    { progress: record({ id: 5, userId: 11, levelKey: "tutorial-level-2", isCompleted: false }) },
  ]) {
    const harness = createHarness();
    await assert.rejects(
      harness.service.recordPendingInterruptionEventBatch(
        harness.context({ ...overrides, entries: [entry()] }),
      ),
      /locked interruption context/i,
    );
    assert.equal(harness.state.eventCreates, 0);
  }

  const wrongScope = createHarness();
  await rejectsWith(
    wrongScope.service.recordPendingInterruptionEventBatch(wrongScope.context({
      sessions: [session({ classroomId: 26 })],
      entries: [entry()],
    })),
    409,
    "SESSION_SCOPE_MISMATCH",
  );
  assert.equal(wrongScope.state.eventCreates, 0);

  const missingSession = createHarness();
  await rejectsWith(
    missingSession.service.recordPendingInterruptionEventBatch(missingSession.context({
      entries: [entry({ sessionId: 999 })],
    })),
    404,
    "SESSION_NOT_FOUND",
  );
  assert.equal(missingSession.state.eventCreates, 0);
});

test("pending batch distinguishes persisted matches, conflicts, and superseded-session retries", async () => {
  const receivedAt = new Date("2026-10-28T12:00:00.000Z");
  const persisted = record({
    id: 80,
    sessionId: 69,
    studentId: 11,
    eventKey: "existing_event_key",
    eventType: "hidden",
    receivedAt,
    appliedAt: null,
    appliedScoreDeduction: null,
    appliedXpDeduction: null,
    completionEvidenceId: null,
  });
  const matching = createHarness({ events: [persisted] });
  const acknowledged = await matching.service.recordPendingInterruptionEventBatch(
    matching.context({
      progress: record({ id: 5, userId: 11, levelKey: LEVEL_KEY, isCompleted: true }),
      entries: [entry({ sessionId: 69, eventKey: "existing_event_key" })],
    }),
  );
  assert.equal(acknowledged[0].changed, false);
  assert.equal(acknowledged[0].event.receivedAt, receivedAt);
  assert.equal(matching.state.eventCreates, 0);

  const conflicting = createHarness({ events: [persisted] });
  await rejectsWith(
    conflicting.service.recordPendingInterruptionEventBatch(conflicting.context({
      entries: [entry({ sessionId: 70, eventKey: "existing_event_key" })],
    })),
    409,
    "EVENT_KEY_CONFLICT",
  );

  const newSuperseded = createHarness({ events: [persisted] });
  await rejectsWith(
    newSuperseded.service.recordPendingInterruptionEventBatch(newSuperseded.context({
      entries: [entry({ sessionId: 69, eventKey: "new_event_key_123" })],
    })),
    409,
    "SESSION_NOT_CURRENT",
  );
  assert.equal(newSuperseded.state.events.length, 1);
});

test("pending batch atomically combines existing and new events and rolls back partial inserts", async () => {
  const existing = record({
    id: 80,
    sessionId: 70,
    studentId: 11,
    eventKey: "existing_event_key",
    eventType: "hidden",
    receivedAt: new Date("2026-10-28T12:00:00.000Z"),
  });
  const mixed = createHarness({ events: [existing] });
  const results = await mixed.service.recordPendingInterruptionEventBatch(mixed.context({
    entries: [
      entry({ eventKey: "existing_event_key" }),
      entry({ eventKey: "new_event_key_123", eventType: "fullscreen_exit" }),
    ],
  }));
  assert.deepEqual(results.map((result) => result.changed), [false, true]);
  assert.equal(mixed.state.events.length, 2);

  const failed = createHarness({ failOnKey: "second_event_key" });
  await assert.rejects(
    failed.service.recordPendingInterruptionEventBatch(failed.context({
      entries: [
        entry({ eventKey: "first_event_key" }),
        entry({ eventKey: "second_event_key" }),
      ],
    })),
    /injected insert failure/,
  );
  assert.equal(failed.state.events.length, 0);
  assert.equal(failed.state.eventCreates, 2);
});

test("pending batch safely retries an intended unique race after rolling back earlier inserts", async () => {
  const matching = createHarness({ uniqueOnKey: "racing_event_key" });
  const results = await matching.service.recordPendingInterruptionEventBatch(matching.context({
    entries: [
      entry({ eventKey: "first_event_key" }),
      entry({ eventKey: "racing_event_key" }),
    ],
  }));
  assert.deepEqual(results.map((result) => result.changed), [true, false]);
  assert.equal(matching.state.events.length, 2);
  assert.equal(matching.state.savepoints, 2);

  const conflicting = createHarness({
    uniqueOnKey: "racing_event_key",
    uniqueWinner: { eventType: "fullscreen_exit" },
  });
  await rejectsWith(
    conflicting.service.recordPendingInterruptionEventBatch(conflicting.context({
      entries: [
        entry({ eventKey: "first_event_key" }),
        entry({ eventKey: "racing_event_key" }),
      ],
    })),
    409,
    "EVENT_KEY_CONFLICT",
  );
  assert.deepEqual(conflicting.state.events.map(({ eventKey }) => eventKey), ["racing_event_key"]);
});

test("caller rollback removes successful batch inserts without an independent outer commit", async () => {
  const harness = createHarness();
  await assert.rejects(
    harness.database.transaction(async (transaction) => {
      await harness.service.recordPendingInterruptionEventBatch(harness.context({
        transaction,
        entries: [entry()],
      }));
      throw new Error("caller rollback");
    }),
    /caller rollback/,
  );
  assert.equal(harness.state.events.length, 0);
  assert.equal(harness.state.outerTransactions, 1);
  assert.equal(harness.state.savepoints, 1);
});
