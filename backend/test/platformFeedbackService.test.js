const assert = require("node:assert/strict");
const { test } = require("node:test");

let createPlatformFeedbackService;
let PlatformFeedbackError;
try {
  ({ createPlatformFeedbackService, PlatformFeedbackError } = require("../src/services/platformFeedbackService"));
} catch {
  // The first TDD run intentionally reaches the availability assertion.
}

const activeUser = (overrides = {}) => ({
  id: 51,
  role: "student",
  status: "active",
  ...overrides,
});

const createHarness = ({
  users = [activeUser(), activeUser({ id: 52, role: "teacher" })],
  feedback = [],
  createFailure = null,
  concurrentRecord = null,
} = {}) => {
  const store = {
    users: structuredClone(users),
    feedback: structuredClone(feedback),
    events: [],
    transactions: 0,
    savepoints: 0,
    creates: 0,
    nextId: 100,
  };
  const database = {
    transaction: async (optionsOrCallback, maybeCallback) => {
      if (typeof optionsOrCallback === "object") {
        store.savepoints += 1;
        return maybeCallback({ ...optionsOrCallback.transaction, isSavepoint: true });
      }
      store.transactions += 1;
      const transaction = { LOCK: { UPDATE: "UPDATE" } };
      return optionsOrCallback(transaction);
    },
  };
  const models = {
    User: {
      findByPk: async (id, options) => {
        assert.deepEqual(options.attributes, ["id", "role", "status"]);
        assert.equal(options.lock, "UPDATE");
        assert.ok(options.transaction);
        store.events.push("user");
        return store.users.find((row) => row.id === Number(id)) ?? null;
      },
    },
    PlatformFeedbackSubmission: {
      findOne: async ({ where, transaction, lock }) => {
        assert.ok(transaction);
        assert.equal(lock, "UPDATE");
        store.events.push("feedback");
        return store.feedback.find((row) => (
          row.authorUserId === Number(where.authorUserId)
            && row.idempotencyKey === where.idempotencyKey
        )) ?? (store.creates > 0 ? concurrentRecord : null);
      },
      create: async (values, { transaction }) => {
        assert.equal(transaction.isSavepoint, true);
        store.creates += 1;
        if (createFailure) throw createFailure;
        const now = new Date("2026-11-03T08:00:00.000Z");
        const row = {
          id: store.nextId++,
          ...values,
          createdAt: now,
          updatedAt: now,
          internalOnly: "hidden",
        };
        store.feedback.push(row);
        return row;
      },
    },
  };
  return {
    store,
    service: createPlatformFeedbackService?.({ sequelize: database, models }),
  };
};

const submit = (service, overrides = {}) => service.submitPlatformFeedback({
  actorId: 51,
  actorRole: "student",
  message: "The platform is easier to navigate now.",
  idempotencyKey: "platform_feedback_key_123",
  ...overrides,
});

const rejectsWith = (promise, status, code) => assert.rejects(
  promise,
  (error) => error instanceof PlatformFeedbackError
    && error.status === status
    && error.code === code,
);

test("platform feedback service is available", () => {
  assert.equal(typeof createPlatformFeedbackService, "function");
});

test("active students and teachers create normalized allowlisted feedback", async () => {
  for (const actor of [
    { actorId: 51, actorRole: "student" },
    { actorId: 52, actorRole: "teacher" },
  ]) {
    const h = createHarness();
    const result = await submit(h.service, {
      ...actor,
      message: "\u00a0\tThe platform is easier to navigate now.\r\n",
    });
    assert.deepEqual(result, {
      changed: true,
      feedback: {
        id: 100,
        message: "The platform is easier to navigate now.",
        createdAt: new Date("2026-11-03T08:00:00.000Z"),
      },
    });
    assert.deepEqual(h.store.events, ["user", "feedback"]);
    assert.equal(h.store.feedback[0].authorUserId, actor.actorId);
    assert.equal("authorUserId" in result.feedback, false);
    assert.equal("idempotencyKey" in result.feedback, false);
    assert.equal("updatedAt" in result.feedback, false);
  }
});

