const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DataTypes, Sequelize } = require("sequelize");

const databaseUrl = process.env.PRIVATE_CHECK_IN_SERVICE_DATABASE_URL;
const postgresTest = databaseUrl ? test : test.skip;

const assertDisposableDatabase = (value) => {
  const parsed = new URL(value);
  assert.match(parsed.protocol, /^postgres(?:ql)?:$/);
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
  assert.equal(parsed.pathname.slice(1), "sharprunner_private_check_in_service_test");
};

postgresTest("PostgreSQL sender-key uniqueness safely resolves concurrent private check-ins", async () => {
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
    teacherId: { type: DataTypes.INTEGER, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false },
  });
  const ClassroomMembership = database.define("ClassroomMemberships", {
    classroomId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false },
  }, {
    indexes: [{ unique: true, fields: ["classroomId", "studentId"] }],
  });
  const TeacherStudentCheckIn = database.define("TeacherStudentCheckIns", {
    senderId: { type: DataTypes.INTEGER, allowNull: false },
    senderRole: { type: DataTypes.STRING(16), allowNull: false },
    recipientStudentId: { type: DataTypes.INTEGER, allowNull: false },
    classroomId: { type: DataTypes.INTEGER, allowNull: false },
    message: { type: DataTypes.STRING(1000), allowNull: false },
    idempotencyKey: { type: DataTypes.STRING(96), allowNull: false },
  }, {
    indexes: [{
      unique: true,
      fields: ["senderId", "idempotencyKey"],
      name: "teacher_student_check_ins_sender_key",
    }],
  });
  const { createPrivateCheckInService } = require("../src/services/privateCheckInService");
  const service = createPrivateCheckInService({
    sequelize: database,
    models: { Classroom, ClassroomMembership, TeacherStudentCheckIn, User },
  });

  const request = (overrides = {}) => service.createPrivateCheckIn({
    actorId: 41,
    actorRole: "teacher",
    classroomId: 7,
    studentId: 51,
    message: "Could we check in after class?",
    idempotencyKey: "concurrent_key_1",
    ...overrides,
  });

  try {
    await database.sync({ force: true });
    await User.bulkCreate([
      { id: 41, role: "teacher", status: "active" },
      { id: 51, role: "student", status: "active" },
      { id: 52, role: "student", status: "active" },
    ]);
    await Classroom.bulkCreate([
      { id: 7, teacherId: 41, isActive: true },
      { id: 8, teacherId: 41, isActive: true },
    ]);
    await ClassroomMembership.bulkCreate([
      { classroomId: 7, studentId: 51, status: "active" },
      { classroomId: 8, studentId: 52, status: "active" },
    ]);

    const matching = await Promise.all([request(), request()]);
    assert.equal(matching.filter((result) => result.changed).length, 1);
    assert.equal(matching.filter((result) => !result.changed).length, 1);
    assert.equal(await TeacherStudentCheckIn.count(), 1);

    const conflicting = await Promise.allSettled([
      request({ idempotencyKey: "cross_class_key_1" }),
      request({
        classroomId: 8,
        studentId: 52,
        message: "A different payload",
        idempotencyKey: "cross_class_key_1",
      }),
    ]);
    assert.equal(conflicting.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(conflicting.filter((result) => (
      result.status === "rejected"
        && result.reason?.code === "IDEMPOTENCY_KEY_CONFLICT"
    )).length, 1);
    assert.equal(await TeacherStudentCheckIn.count({
      where: { senderId: 41, idempotencyKey: "cross_class_key_1" },
    }), 1);
  } finally {
    await database.drop().catch(() => undefined);
    await database.close();
  }
});
