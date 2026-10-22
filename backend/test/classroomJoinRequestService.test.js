const assert = require("node:assert/strict");
const { test } = require("node:test");

const ClassroomMembership = require("../src/models/ClassroomMembership");

const clone = (value) => structuredClone(value);

const createHarness = ({
  classrooms = [],
  memberships = [],
  now = new Date("2026-10-22T08:00:00.000Z"),
  beforeLock = () => {},
} = {}) => {
  const store = {
    classrooms: clone(classrooms),
    memberships: clone(memberships),
    creates: 0,
    saves: 0,
    counts: 0,
  };
  const lockTails = new Map();

  const acquireClassroomLock = async (classroomId) => {
    const previous = lockTails.get(classroomId) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    lockTails.set(classroomId, previous.then(() => current));
    await previous;
    return release;
  };

  const sequelize = {
    transaction: async (callback) => {
      const releases = [];
      const transaction = {
        LOCK: { UPDATE: "UPDATE" },
        lockClassroom: async (classroomId) => {
          releases.push(await acquireClassroomLock(classroomId));
        },
      };
      try {
        return await callback(transaction);
      } finally {
        releases.reverse().forEach((release) => release());
      }
    },
  };

  let lookupCount = 0;
  const models = {
    Classroom: {
      findOne: async ({ where }) => {
        lookupCount += 1;
        const submittedCode = where.classCode[Reflect.ownKeys(where.classCode)[0]];
        const classroom = store.classrooms.find((candidate) => (
          candidate.isActive === true
          && candidate.classCode.toUpperCase() === submittedCode.toUpperCase()
        )) ?? null;
        if (classroom) beforeLock(classroom, lookupCount);
        return classroom;
      },
      findByPk: async (id, options) => {
        assert.equal(options.lock, "UPDATE");
        await options.transaction.lockClassroom(Number(id));
        return store.classrooms.find((classroom) => classroom.id === Number(id)) ?? null;
      },
    },
    ClassroomMembership: {
      findOne: async ({ where, transaction, lock }) => {
        assert.ok(transaction);
        assert.equal(lock, "UPDATE");
        const membership = store.memberships.find((candidate) => (
          candidate.classroomId === Number(where.classroomId)
          && candidate.studentId === Number(where.studentId)
        ));
        if (!membership) return null;
        return {
          ...membership,
          save: async function save(options) {
            assert.equal(options.transaction, transaction);
            Object.assign(membership, this);
            store.saves += 1;
            return this;
          },
        };
      },
      create: async (values, { transaction }) => {
        assert.ok(transaction);
        const membership = { id: 100 + store.creates, ...values };
        store.creates += 1;
        store.memberships.push(membership);
        return membership;
      },
      count: async () => {
        store.counts += 1;
        throw new Error("join requests must not count active memberships");
      },
    },
  };

  const { createClassroomJoinRequestService } = require("../src/services/classroomJoinRequestService");
  return {
    store,
    service: createClassroomJoinRequestService({
      sequelize,
      models,
      now: () => new Date(now),
    }),
  };
};

const classroom = (overrides = {}) => ({
  id: 7,
  classCode: "JOIN77",
  className: "C# Fundamentals",
  section: "BSIT 1A",
  schoolYear: "2026-2027",
  maxStudents: 1,
  isActive: true,
  ...overrides,
});

const membership = (overrides = {}) => ({
  id: 70,
  classroomId: 7,
  studentId: 51,
  status: "pending",
  joinedAt: null,
  requestedAt: new Date("2026-10-20T08:00:00.000Z"),
  updatedAt: new Date("2026-10-20T08:00:00.000Z"),
  ...overrides,
});

const submit = (service, overrides = {}) => service.submitJoinRequest({
  classCode: " join77 ",
  studentId: 51,
  ...overrides,
});

test("membership model exposes a nullable requestedAt without changing existing defaults", () => {
  assert.equal(ClassroomMembership.rawAttributes.requestedAt.allowNull, true);
  assert.equal(ClassroomMembership.rawAttributes.requestedAt.defaultValue, null);
  assert.equal(ClassroomMembership.rawAttributes.joinedAt.defaultValue.key, "NOW");
  assert.equal(ClassroomMembership.rawAttributes.status.defaultValue, "active");
});

test("new join request creates one pending membership with explicit request and null join timestamps", async () => {
  const h = createHarness({ classrooms: [classroom()] });

  const result = await submit(h.service);

  assert.equal(result.changed, true);
  assert.equal(result.created, true);
  assert.equal(h.store.memberships.length, 1);
  assert.equal(h.store.memberships[0].status, "pending");
  assert.equal(h.store.memberships[0].joinedAt, null);
  assert.equal(h.store.memberships[0].requestedAt.toISOString(), "2026-10-22T08:00:00.000Z");
  assert.equal(h.store.counts, 0);
});

