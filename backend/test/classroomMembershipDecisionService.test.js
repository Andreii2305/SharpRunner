const assert = require("node:assert/strict");
const { test } = require("node:test");

const ClassroomMembership = require("../src/models/ClassroomMembership");
const {
  createClassroomMembershipDecisionService,
} = require("../src/services/classroomMembershipDecisionService");

const clone = (value) => structuredClone(value);

const createHarness = ({ classrooms, memberships, now = new Date("2026-10-22T08:00:00.000Z") }) => {
  const store = {
    classrooms: clone(classrooms),
    memberships: clone(memberships),
    membershipReads: 0,
    saves: 0,
  };
  const lockTails = new Map();

  const acquireClassroomLock = async (classroomId) => {
    const previous = lockTails.get(classroomId) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    lockTails.set(classroomId, previous.then(() => current));
    await previous;
    return () => {
      release();
      if (lockTails.get(classroomId) === current) lockTails.delete(classroomId);
    };
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

  const models = {
    Classroom: {
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
        store.membershipReads += 1;
        const membership = store.memberships.find((candidate) => (
          candidate.classroomId === Number(where.classroomId)
          && candidate.studentId === Number(where.studentId)
        ));
        if (!membership) return null;
        return {
          ...membership,
          save: async function save({ transaction: saveTransaction }) {
            assert.equal(saveTransaction, transaction);
            store.saves += 1;
            Object.assign(membership, this);
            return this;
          },
        };
      },
      count: async ({ where, transaction }) => {
        assert.ok(transaction);
        const count = store.memberships.filter((membership) => (
          membership.classroomId === Number(where.classroomId)
          && membership.status === where.status
        )).length;
        await new Promise((resolve) => setImmediate(resolve));
        return count;
      },
    },
  };

  return {
    store,
    service: createClassroomMembershipDecisionService({
      sequelize,
      models,
      now: () => new Date(now),
    }),
  };
};

const ownedClassroom = (overrides = {}) => ({
  id: 7,
  teacherId: 41,
  isActive: true,
  maxStudents: 30,
  ...overrides,
});

const membership = (overrides = {}) => ({
  id: 70,
  classroomId: 7,
  studentId: 51,
  status: "pending",
  joinedAt: null,
  updatedAt: new Date("2026-10-21T08:00:00.000Z"),
  ...overrides,
});

const decide = (service, overrides = {}) => service.decidePendingMembership({
  classroomId: 7,
  studentId: 51,
  teacherId: 41,
  decision: "approve",
  ...overrides,
});

const rejectsWith = (promise, status, code) => assert.rejects(
  promise,
  (error) => error?.status === status && error?.code === code,
);

test("membership validation accepts rejected without changing the active default", async () => {
  const rejected = ClassroomMembership.build({
    classroomId: 7,
    studentId: 51,
    status: "rejected",
  });
  await assert.doesNotReject(rejected.validate());
  assert.equal(ClassroomMembership.rawAttributes.status.defaultValue, "active");
});

test("owning teacher approves the exact pending membership at the decision time", async () => {
  const h = createHarness({ classrooms: [ownedClassroom()], memberships: [membership()] });
  const result = await decide(h.service);

  assert.equal(result.changed, true);
  assert.equal(result.membership.status, "active");
  assert.equal(result.membership.joinedAt.toISOString(), "2026-10-22T08:00:00.000Z");
  assert.equal(h.store.memberships[0].status, "active");
  assert.equal(new Date(h.store.memberships[0].joinedAt).toISOString(), "2026-10-22T08:00:00.000Z");
});

test("owning teacher rejects a pending membership without changing joinedAt", async () => {
  const originalJoinedAt = new Date("2026-10-01T08:00:00.000Z");
  const h = createHarness({
    classrooms: [ownedClassroom()],
    memberships: [membership({ joinedAt: originalJoinedAt })],
  });
  const result = await decide(h.service, { decision: "reject" });

  assert.equal(result.changed, true);
  assert.equal(result.membership.status, "rejected");
  assert.equal(result.membership.joinedAt.toISOString(), originalJoinedAt.toISOString());
});

