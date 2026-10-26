const assert = require("node:assert/strict");
const { test } = require("node:test");

let createPrivateCheckInService;
let PrivateCheckInError;
try {
  ({ createPrivateCheckInService, PrivateCheckInError } = require("../src/services/privateCheckInService"));
} catch {
  // The first TDD run intentionally reaches the assertions with no service yet.
}

const clone = (value) => structuredClone(value);

const classroom = (overrides = {}) => ({
  id: 7,
  teacherId: 41,
  isActive: true,
  ...overrides,
});

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
  checkIns = [],
  failCreate = null,
} = {}) => {
  const store = {
    classrooms: clone(classrooms),
    memberships: clone(memberships),
    users: clone(users),
    checkIns: clone(checkIns),
    events: [],
    membershipReads: 0,
    userReads: 0,
    checkInReads: 0,
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
          store.checkIns = store.checkIns.filter((row) => !rolledBackIds.has(row.id));
          throw error;
        }
      }

      const callback = optionsOrCallback;
      const releases = [];
      const transaction = {
        LOCK: { UPDATE: "UPDATE" },
        createdIds: [],
        aborted: false,
        lockClassroom: async (id) => {
          releases.push(await acquireLock(classroomLockTails, Number(id)));
        },
      };
      try {
        return await callback(transaction);
      } catch (error) {
        const rolledBackIds = new Set(transaction.createdIds);
        store.checkIns = store.checkIns.filter((row) => !rolledBackIds.has(row.id));
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
    TeacherStudentCheckIn: {
      findOne: async ({ where, transaction, lock }) => {
        assert.ok(transaction);
        assert.equal(lock, "UPDATE");
        assert.equal(transaction.aborted, false, "outer transaction must remain usable");
        store.events.push("check-in");
        store.checkInReads += 1;
        return store.checkIns.find((row) => (
          row.senderId === Number(where.senderId)
            && row.idempotencyKey === where.idempotencyKey
        )) ?? null;
      },
      create: async (values, { transaction }) => {
        assert.equal(transaction.isSavepoint, true, "insert must be isolated by a savepoint");
        const key = `${values.senderId}:${values.idempotencyKey}`;
        const release = await acquireLock(keyLockTails, key);
        try {
          const duplicate = store.checkIns.find((row) => (
            row.senderId === Number(values.senderId)
              && row.idempotencyKey === values.idempotencyKey
          ));
          if (duplicate) {
            const error = new Error("duplicate key");
            error.name = "SequelizeUniqueConstraintError";
            error.constraint = "teacher_student_check_ins_sender_key";
            throw error;
          }
          const now = new Date("2026-10-25T08:00:00.000Z");
          const row = {
            id: store.nextId++,
            ...values,
            createdAt: now,
            updatedAt: now,
            internalOnly: "not serialized",
          };
          store.checkIns.push(row);
          transaction.outer.createdIds.push(row.id);
          store.creates += 1;
          if (failCreate) throw failCreate;
          return row;
        } finally {
          release();
        }
      },
    },
  };

  return {
    store,
    service: createPrivateCheckInService?.({ sequelize: database, models }),
  };
};

const send = (service, overrides = {}) => service.createPrivateCheckIn({
  actorId: 41,
  actorRole: "teacher",
  classroomId: 7,
  studentId: 51,
  message: "Could we check in after class?",
  idempotencyKey: "checkin_key_123",
  ...overrides,
});

const rejectsWith = (promise, status, code) => assert.rejects(
  promise,
  (error) => error instanceof PrivateCheckInError
    && error.status === status
    && error.code === code,
);

test("private check-in service is available", () => {
  assert.equal(typeof createPrivateCheckInService, "function");
});

