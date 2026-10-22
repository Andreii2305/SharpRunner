const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DataTypes, Sequelize } = require("sequelize");

const databaseUrl = process.env.CLASSROOM_MEMBERSHIP_TEST_DATABASE_URL;
const run = databaseUrl ? test : test.skip;

const assertDisposableDatabase = (value) => {
  const parsed = new URL(value);
  assert.match(parsed.protocol, /^postgres(?:ql)?:$/, "test database must use PostgreSQL");
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname), "test database must be local-only");
  assert.equal(parsed.pathname.slice(1), "sharprunner_membership_decision_test", "test database must be dedicated");
};

run("real PostgreSQL classroom lock prevents concurrent approvals from exceeding capacity", async () => {
  assertDisposableDatabase(databaseUrl);
  const sequelize = new Sequelize(databaseUrl, { logging: false, pool: { min: 0, max: 5 } });
  const Classroom = sequelize.define("Classrooms", {
    teacherId: { type: DataTypes.INTEGER, allowNull: false },
    className: { type: DataTypes.STRING, allowNull: false },
    section: { type: DataTypes.STRING, allowNull: false },
    schoolYear: { type: DataTypes.STRING, allowNull: false },
    classCode: { type: DataTypes.STRING, allowNull: false, unique: true },
    maxStudents: { type: DataTypes.INTEGER, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  });
  const Membership = sequelize.define("ClassroomMemberships", {
    classroomId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false },
    joinedAt: { type: DataTypes.DATE, allowNull: true },
  }, { indexes: [{ unique: true, fields: ["classroomId", "studentId"] }] });
  const { createClassroomMembershipDecisionService } = require("../src/services/classroomMembershipDecisionService");
  const service = createClassroomMembershipDecisionService({
    sequelize,
    models: { Classroom, ClassroomMembership: Membership },
    now: () => new Date("2026-10-22T08:00:00.000Z"),
  });

  try {
    await sequelize.sync({ force: true });
    const classroom = await Classroom.create({
      teacherId: 41,
      className: "Concurrency",
      section: "A",
      schoolYear: "2026-2027",
      classCode: "LOCK01",
      maxStudents: 1,
      isActive: true,
    });
    await Membership.bulkCreate([
      { classroomId: classroom.id, studentId: 51, status: "pending", joinedAt: null },
      { classroomId: classroom.id, studentId: 52, status: "pending", joinedAt: null },
    ]);

    const results = await Promise.allSettled([51, 52].map((studentId) => (
      service.decidePendingMembership({
        classroomId: classroom.id,
        studentId,
        teacherId: 41,
        decision: "approve",
      })
    )));
    const rows = await Membership.findAll({ order: [["studentId", "ASC"]] });

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => (
      result.status === "rejected" && result.reason?.code === "CLASSROOM_CAPACITY_REACHED"
    )).length, 1);
    assert.equal(rows.filter((row) => row.status === "active").length, 1);
    assert.equal(rows.filter((row) => row.status === "pending").length, 1);
  } finally {
    await sequelize.drop().catch(() => undefined);
    await sequelize.close();
  }
});

run("real PostgreSQL classroom lock serializes join and approval paths competing for one seat", async () => {
  assertDisposableDatabase(databaseUrl);
  const sequelize = new Sequelize(databaseUrl, { logging: false, pool: { min: 0, max: 5 } });
  const Classroom = sequelize.define("Classrooms", {
    teacherId: { type: DataTypes.INTEGER, allowNull: false },
    className: { type: DataTypes.STRING, allowNull: false },
    section: { type: DataTypes.STRING, allowNull: false },
    schoolYear: { type: DataTypes.STRING, allowNull: false },
    classCode: { type: DataTypes.STRING, allowNull: false, unique: true },
    maxStudents: { type: DataTypes.INTEGER, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  });
  const Membership = sequelize.define("ClassroomMemberships", {
    classroomId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false },
    joinedAt: { type: DataTypes.DATE, allowNull: true },
  }, { indexes: [{ unique: true, fields: ["classroomId", "studentId"] }] });
  const models = { Classroom, ClassroomMembership: Membership };
  const { createClassroomEnrollmentService } = require("../src/services/classroomEnrollmentService");
  const { createClassroomMembershipDecisionService } = require("../src/services/classroomMembershipDecisionService");
  const enrollmentService = createClassroomEnrollmentService({ sequelize, models });
  const decisionService = createClassroomMembershipDecisionService({ sequelize, models });

  try {
    await sequelize.sync({ force: true });
    const classroom = await Classroom.create({
      teacherId: 41,
      className: "Mixed concurrency",
      section: "A",
      schoolYear: "2026-2027",
      classCode: "MIXED1",
      maxStudents: 1,
      isActive: true,
    });
    await Membership.create({
      classroomId: classroom.id,
      studentId: 52,
      status: "pending",
      joinedAt: null,
    });

    const results = await Promise.allSettled([
      enrollmentService.activateClassroomMembership({
        classroomId: classroom.id,
        studentId: 51,
      }),
      decisionService.decidePendingMembership({
        classroomId: classroom.id,
        studentId: 52,
        teacherId: 41,
        decision: "approve",
      }),
    ]);
    const rows = await Membership.findAll({ order: [["studentId", "ASC"]] });

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => (
      result.status === "rejected" && result.reason?.code === "CLASSROOM_CAPACITY_REACHED"
    )).length, 1);
    assert.equal(rows.filter((row) => row.status === "active").length, 1);
    assert.equal(rows.find((row) => row.studentId === 52).status, results[1].status === "fulfilled" ? "active" : "pending");
  } finally {
    await sequelize.drop().catch(() => undefined);
    await sequelize.close();
  }
});