test("ownership is checked before membership state is read", async () => {
  const h = createHarness({ classrooms: [ownedClassroom()], memberships: [membership()] });
  await rejectsWith(decide(h.service, { teacherId: 99 }), 403, "CLASSROOM_MEMBERSHIP_DECISION_FORBIDDEN");
  assert.equal(h.store.membershipReads, 0);
  assert.equal(h.store.memberships[0].status, "pending");
});

test("decision changes only the exact classroom membership", async () => {
  const h = createHarness({
    classrooms: [ownedClassroom(), ownedClassroom({ id: 8 })],
    memberships: [
      membership(),
      membership({ id: 80, classroomId: 8 }),
    ],
  });
  await decide(h.service);

  assert.equal(h.store.memberships.find((row) => row.classroomId === 7).status, "active");
  assert.equal(h.store.memberships.find((row) => row.classroomId === 8).status, "pending");
});

test("repeated matching decisions are no-ops and preserve timestamps", async () => {
  const approvedAt = new Date("2026-10-20T08:00:00.000Z");
  const rejectedJoinedAt = new Date("2026-09-01T08:00:00.000Z");
  const approved = createHarness({
    classrooms: [ownedClassroom()],
    memberships: [membership({ status: "active", joinedAt: approvedAt })],
  });
  const rejected = createHarness({
    classrooms: [ownedClassroom()],
    memberships: [membership({ status: "rejected", joinedAt: rejectedJoinedAt })],
  });

  const approvedResult = await decide(approved.service);
  const rejectedResult = await decide(rejected.service, { decision: "reject" });

  assert.equal(approvedResult.changed, false);
  assert.equal(approvedResult.membership.joinedAt.toISOString(), approvedAt.toISOString());
  assert.equal(rejectedResult.changed, false);
  assert.equal(rejectedResult.membership.joinedAt.toISOString(), rejectedJoinedAt.toISOString());
  assert.equal(approved.store.saves, 0);
  assert.equal(rejected.store.saves, 0);
});

test("incompatible decisions conflict without changing removed or rejected memberships", async () => {
  for (const currentStatus of ["removed", "rejected"]) {
    const h = createHarness({
      classrooms: [ownedClassroom()],
      memberships: [membership({ status: currentStatus })],
    });
    await rejectsWith(decide(h.service), 409, "CLASSROOM_MEMBERSHIP_DECISION_CONFLICT");
    assert.equal(h.store.memberships[0].status, currentStatus);
    assert.equal(h.store.saves, 0);
  }
});

test("approval at capacity leaves the request pending", async () => {
  const h = createHarness({
    classrooms: [ownedClassroom({ maxStudents: 1 })],
    memberships: [
      membership({ id: 71, studentId: 52, status: "active", joinedAt: new Date() }),
      membership(),
    ],
  });
  await rejectsWith(decide(h.service), 409, "CLASSROOM_CAPACITY_REACHED");
  assert.equal(h.store.memberships.find((row) => row.studentId === 51).status, "pending");
  assert.equal(h.store.saves, 0);
});

test("concurrent approvals through the service cannot consume the same last seat", async () => {
  const h = createHarness({
    classrooms: [ownedClassroom({ maxStudents: 1 })],
    memberships: [membership(), membership({ id: 71, studentId: 52 })],
  });
  const results = await Promise.allSettled([
    decide(h.service, { studentId: 51 }),
    decide(h.service, { studentId: 52 }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => (
    result.status === "rejected" && result.reason?.code === "CLASSROOM_CAPACITY_REACHED"
  )).length, 1);
  assert.equal(h.store.memberships.filter((row) => row.status === "active").length, 1);
  assert.equal(h.store.memberships.filter((row) => row.status === "pending").length, 1);
});

test("inactive classrooms reject decisions before membership state is read", async () => {
  const h = createHarness({
    classrooms: [ownedClassroom({ isActive: false })],
    memberships: [membership()],
  });
  await rejectsWith(decide(h.service, { decision: "reject" }), 409, "CLASSROOM_INACTIVE");
  assert.equal(h.store.membershipReads, 0);
  assert.equal(h.store.memberships[0].status, "pending");
});