test("owner and admin create minimally serialized check-ins with their actual roles", async () => {
  const owner = createHarness();
  const admin = createHarness();

  const ownerResult = await send(owner.service, { message: "  Could we check in?  " });
  const adminResult = await send(admin.service, {
    actorId: 9,
    actorRole: "admin",
    idempotencyKey: "admin_key_123",
  });

  assert.deepEqual(ownerResult, {
    changed: true,
    checkIn: {
      id: 100,
      senderId: 41,
      senderRole: "teacher",
      recipientStudentId: 51,
      classroomId: 7,
      message: "Could we check in?",
      createdAt: new Date("2026-10-25T08:00:00.000Z"),
      updatedAt: new Date("2026-10-25T08:00:00.000Z"),
    },
  });
  assert.equal(adminResult.checkIn.senderId, 9);
  assert.equal(adminResult.checkIn.senderRole, "admin");
  assert.equal("idempotencyKey" in ownerResult.checkIn, false);
  assert.equal("internalOnly" in ownerResult.checkIn, false);
  assert.deepEqual(owner.store.events.slice(0, 4), ["classroom", "check-in", "membership", "user"]);
});

test("validation rejects invalid ids, roles, messages, and idempotency keys before transactions", async () => {
  const invalidInputs = [
    { actorId: 0 },
    { actorRole: "student" },
    { classroomId: Number.MAX_SAFE_INTEGER + 1 },
    { studentId: -1 },
    { message: "   " },
    { message: "x".repeat(1001) },
    { idempotencyKey: "short" },
    { idempotencyKey: "invalid key!" },
  ];
  for (const input of invalidInputs) {
    const h = createHarness();
    await rejectsWith(send(h.service, input), 400, "INVALID_REQUEST");
    assert.deepEqual(h.store.events, []);
  }
});

test("message validation uses the model's Unicode character limit", async () => {
  const accepted = createHarness();
  const rejected = createHarness();

  await assert.doesNotReject(send(accepted.service, {
    message: "🙂".repeat(1000),
  }));
  await rejectsWith(send(rejected.service, {
    message: "🙂".repeat(1001),
  }), 400, "INVALID_REQUEST");
});

test("foreign owner is denied before check-in, membership, or recipient reads", async () => {
  const h = createHarness();
  await rejectsWith(send(h.service, { actorId: 99 }), 403, "FORBIDDEN");
  assert.equal(h.store.checkInReads, 0);
  assert.equal(h.store.membershipReads, 0);
  assert.equal(h.store.userReads, 0);
  assert.equal(h.store.creates, 0);
});

test("new sends reject inactive classrooms and invalid exact recipients without writes", async () => {
  const cases = [
    { options: { classrooms: [classroom({ isActive: false })] }, status: 409, code: "CLASSROOM_INACTIVE" },
    { options: { memberships: [membership({ status: "removed" })] }, status: 404, code: "ACTIVE_STUDENT_NOT_FOUND" },
    { options: { memberships: [membership({ classroomId: 8 })] }, status: 404, code: "ACTIVE_STUDENT_NOT_FOUND" },
    { options: { users: [user({ status: "inactive" })] }, status: 404, code: "ACTIVE_STUDENT_NOT_FOUND" },
    { options: { users: [user({ role: "teacher" })] }, status: 404, code: "ACTIVE_STUDENT_NOT_FOUND" },
  ];
  for (const { options, status, code } of cases) {
    const h = createHarness(options);
    await rejectsWith(send(h.service), status, code);
    assert.equal(h.store.creates, 0);
    assert.deepEqual(h.store.checkIns, []);
  }
});

test("matching retry normalizes payload and preserves the original record and timestamps", async () => {
  const createdAt = new Date("2026-10-20T08:00:00.000Z");
  const updatedAt = new Date("2026-10-20T08:00:00.000Z");
  const h = createHarness({
    checkIns: [{
      id: 81,
      senderId: 41,
      senderRole: "teacher",
      recipientStudentId: 51,
      classroomId: 7,
      message: "Could we check in after class?",
      idempotencyKey: "checkin_key_123",
      createdAt,
      updatedAt,
    }],
  });

  const result = await send(h.service, { message: "  Could we check in after class?  " });

  assert.equal(result.changed, false);
  assert.equal(result.checkIn.id, 81);
  assert.equal(result.checkIn.createdAt.toISOString(), createdAt.toISOString());
  assert.equal(result.checkIn.updatedAt.toISOString(), updatedAt.toISOString());
  assert.equal(h.store.creates, 0);
  assert.equal(h.store.membershipReads, 0);
  assert.equal(h.store.userReads, 0);
});