test("repeated pending request is an unchanged timestamp-preserving result", async () => {
  const requestedAt = new Date("2026-10-20T08:00:00.000Z");
  const updatedAt = new Date("2026-10-20T09:00:00.000Z");
  const h = createHarness({
    classrooms: [classroom()],
    memberships: [membership({ requestedAt, updatedAt })],
  });

  const result = await submit(h.service);

  assert.equal(result.changed, false);
  assert.equal(result.membership.status, "pending");
  assert.equal(result.membership.requestedAt.toISOString(), requestedAt.toISOString());
  assert.equal(result.membership.updatedAt.toISOString(), updatedAt.toISOString());
  assert.equal(h.store.saves, 0);
});

test("existing active membership is unchanged with every timestamp preserved", async () => {
  const joinedAt = new Date("2026-09-01T08:00:00.000Z");
  const requestedAt = new Date("2026-08-01T08:00:00.000Z");
  const updatedAt = new Date("2026-10-01T08:00:00.000Z");
  const h = createHarness({
    classrooms: [classroom()],
    memberships: [membership({ status: "active", joinedAt, requestedAt, updatedAt })],
  });

  const result = await submit(h.service);

  assert.equal(result.changed, false);
  assert.equal(result.membership.status, "active");
  assert.equal(result.membership.joinedAt.toISOString(), joinedAt.toISOString());
  assert.equal(result.membership.requestedAt.toISOString(), requestedAt.toISOString());
  assert.equal(result.membership.updatedAt.toISOString(), updatedAt.toISOString());
  assert.equal(h.store.saves, 0);
});

test("removed and rejected memberships resubmit as pending with a fresh requestedAt and preserved joinedAt", async () => {
  for (const status of ["removed", "rejected"]) {
    const joinedAt = new Date("2026-09-01T08:00:00.000Z");
    const h = createHarness({
      classrooms: [classroom()],
      memberships: [membership({ status, joinedAt })],
    });

    const result = await submit(h.service);

    assert.equal(result.changed, true);
    assert.equal(result.membership.status, "pending");
    assert.equal(result.membership.joinedAt.toISOString(), joinedAt.toISOString());
    assert.equal(result.membership.requestedAt.toISOString(), "2026-10-22T08:00:00.000Z");
    assert.equal(h.store.memberships[0].status, "pending");
    assert.equal(new Date(h.store.memberships[0].joinedAt).toISOString(), joinedAt.toISOString());
  }
});

test("invalid and inactive classroom codes are rejected", async () => {
  const invalid = createHarness({ classrooms: [classroom()] });
  const inactive = createHarness({ classrooms: [classroom({ isActive: false })] });

  await assert.rejects(submit(invalid.service, { classCode: "missing" }), (error) => (
    error?.status === 404 && error?.code === "CLASSROOM_NOT_FOUND"
  ));
  await assert.rejects(submit(inactive.service), (error) => (
    error?.status === 404 && error?.code === "CLASSROOM_NOT_FOUND"
  ));
});

test("code rotation or deactivation before the lock rejects without reading membership state", async () => {
  for (const transition of [
    (lockedClassroom) => { lockedClassroom.classCode = "ROTATED"; },
    (lockedClassroom) => { lockedClassroom.isActive = false; },
  ]) {
    const h = createHarness({
      classrooms: [classroom()],
      beforeLock: transition,
    });

    await assert.rejects(submit(h.service), (error) => (
      error?.status === 404 && error?.code === "CLASSROOM_NOT_FOUND"
    ));
    assert.equal(h.store.memberships.length, 0);
  }
});

test("full classroom accepts a pending request without consuming a seat", async () => {
  const h = createHarness({
    classrooms: [classroom({ maxStudents: 1 })],
    memberships: [membership({ id: 71, studentId: 52, status: "active" })],
  });

  const result = await submit(h.service);

  assert.equal(result.membership.status, "pending");
  assert.equal(h.store.memberships.filter((row) => row.status === "active").length, 1);
  assert.equal(h.store.memberships.filter((row) => row.status === "pending").length, 1);
  assert.equal(h.store.counts, 0);
});

test("concurrent duplicate submissions create one membership without an error", async () => {
  const h = createHarness({ classrooms: [classroom()] });

  const results = await Promise.all([submit(h.service), submit(h.service)]);

  assert.equal(results.filter((result) => result.changed).length, 1);
  assert.equal(h.store.memberships.length, 1);
  assert.equal(h.store.creates, 1);
});
