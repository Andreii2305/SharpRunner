const assert = require("node:assert/strict");
const { test } = require("node:test");

let createStudentClassroomFeedbackService;
let StudentClassroomFeedbackError;
try {
  ({
    createStudentClassroomFeedbackService,
    StudentClassroomFeedbackError,
  } = require("../src/services/studentClassroomFeedbackService"));
} catch {
  // The first TDD run intentionally reaches the availability assertion.
}

const clone = (value) => structuredClone(value);

const classroom = (overrides = {}) => ({ id: 7, isActive: true, ...overrides });
const membership = (overrides = {}) => ({
  id: 70,
  classroomId: 7,
  studentId: 51,
  status: "active",
  ...overrides,
});
const user = (overrides = {}) => ({
  id: 51,
  role: "student",
  status: "active",
  ...overrides,
});

const createHarness = ({
  classrooms = [classroom()],
  memberships = [membership()],
  users = [user()],
  feedback = [],
  failCreate = null,
} = {}) => {
  const store = {
    classrooms: clone(classrooms),
    memberships: clone(memberships),
    users: clone(users),
    feedback: clone(feedback),
    events: [],
    transactions: 0,
    membershipReads: 0,
    userReads: 0,
    feedbackReads: 0,
    creates: 0,
    savepoints: 0,
    nextId: 100,
  };
  const classroomLockTails = new Map();
  const keyLockTails = new Map();

  const acquireLock = async (tails, key) => {
    const previous = tails.get(key) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    tails.set(key, previous.then(() => current));
    await previous;
    return () => {
      release();
      if (tails.get(key) === current) tails.delete(key);
    };
  };

  const database = {
    transaction: async (optionsOrCallback, maybeCallback) => {
      if (typeof optionsOrCallback === "object") {
        const outer = optionsOrCallback.transaction;
        const createdIdStart = outer.createdIds.length;
        const savepoint = { ...outer, outer, isSavepoint: true };
        store.savepoints += 1;
        try {
          return await maybeCallback(savepoint);
        } catch (error) {
          const rolledBackIds = new Set(outer.createdIds.splice(createdIdStart));
          store.feedback = store.feedback.filter((row) => !rolledBackIds.has(row.id));
          throw error;
        }
      }

      store.transactions += 1;
      const releases = [];
      const transaction = {
        LOCK: { UPDATE: "UPDATE" },
        createdIds: [],
        lockClassroom: async (id) => {
          releases.push(await acquireLock(classroomLockTails, Number(id)));
        },
      };
      try {
        return await optionsOrCallback(transaction);
      } catch (error) {
        const rolledBackIds = new Set(transaction.createdIds);
        store.feedback = store.feedback.filter((row) => !rolledBackIds.has(row.id));
        throw error;
      } finally {
        releases.reverse().forEach((release) => release());
      }
    },
  };

  const models = {
    Classroom: {
      findByPk: async (id, options) => {
        assert.equal(options.lock, "UPDATE");
        await options.transaction.lockClassroom(id);
        store.events.push("classroom");
        return store.classrooms.find((row) => row.id === Number(id)) ?? null;
      },
    },
    StudentClassroomFeedback: {
      findOne: async ({ where, transaction, lock }) => {
        assert.ok(transaction);
        assert.equal(lock, "UPDATE");
        store.events.push("feedback");
        store.feedbackReads += 1;
        return store.feedback.find((row) => (
          row.studentId === Number(where.studentId)
            && row.idempotencyKey === where.idempotencyKey
        )) ?? null;
      },
      create: async (values, { transaction }) => {
        assert.equal(transaction.isSavepoint, true, "insert must use a savepoint");
        const key = `${values.studentId}:${values.idempotencyKey}`;
        const release = await acquireLock(keyLockTails, key);
        try {
          const duplicate = store.feedback.find((row) => (
            row.studentId === Number(values.studentId)
              && row.idempotencyKey === values.idempotencyKey
          ));
          if (duplicate) {
            const error = new Error("duplicate key");
            error.name = "SequelizeUniqueConstraintError";
            error.constraint = "student_classroom_feedback_student_key";
            throw error;
          }
          const now = new Date("2026-10-26T08:00:00.000Z");
          const row = {
            id: store.nextId++,
            ...values,
            createdAt: now,
            updatedAt: now,
            internalOnly: "not serialized",
          };
          store.feedback.push(row);
          transaction.outer.createdIds.push(row.id);
          store.creates += 1;
          if (failCreate) throw failCreate;
          return row;
        } finally {
          release();
        }
      },
    },
    ClassroomMembership: {
      findOne: async ({ where, transaction, lock }) => {
        assert.ok(transaction);
        assert.equal(lock, "UPDATE");
        store.events.push("membership");
        store.membershipReads += 1;
        return store.memberships.find((row) => (
          row.classroomId === Number(where.classroomId)
            && row.studentId === Number(where.studentId)
        )) ?? null;
      },
    },
    User: {
      findByPk: async (id, { attributes, transaction, lock }) => {
        assert.deepEqual(attributes, ["id", "role", "status"]);
        assert.ok(transaction);
        assert.equal(lock, "UPDATE");
        store.events.push("user");
        store.userReads += 1;
        return store.users.find((row) => row.id === Number(id)) ?? null;
      },
    },
  };

  return {
    store,
    service: createStudentClassroomFeedbackService?.({ sequelize: database, models }),
  };
};