run("real PostgreSQL classroom lock serializes teacher reactivation against another activation", async () => {
  assertDisposableDatabase(databaseUrl);
  const sequelize = new Sequelize(databaseUrl, { logging: false, pool: { min: 0, max: 5 } });
  const Classroom = sequelize.define("Classrooms", {
    teacherId: { type: DataTypes.INTEGER, allowNull: false },
    className: { type: DataTypes.STRING, allowNull: false },
    section: { type: DataTypes.STRING, allowNull: false },
    schoolYear: { type: DataTypes.STRING, allowNull: false },
    classCode: { type: DataTypes.STRING, allowNull: false, unique: true },
    maxStudents: { type: DataTypes.INTEGER, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  });
  const Membership = sequelize.define("ClassroomMemberships", {
    classroomId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false },
    joinedAt: { type: DataTypes.DATE, allowNull: true },
  }, { indexes: [{ unique: true, fields: ["classroomId", "studentId"] }] });
  const models = { Classroom, ClassroomMembership: Membership };
  const { createClassroomEnrollmentService } = require("../src/services/classroomEnrollmentService");
  const enrollmentService = createClassroomEnrollmentService({ sequelize, models });
  const originalJoinedAt = new Date("2026-09-01T08:00:00.000Z");

  try {
    await sequelize.sync({ force: true });
    const classroom = await Classroom.create({
      teacherId: 41,
      className: "Reactivation concurrency",
      section: "A",
      schoolYear: "2026-2027",
      classCode: "REACT1",
      maxStudents: 1,
      isActive: true,
    });
    await Membership.create({
      classroomId: classroom.id,
      studentId: 51,
      status: "removed",
      joinedAt: originalJoinedAt,
    });

    const reactivate = enrollmentService.withLockedClassroom(
      classroom.id,
      async ({ classroom: lockedClassroom, transaction }) => {
        const membership = await enrollmentService.findMembershipInTransaction({
          classroomId: classroom.id,
          studentId: 51,
          transaction,
        });
        return enrollmentService.activateMembershipInTransaction({
          classroom: lockedClassroom,
          studentId: 51,
          transaction,
          membership,
          setJoinedAtOnReactivation: false,
          setJoinedAtIfMissingOnReactivation: true,
        });
      },
    );
    const competingActivation = enrollmentService.activateClassroomMembership({
      classroomId: classroom.id,
      studentId: 52,
    });
    const results = await Promise.allSettled([reactivate, competingActivation]);
    const rows = await Membership.findAll({ order: [["studentId", "ASC"]] });
    const reactivationRow = rows.find((row) => row.studentId === 51);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => (
      result.status === "rejected" && result.reason?.code === "CLASSROOM_CAPACITY_REACHED"
    )).length, 1);
    assert.equal(rows.filter((row) => row.status === "active").length, 1);
    assert.equal(reactivationRow.status, results[0].status === "fulfilled" ? "active" : "removed");
    assert.equal(reactivationRow.joinedAt.toISOString(), originalJoinedAt.toISOString());
  } finally {
    await sequelize.drop().catch(() => undefined);
    await sequelize.close();
  }
});

run("real PostgreSQL classroom lock makes duplicate join-request submissions idempotent", async () => {
  assertDisposableDatabase(databaseUrl);
  const sequelize = new Sequelize(databaseUrl, { logging: false, pool: { min: 0, max: 5 } });
  const Classroom = sequelize.define("Classrooms", {
    teacherId: { type: DataTypes.INTEGER, allowNull: false },
    className: { type: DataTypes.STRING, allowNull: false },
    section: { type: DataTypes.STRING, allowNull: false },
    schoolYear: { type: DataTypes.STRING, allowNull: false },
    classCode: { type: DataTypes.STRING, allowNull: false, unique: true },
    maxStudents: { type: DataTypes.INTEGER, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  });
  const Membership = sequelize.define("ClassroomMemberships", {
    classroomId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false },
    joinedAt: { type: DataTypes.DATE, allowNull: true },
    requestedAt: { type: DataTypes.DATE, allowNull: true },
  }, { indexes: [{ unique: true, fields: ["classroomId", "studentId"] }] });
  const { createClassroomJoinRequestService } = require("../src/services/classroomJoinRequestService");
  const service = createClassroomJoinRequestService({
    sequelize,
    models: { Classroom, ClassroomMembership: Membership },
    now: () => new Date("2026-10-22T08:00:00.000Z"),
  });

  try {
    await sequelize.sync({ force: true });
    const classroom = await Classroom.create({
      teacherId: 41,
      className: "Duplicate request concurrency",
      section: "A",
      schoolYear: "2026-2027",
      classCode: "REQ001",
      maxStudents: 1,
      isActive: true,
    });

    const results = await Promise.all([
      service.submitJoinRequest({ classCode: " req001 ", studentId: 51 }),
      service.submitJoinRequest({ classCode: "REQ001", studentId: 51 }),
    ]);
    const rows = await Membership.findAll({
      where: { classroomId: classroom.id, studentId: 51 },
    });

    assert.equal(results.filter((result) => result.changed).length, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "pending");
    assert.equal(rows[0].joinedAt, null);
    assert.equal(rows[0].requestedAt.toISOString(), "2026-10-22T08:00:00.000Z");
  } finally {
    await sequelize.drop().catch(() => undefined);
    await sequelize.close();
  }
});
