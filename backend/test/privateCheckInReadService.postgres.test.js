const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DataTypes, Sequelize } = require("sequelize");

const databaseUrl = process.env.PRIVATE_CHECK_IN_READ_DATABASE_URL;
const postgresTest = databaseUrl ? test : test.skip;

const assertDisposableDatabase = (value) => {
  const parsed = new URL(value);
  assert.match(parsed.protocol, /^postgres(?:ql)?:$/);
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
  assert.equal(parsed.pathname.slice(1), "sharprunner_private_check_in_read_test");
};

postgresTest("PostgreSQL check-in aggregate counts only exact recipient-owned canonical read keys", async () => {
  assertDisposableDatabase(databaseUrl);
  const database = new Sequelize(databaseUrl, { logging: false });
  const User = database.define("Users", {
    firstName: DataTypes.STRING,
    lastName: DataTypes.STRING,
    username: DataTypes.STRING,
    status: DataTypes.STRING,
  });
  const Classroom = database.define("Classrooms", {
    className: DataTypes.STRING,
    section: DataTypes.STRING,
    schoolYear: DataTypes.STRING,
    isActive: DataTypes.BOOLEAN,
  });
  const TeacherStudentCheckIn = database.define("TeacherStudentCheckIns", {
    senderRole: { type: DataTypes.STRING, allowNull: false },
    senderId: { type: DataTypes.INTEGER, allowNull: false },
    recipientStudentId: { type: DataTypes.INTEGER, allowNull: false },
    classroomId: { type: DataTypes.INTEGER, allowNull: false },
    message: { type: DataTypes.STRING, allowNull: false },
  });
  const UserNotificationView = database.define("UserNotificationViews", {
    userId: { type: DataTypes.INTEGER, allowNull: false },
    notificationKey: { type: DataTypes.STRING, allowNull: false },
    viewedAt: { type: DataTypes.DATE, allowNull: false },
  });
  TeacherStudentCheckIn.belongsTo(User, { foreignKey: "senderId", as: "sender", constraints: false });
  TeacherStudentCheckIn.belongsTo(Classroom, { foreignKey: "classroomId", as: "classroom", constraints: false });

  const { createPrivateCheckInReadService } = require("../src/services/privateCheckInReadService");
  const service = createPrivateCheckInReadService({
    database,
    models: { TeacherStudentCheckIn, UserNotificationView, User, Classroom },
  });

  try {
    await database.sync({ force: true });
    await User.bulkCreate([
      { id: 41, firstName: "Inactive", lastName: "Sender", username: "sender", status: "inactive" },
      { id: 51, firstName: "Recipient", lastName: "Student", username: "recipient", status: "active" },
      { id: 52, firstName: "Other", lastName: "Student", username: "other", status: "active" },
    ]);
    await Classroom.create({
      id: 7, className: "Archived classroom", section: "A", schoolYear: "2026", isActive: false,
    });
    const created = await TeacherStudentCheckIn.bulkCreate([
      { senderRole: "teacher", senderId: 41, recipientStudentId: 51, classroomId: 7, message: "Newest" },
      { senderRole: "admin", senderId: 999, recipientStudentId: 51, classroomId: 999, message: "Missing associations" },
      { senderRole: "teacher", senderId: 41, recipientStudentId: 51, classroomId: 7, message: "Oldest" },
      { senderRole: "teacher", senderId: 41, recipientStudentId: 52, classroomId: 7, message: "Another student" },
    ]);
    const [newest, missing, oldest] = created;
    const sameTime = new Date("2026-10-25T10:00:00.000Z");
    await newest.update({ createdAt: sameTime }, { silent: true });
    await missing.update({ createdAt: sameTime }, { silent: true });
    await oldest.update({ createdAt: new Date("2026-10-24T10:00:00.000Z") }, { silent: true });
    await UserNotificationView.bulkCreate([
      { userId: 51, notificationKey: `check-in-${newest.id}`, viewedAt: new Date() },
      { userId: 52, notificationKey: `check-in-${missing.id}`, viewedAt: new Date() },
      { userId: 51, notificationKey: `check-in-${oldest.id}-stale`, viewedAt: new Date() },
      { userId: 51, notificationKey: "check-in-999999", viewedAt: new Date() },
    ]);

    const result = await service.listPrivateCheckIns({ studentId: 51, page: 1, limit: 2, offset: 0 });
    assert.equal(result.total, 3);
    assert.equal(result.unreadTotal, 2);
    assert.deepEqual(result.checkIns.map((row) => row.id), [
      `check-in-${missing.id}`,
      `check-in-${newest.id}`,
    ]);
    assert.equal(result.checkIns[0].sender, null);
    assert.equal(result.checkIns[0].classroom, null);
    assert.equal(result.checkIns[1].sender.username, "sender");
    assert.equal(result.checkIns[1].classroom.isActive, false);
    assert.equal(result.checkIns[1].isRead, true);
  } finally {
    await database.drop().catch(() => undefined);
    await database.close();
  }
});