const submit = (service, overrides = {}) => service.submitStudentClassroomFeedback({
  actorId: 51,
  actorRole: "student",
  classroomId: 7,
  message: "The worked examples helped me.",
  idempotencyKey: "feedback_key_123",
  ...overrides,
});

const rejectsWith = (promise, status, code) => assert.rejects(
  promise,
  (error) => error instanceof StudentClassroomFeedbackError
    && error.status === status
    && error.code === code,
);

test("student classroom feedback service is available", () => {
  assert.equal(typeof createStudentClassroomFeedbackService, "function");
});

test("active student creates minimally serialized feedback with classroom-first locking", async () => {
  const h = createHarness();
  const result = await submit(h.service, { message: "  The worked examples helped me.  " });

  assert.deepEqual(result, {
    changed: true,
    feedback: {
      id: 100,
      classroomId: 7,
      message: "The worked examples helped me.",
      createdAt: new Date("2026-10-26T08:00:00.000Z"),
    },
  });
  assert.deepEqual(h.store.events, ["classroom", "feedback", "membership", "user"]);
  assert.equal(h.store.feedback[0].studentId, 51);
  assert.equal("studentId" in result.feedback, false);
  assert.equal("idempotencyKey" in result.feedback, false);
  assert.equal("updatedAt" in result.feedback, false);
  assert.equal("internalOnly" in result.feedback, false);
});

test("validation rejects invalid ids, messages, and keys before a transaction", async () => {
  const invalidInputs = [
    { actorId: 0 },
    { classroomId: Number.MAX_SAFE_INTEGER + 1 },
    { message: "   " },
    { message: "\u{1F642}".repeat(1001) },
    { idempotencyKey: "short" },
    { idempotencyKey: "invalid key!" },
  ];
  for (const input of invalidInputs) {
    const h = createHarness();
    await rejectsWith(submit(h.service, input), 400, "INVALID_REQUEST");
    assert.equal(h.store.transactions, 0);
  }
  const accepted = createHarness();
  await assert.doesNotReject(submit(accepted.service, {
    message: `  ${"\u{1F642}".repeat(1000)}  `,
  }));
});

test("teachers and administrators cannot submit feedback", async () => {
  for (const actorRole of ["teacher", "admin"]) {
    const h = createHarness();
    await rejectsWith(submit(h.service, { actorRole }), 403, "FORBIDDEN");
    assert.equal(h.store.transactions, 0);
  }
});

test("new feedback requires an active account, classroom, and exact active membership", async () => {
  const cases = [
    { options: { users: [user({ status: "inactive" })] }, status: 403, code: "FORBIDDEN" },
    { options: { classrooms: [classroom({ isActive: false })] }, status: 409, code: "CLASSROOM_INACTIVE" },
    { options: { memberships: [membership({ status: "removed" })] }, status: 403, code: "FORBIDDEN" },
    { options: { memberships: [membership({ classroomId: 8 })] }, status: 403, code: "FORBIDDEN" },
    { options: { classrooms: [] }, status: 404, code: "CLASSROOM_NOT_FOUND" },
  ];
  for (const { options, status, code } of cases) {
    const h = createHarness(options);
    await rejectsWith(submit(h.service), status, code);
    assert.equal(h.store.creates, 0);
    assert.deepEqual(h.store.feedback, []);
  }
});

