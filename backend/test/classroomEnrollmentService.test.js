const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  createClassroomEnrollmentService,
} = require("../src/services/classroomEnrollmentService");

const clone = (value) => structuredClone(value);

const createHarness = ({ maxStudents = 1, memberships = [] } = {}) => {
  const store = {
    classroom: { id: 7, teacherId: 41, isActive: true, maxStudents },
    memberships: clone(memberships),
    nextId: 100,
  };
  let lockTail = Promise.resolve();

  const sequelize = {
    transaction: async (callback) => {
      const previous = lockTail;
      let release;
      lockTail = new Promise((resolve) => { release = resolve; });
      await previous;
      const snapshot = clone(store.memberships);
      const transaction = {
        LOCK: { UPDATE: "UPDATE" },
        lockClassroom: async () => undefined,
      };
      try {
        return await callback(transaction);
      } catch (error) {
        store.memberships = snapshot;
        throw error;
      } finally {
        release();
      }
    },
  };

  const models = {
    Classroom: {
      findByPk: async (id, options) => {
        assert.equal(options.lock, "UPDATE");
        await options.transaction.lockClassroom();
        return Number(id) === store.classroom.id ? store.classroom : null;
      },
    },
    ClassroomMembership: {
      findOne: async ({ where, transaction, lock }) => {
        assert.ok(transaction);
        assert.equal(lock, "UPDATE");
        const row = store.memberships.find((candidate) => (
          candidate.classroomId === Number(where.classroomId)
          && candidate.studentId === Number(where.studentId)
        ));
        if (!row) return null;
        return {
          ...row,
          save: async function save(options) {
            assert.equal(options.transaction, transaction);
            Object.assign(row, this);
            return this;
          },
        };
      },
      count: async ({ where, transaction }) => {
        assert.ok(transaction);
        await new Promise((resolve) => setImmediate(resolve));
        return store.memberships.filter((row) => (
          row.classroomId === Number(where.classroomId) && row.status === "active"
        )).length;
      },
      create: async (values, { transaction }) => {
        assert.ok(transaction);
        const row = { id: store.nextId++, ...values };
        store.memberships.push(row);
        return row;
      },
    },
  };

  return {
    store,
    service: createClassroomEnrollmentService({
      sequelize,
      models,
      now: () => new Date("2026-10-22T08:00:00.000Z"),
    }),
  };
};

const activate = (service, studentId, options = {}) => service.activateClassroomMembership({
  classroomId: 7,
  studentId,
  ...options,
});

test("an already-active membership is a timestamp-preserving no-op at capacity", async () => {
  const joinedAt = new Date("2026-09-01T08:00:00.000Z");
  const h = createHarness({ memberships: [{ id: 1, classroomId: 7, studentId: 51, status: "active", joinedAt }] });

  const result = await activate(h.service, 51);

  assert.equal(result.changed, false);
  assert.equal(new Date(h.store.memberships[0].joinedAt).toISOString(), joinedAt.toISOString());
});

test("only active memberships consume classroom capacity", async () => {
  const h = createHarness({ memberships: [
    { id: 1, classroomId: 7, studentId: 51, status: "pending", joinedAt: null },
    { id: 2, classroomId: 7, studentId: 52, status: "rejected", joinedAt: null },
    { id: 3, classroomId: 7, studentId: 53, status: "removed", joinedAt: null },
  ] });

  const result = await activate(h.service, 51);

  assert.equal(result.changed, true);
  assert.equal(h.store.memberships[0].status, "active");
  assert.equal(h.store.memberships[1].status, "rejected");
  assert.equal(h.store.memberships[2].status, "removed");
});

test("capacity rejection preserves the previous membership state", async () => {
  const h = createHarness({ memberships: [
    { id: 1, classroomId: 7, studentId: 50, status: "active", joinedAt: new Date() },
    { id: 2, classroomId: 7, studentId: 51, status: "pending", joinedAt: null },
  ] });

  await assert.rejects(activate(h.service, 51), (error) => error?.code === "CLASSROOM_CAPACITY_REACHED");
  assert.equal(h.store.memberships.find((row) => row.studentId === 51).status, "pending");
});

test("reactivation can preserve joinedAt and initialize it only when missing", async () => {
  const existingJoinedAt = new Date("2026-09-01T08:00:00.000Z");
  const withTimestamp = createHarness({
    maxStudents: 3,
    memberships: [{ id: 1, classroomId: 7, studentId: 51, status: "removed", joinedAt: existingJoinedAt }],
  });
  const withoutTimestamp = createHarness({
    maxStudents: 3,
    memberships: [{ id: 2, classroomId: 7, studentId: 52, status: "rejected", joinedAt: null }],
  });

  await withTimestamp.service.activateClassroomMembership({
    classroomId: 7,
    studentId: 51,
    setJoinedAtOnReactivation: false,
    setJoinedAtIfMissingOnReactivation: true,
  });
  await withoutTimestamp.service.activateClassroomMembership({
    classroomId: 7,
    studentId: 52,
    setJoinedAtOnReactivation: false,
    setJoinedAtIfMissingOnReactivation: true,
  });

  assert.equal(new Date(withTimestamp.store.memberships[0].joinedAt).toISOString(), existingJoinedAt.toISOString());
  assert.equal(new Date(withoutTimestamp.store.memberships[0].joinedAt).toISOString(), "2026-10-22T08:00:00.000Z");
});

test("concurrent duplicate joins create one membership without an error", async () => {
  const h = createHarness({ maxStudents: 2 });

  const results = await Promise.all([activate(h.service, 51), activate(h.service, 51)]);

  assert.equal(results.filter((result) => result.changed).length, 1);
  assert.equal(h.store.memberships.filter((row) => row.studentId === 51).length, 1);
});

test("mixed activation callers cannot both take the last seat", async () => {
  const h = createHarness();

  const results = await Promise.allSettled([
    activate(h.service, 51),
    activate(h.service, 52),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason?.code === "CLASSROOM_CAPACITY_REACHED").length, 1);
  assert.equal(h.store.memberships.filter((row) => row.status === "active").length, 1);
});

test("a multi-student activation rolls back earlier writes when a later student exceeds capacity", async () => {
  const h = createHarness({ maxStudents: 1 });

  await assert.rejects(
    h.service.withLockedClassroom(7, async ({ classroom, transaction }) => {
      await h.service.activateMembershipInTransaction({ classroom, studentId: 51, transaction });
      await h.service.activateMembershipInTransaction({ classroom, studentId: 52, transaction });
    }),
    (error) => error?.code === "CLASSROOM_CAPACITY_REACHED",
  );

  assert.deepEqual(h.store.memberships, []);
});