test("an incompatible payload returns a generic conflict without exposing stored details", async () => {
  const h = createHarness({
    checkIns: [{
      id: 81,
      senderId: 41,
      senderRole: "teacher",
      recipientStudentId: 52,
      classroomId: 7,
      message: "Stored private content",
      idempotencyKey: "checkin_key_123",
      createdAt: new Date(),
      updatedAt: new Date(),
    }],
  });

  await assert.rejects(send(h.service), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "IDEMPOTENCY_KEY_CONFLICT");
    assert.equal(error.message, "Idempotency key conflict");
    assert.doesNotMatch(JSON.stringify(error), /Stored private content|52/);
    return true;
  });
});

test("matching retry survives archive, removal, and recipient deactivation but still requires authorization", async () => {
  const existing = {
    id: 81,
    senderId: 41,
    senderRole: "teacher",
    recipientStudentId: 51,
    classroomId: 7,
    message: "Could we check in after class?",
    idempotencyKey: "checkin_key_123",
    createdAt: new Date("2026-10-20T08:00:00.000Z"),
    updatedAt: new Date("2026-10-20T08:00:00.000Z"),
  };
  const permitted = createHarness({
    classrooms: [classroom({ isActive: false })],
    memberships: [membership({ status: "removed" })],
    users: [user({ status: "inactive" })],
    checkIns: [existing],
  });
  const denied = createHarness({
    classrooms: [classroom({ teacherId: 99, isActive: false })],
    memberships: [membership({ status: "removed" })],
    users: [user({ status: "inactive" })],
    checkIns: [existing],
  });

  assert.equal((await send(permitted.service)).changed, false);
  assert.equal(permitted.store.membershipReads, 0);
  assert.equal(permitted.store.userReads, 0);
  await rejectsWith(send(denied.service), 403, "FORBIDDEN");
  assert.equal(denied.store.checkInReads, 0);
});

test("database failure rolls back creation and does not log private content", async () => {
  const failure = new Error("database unavailable");
  const h = createHarness({ failCreate: failure });
  const originalConsoleError = console.error;
  const logged = [];
  console.error = (...args) => { logged.push(args); };
  try {
    await assert.rejects(send(h.service), failure);
  } finally {
    console.error = originalConsoleError;
  }
  assert.deepEqual(h.store.checkIns, []);
  assert.deepEqual(logged, []);
});

test("concurrent matching requests create once and return one replay", async () => {
  const h = createHarness();
  const results = await Promise.all([send(h.service), send(h.service)]);

  assert.equal(results.filter((result) => result.changed).length, 1);
  assert.equal(results.filter((result) => !result.changed).length, 1);
  assert.equal(h.store.checkIns.length, 1);
});

test("sender-wide concurrent key reuse across classrooms conflicts safely after a savepoint", async () => {
  const h = createHarness({
    classrooms: [classroom(), classroom({ id: 8 })],
    memberships: [membership(), membership({ id: 80, classroomId: 8, studentId: 52 })],
    users: [user(), user({ id: 52 })],
  });

  const results = await Promise.allSettled([
    send(h.service),
    send(h.service, {
      classroomId: 8,
      studentId: 52,
      message: "A different payload",
    }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => (
    result.status === "rejected"
      && result.reason?.code === "IDEMPOTENCY_KEY_CONFLICT"
  )).length, 1);
  assert.equal(h.store.checkIns.length, 1);
  assert.equal(h.store.savepoints, 2);
});