test("submission rejects administrators and invalid inputs before starting a transaction", async () => {
  for (const overrides of [
    { actorRole: "admin" },
    { actorId: 0 },
    { message: "\u00a0\t\r\n" },
    { message: "🙂".repeat(1001) },
    { idempotencyKey: "short" },
    { idempotencyKey: "invalid.key" },
  ]) {
    const h = createHarness();
    const expected = overrides.actorRole === "admin"
      ? [403, "FORBIDDEN"]
      : [400, "INVALID_REQUEST"];
    await rejectsWith(submit(h.service, overrides), ...expected);
    assert.equal(h.store.transactions, 0);
  }
  const accepted = createHarness();
  await assert.doesNotReject(submit(accepted.service, {
    message: `\u3000${"🙂".repeat(1000)}\ufeff`,
  }));
});

test("the author account is revalidated under lock inside the write transaction", async () => {
  for (const user of [
    activeUser({ status: "inactive" }),
    activeUser({ role: "admin" }),
  ]) {
    const h = createHarness({ users: [user] });
    await rejectsWith(submit(h.service), 403, "FORBIDDEN");
    assert.equal(h.store.transactions, 1);
    assert.equal(h.store.creates, 0);
    assert.deepEqual(h.store.events, ["user"]);
  }
});

test("matching retries return the original record without changing timestamps", async () => {
  const createdAt = new Date("2026-11-01T08:00:00.000Z");
  const updatedAt = new Date("2026-11-01T09:00:00.000Z");
  const h = createHarness({
    feedback: [{
      id: 81,
      authorUserId: 51,
      message: "The platform is easier to navigate now.",
      idempotencyKey: "platform_feedback_key_123",
      createdAt,
      updatedAt,
    }],
  });
  const result = await submit(h.service, { message: "  The platform is easier to navigate now.  " });
  assert.deepEqual(result, {
    changed: false,
    feedback: { id: 81, message: "The platform is easier to navigate now.", createdAt },
  });
  assert.equal(h.store.feedback[0].updatedAt.toISOString(), updatedAt.toISOString());
  assert.equal(h.store.creates, 0);
});

test("conflicting key reuse returns a generic conflict without stored content", async () => {
  const h = createHarness({
    feedback: [{
      id: 81,
      authorUserId: 51,
      message: "Stored private content",
      idempotencyKey: "platform_feedback_key_123",
      createdAt: new Date(),
    }],
  });
  await assert.rejects(submit(h.service), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "IDEMPOTENCY_KEY_CONFLICT");
    assert.equal(error.message, "Idempotency key conflict");
    assert.doesNotMatch(JSON.stringify(error), /Stored private content/);
    return true;
  });
});

test("the same idempotency key remains independent for another author", async () => {
  const h = createHarness();
  const student = await submit(h.service);
  const teacher = await submit(h.service, { actorId: 52, actorRole: "teacher" });
  assert.equal(student.changed, true);
  assert.equal(teacher.changed, true);
  assert.equal(h.store.feedback.length, 2);
  assert.deepEqual(h.store.feedback.map(({ authorUserId }) => authorUserId), [51, 52]);
});

test("the intended uniqueness conflict is recovered after the savepoint", async () => {
  const unique = new Error("duplicate key");
  unique.name = "SequelizeUniqueConstraintError";
  unique.constraint = "platform_feedback_submissions_author_key";
  const concurrentRecord = {
    id: 91,
    authorUserId: 51,
    message: "The platform is easier to navigate now.",
    idempotencyKey: "platform_feedback_key_123",
    createdAt: new Date("2026-11-03T07:00:00.000Z"),
  };
  const h = createHarness({ createFailure: unique, concurrentRecord });
  const result = await submit(h.service);
  assert.equal(result.changed, false);
  assert.equal(result.feedback.id, 91);
  assert.equal(h.store.savepoints, 1);
  assert.deepEqual(h.store.events, ["user", "feedback", "feedback"]);
});

test("unrelated uniqueness and database failures roll back without private logging", async () => {
  for (const failure of [
    Object.assign(new Error("other unique"), {
      name: "SequelizeUniqueConstraintError",
      constraint: "unrelated_constraint",
    }),
    new Error("database unavailable with private content"),
  ]) {
    const h = createHarness({ createFailure: failure });
    const logs = [];
    const original = console.error;
    console.error = (...values) => logs.push(values.join(" "));
    try {
      await assert.rejects(submit(h.service), failure);
    } finally {
      console.error = original;
    }
    assert.equal(h.store.feedback.length, 0);
    assert.deepEqual(logs, []);
  }
});