test("matching retry preserves record and timestamps without requiring current access", async () => {
  const createdAt = new Date("2026-10-20T08:00:00.000Z");
  const updatedAt = new Date("2026-10-20T09:00:00.000Z");
  const existing = {
    id: 81,
    classroomId: 7,
    studentId: 51,
    message: "The worked examples helped me.",
    idempotencyKey: "feedback_key_123",
    createdAt,
    updatedAt,
  };
  const h = createHarness({
    classrooms: [classroom({ isActive: false })],
    memberships: [membership({ status: "removed" })],
    feedback: [existing],
  });

  const result = await submit(h.service, { message: "  The worked examples helped me.  " });

  assert.deepEqual(result, {
    changed: false,
    feedback: {
      id: 81,
      classroomId: 7,
      message: "The worked examples helped me.",
      createdAt,
    },
  });
  assert.equal(h.store.feedback[0].updatedAt.toISOString(), updatedAt.toISOString());
  assert.equal(h.store.membershipReads, 0);
  assert.equal(h.store.creates, 0);
  assert.deepEqual(h.store.events, ["classroom", "feedback", "user"]);
});

test("matching retry still requires the actor to be an active student", async () => {
  const h = createHarness({
    users: [user({ status: "inactive" })],
    feedback: [{
      id: 81,
      classroomId: 7,
      studentId: 51,
      message: "The worked examples helped me.",
      idempotencyKey: "feedback_key_123",
      createdAt: new Date(),
      updatedAt: new Date(),
    }],
  });
  await rejectsWith(submit(h.service), 403, "FORBIDDEN");
  assert.equal(h.store.creates, 0);
});

test("incompatible key reuse returns a generic conflict without stored content", async () => {
  const h = createHarness({
    feedback: [{
      id: 81,
      classroomId: 8,
      studentId: 51,
      message: "Private stored feedback",
      idempotencyKey: "feedback_key_123",
      createdAt: new Date(),
      updatedAt: new Date(),
    }],
  });

  await assert.rejects(submit(h.service), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "IDEMPOTENCY_KEY_CONFLICT");
    assert.equal(error.message, "Idempotency key conflict");
    assert.doesNotMatch(JSON.stringify(error), /Private stored feedback|classroomId.*8/);
    return true;
  });
});

test("the same key is independent for another student and a new key may repeat text", async () => {
  const h = createHarness({
    memberships: [membership(), membership({ id: 71, studentId: 52 })],
    users: [user(), user({ id: 52 })],
  });
  const first = await submit(h.service);
  const second = await submit(h.service, { actorId: 52 });
  const repeatedText = await submit(h.service, { idempotencyKey: "feedback_key_456" });

  assert.equal(first.changed, true);
  assert.equal(second.changed, true);
  assert.equal(repeatedText.changed, true);
  assert.equal(h.store.feedback.length, 3);
});

test("database failure rolls back and does not log private message or key", async () => {
  const failure = new Error("database unavailable");
  const h = createHarness({ failCreate: failure });
  const originalConsoleError = console.error;
  const logged = [];
  console.error = (...args) => { logged.push(args); };
  try {
    await assert.rejects(submit(h.service), failure);
  } finally {
    console.error = originalConsoleError;
  }
  assert.deepEqual(h.store.feedback, []);
  assert.deepEqual(logged, []);
});

test("concurrent matching requests create once and replay once", async () => {
  const h = createHarness();
  const results = await Promise.all([submit(h.service), submit(h.service)]);

  assert.equal(results.filter(({ changed }) => changed).length, 1);
  assert.equal(results.filter(({ changed }) => !changed).length, 1);
  assert.equal(h.store.feedback.length, 1);
});

test("concurrent student-key conflict across classrooms recovers outside the savepoint", async () => {
  const h = createHarness({
    classrooms: [classroom(), classroom({ id: 8 })],
    memberships: [membership(), membership({ id: 80, classroomId: 8 })],
  });

  const results = await Promise.allSettled([
    submit(h.service),
    submit(h.service, { classroomId: 8, message: "Different classroom feedback" }),
  ]);

  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => (
    result.status === "rejected"
      && result.reason?.code === "IDEMPOTENCY_KEY_CONFLICT"
  )).length, 1);
  assert.equal(h.store.feedback.length, 1);
  assert.equal(h.store.savepoints, 2);
  assert.ok(h.store.feedbackReads >= 3, "losing request must re-read after savepoint rollback");
});
