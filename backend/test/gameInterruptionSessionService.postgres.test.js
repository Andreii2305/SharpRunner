const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { DataTypes, Sequelize } = require("sequelize");

const {
  createGameInterruptionSessionService,
} = require("../src/services/gameInterruptionSessionService");

const databaseUrl = process.env.GAME_INTERRUPTION_SESSION_DATABASE_URL;
const postgresTest = databaseUrl ? test : test.skip;

postgresTest("session creation serializes concurrent starts and first completion on PostgreSQL", async () => {
  const parsed = new URL(databaseUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
  assert.equal(parsed.pathname.slice(1), "sharprunner_game_interruption_session_rehearsal");

  const database = new Sequelize(databaseUrl, { logging: false });
  const define = (name, attributes, options = {}) => database.define(name, attributes, {
    tableName: name,
    freezeTableName: true,
    ...options,
  });
  const User = define("Users", {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    role: DataTypes.STRING,
    status: DataTypes.STRING,
  }, { timestamps: false });
  const Classroom = define("Classrooms", {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    isActive: DataTypes.BOOLEAN,
  }, { timestamps: false });
  const ClassroomMembership = define("ClassroomMemberships", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    classroomId: DataTypes.INTEGER,
    studentId: DataTypes.INTEGER,
    status: DataTypes.STRING,
  }, { timestamps: false });
  const UserProgress = define("UserProgresses", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: DataTypes.INTEGER,
    levelKey: DataTypes.STRING,
    isCompleted: DataTypes.BOOLEAN,
  }, { timestamps: false });
  const GameInterruptionSession = define("GameInterruptionSessions", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    studentId: DataTypes.INTEGER,
    classroomId: DataTypes.INTEGER,
    levelKey: DataTypes.STRING,
    sessionKey: DataTypes.STRING,
    scoreDeductionSnapshot: DataTypes.DECIMAL(5, 2),
    xpDeductionSnapshot: DataTypes.INTEGER,
    lifecycleStatus: DataTypes.STRING,
    startedAt: DataTypes.DATE,
    supersededAt: DataTypes.DATE,
    completedAt: DataTypes.DATE,
  });
  const models = {
    Classroom,
    ClassroomMembership,
    GameInterruptionSession,
    User,
    UserProgress,
  };
  const migrationSql = fs.readFileSync(path.resolve(
    __dirname,
    "../../supabase/migrations/20261030000000_game_interruption_history.sql",
  ), "utf8");

  await database.authenticate();
  try {
    await database.query(`
      CREATE TABLE IF NOT EXISTS "Users" (
        "id" INTEGER PRIMARY KEY, "role" VARCHAR(20), "status" VARCHAR(20)
      );
      CREATE TABLE IF NOT EXISTS "Classrooms" (
        "id" INTEGER PRIMARY KEY, "isActive" BOOLEAN NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "ClassroomMemberships" (
        "id" SERIAL PRIMARY KEY, "classroomId" INTEGER NOT NULL,
        "studentId" INTEGER NOT NULL, "status" VARCHAR(20) NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "UserProgresses" (
        "id" SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL,
        "levelKey" VARCHAR(64) NOT NULL, "isCompleted" BOOLEAN NOT NULL
      );
    `);
    await database.query(migrationSql);
    await database.query('DELETE FROM "GameInterruptionEvents" WHERE "studentId" = 720011');
    await database.query('DELETE FROM "GameInterruptionSessions" WHERE "studentId" = 720011');
    await database.query('DELETE FROM "UserProgresses" WHERE "userId" = 720011');
    await database.query('DELETE FROM "ClassroomMemberships" WHERE "studentId" = 720011');
    await database.query('INSERT INTO "Users" ("id", "role", "status") VALUES (720011, \'student\', \'active\') ON CONFLICT ("id") DO UPDATE SET "role" = EXCLUDED."role", "status" = EXCLUDED."status"');
    await database.query('INSERT INTO "Classrooms" ("id", "isActive") VALUES (720025, TRUE), (720026, TRUE) ON CONFLICT ("id") DO UPDATE SET "isActive" = TRUE');
    await database.query(`
      INSERT INTO "ClassroomMemberships" ("classroomId", "studentId", "status")
      VALUES (720025, 720011, 'active'), (720026, 720011, 'active')
    `);
    await database.query(`
      INSERT INTO "UserProgresses" ("userId", "levelKey", "isCompleted")
      VALUES (720011, 'tutorial-level-1', FALSE)
    `);

    const service = createGameInterruptionSessionService({
      database,
      models,
      levelAccessLoader: async () => ({ allowed: true, reason: null }),
      levelSettingsLoader: async () => [{
        levelKey: "tutorial-level-1",
        interruptionScoreDeduction: 1,
        interruptionXpDeduction: 10,
      }],
    });
    const input = (sessionKey, classroomId = 720025) => ({
      actorId: 720011,
      actorRole: "student",
      classroomId,
      levelKey: "tutorial-level-1",
      sessionKey,
    });

    const duplicate = await Promise.all([
      service.startInterruptionSession(input("pg_session_duplicate")),
      service.startInterruptionSession(input("pg_session_duplicate")),
    ]);
    assert.deepEqual(duplicate.map((result) => result.changed).sort(), [false, true]);

    const replacements = await Promise.all([
      service.startInterruptionSession(input("pg_session_left")),
      service.startInterruptionSession(input("pg_session_right")),
    ]);
    assert.equal(replacements.every((result) => result.changed), true);
    assert.equal(await GameInterruptionSession.count({
      where: {
        studentId: 720011,
        classroomId: 720025,
        levelKey: "tutorial-level-1",
        lifecycleStatus: "CURRENT",
      },
    }), 1);

    let releaseCompletion;
    let completionLocked;
    const completionHasLock = new Promise((resolve) => { completionLocked = resolve; });
    const allowCompletion = new Promise((resolve) => { releaseCompletion = resolve; });
    const completion = database.transaction(async (transaction) => {
      await User.findByPk(720011, { transaction, lock: transaction.LOCK.UPDATE });
      completionLocked();
      await allowCompletion;
      const progress = await UserProgress.findOne({
        where: { userId: 720011, levelKey: "tutorial-level-1" },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      progress.isCompleted = true;
      await progress.save({ transaction });
    });
    await completionHasLock;
    const racingStart = service.startInterruptionSession(input("pg_session_after_completion"));
    releaseCompletion();
    await completion;
    await assert.rejects(racingStart, (error) => error.code === "LEVEL_ALREADY_COMPLETED");
  } finally {
    await database.close();
  }
});
