const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DataTypes, Sequelize } = require("sequelize");

const databaseUrl = process.env.STUDENT_CLASSROOM_FEEDBACK_SERVICE_DATABASE_URL;
const postgresTest = databaseUrl ? test : test.skip;

const assertDisposableDatabase = (value) => {
  const parsed = new URL(value);
  assert.match(parsed.protocol, /^postgres(?:ql)?:$/);
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
  assert.equal(parsed.pathname.slice(1), "sharprunner_student_classroom_feedback_service_test");
};

postgresTest("PostgreSQL student-key uniqueness safely resolves concurrent feedback", async () => {
  assertDisposableDatabase(databaseUrl);
  const database = new Sequelize(databaseUrl, {
    logging: false,
    pool: { min: 0, max: 5 },
  });
  const User = database.define("Users", {
    role: { type: DataTypes.STRING(16), allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false },
  });
  const Classroom = database.define("Classrooms", {
    isActive: { type: DataTypes.BOOLEAN, allowNull: false },
  });
  const ClassroomMembership = database.define("ClassroomMemberships", {
    classroomId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false },
  }, {
    indexes: [{ unique: true, fields: ["classroomId", "studentId"] }],
  });
  const StudentClassroomFeedback = database.define("StudentClassroomFeedbacks", {
    classroomId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    message: { type: DataTypes.STRING(1000), allowNull: false },
    idempotencyKey: { type: DataTypes.STRING(96), allowNull: false },
  }, {
    indexes: [{
      unique: true,
      fields: ["studentId", "idempotencyKey"],
      name: "student_classroom_feedback_student_key",
    }],
  });
  const { createStudentClassroomFeedbackService } = require("../src/services/studentClassroomFeedbackService");
  const service = createStudentClassroomFeedbackService({
    sequelize: database,
    models: { Classroom, ClassroomMembership, StudentClassroomFeedback, User },
  });

  const submit = (overrides = {}) => service.submitStudentClassroomFeedback({
    actorId: 51,
    actorRole: "student",
    classroomId: 7,
    message: "The worked examples helped me.",
    idempotencyKey: "concurrent_key_1",
    ...overrides,
  });

  try {
    await database.sync({ force: true });
    await User.create({ id: 51, role: "student", status: "active" });
    await Classroom.bulkCreate([
      { id: 7, isActive: true },
      { id: 8, isActive: true },
    ]);
    await ClassroomMembership.bulkCreate([
      { classroomId: 7, studentId: 51, status: "active" },
      { classroomId: 8, studentId: 51, status: "active" },
    ]);

    const matching = await Promise.all([submit(), submit()]);
    assert.equal(matching.filter(({ changed }) => changed).length, 1);
    assert.equal(matching.filter(({ changed }) => !changed).length, 1);
    assert.equal(await StudentClassroomFeedback.count(), 1);

    const conflicting = await Promise.allSettled([
      submit({ idempotencyKey: "cross_class_key_1" }),
      submit({
        classroomId: 8,
        message: "Different classroom feedback",
        idempotencyKey: "cross_class_key_1",
      }),
    ]);
    assert.equal(conflicting.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(conflicting.filter((result) => (
      result.status === "rejected"
        && result.reason?.code === "IDEMPOTENCY_KEY_CONFLICT"
    )).length, 1);
    assert.equal(await StudentClassroomFeedback.count({
      where: { studentId: 51, idempotencyKey: "cross_class_key_1" },
    }), 1);
  } finally {
    await database.drop().catch(() => undefined);
    await database.close();
  }
});
