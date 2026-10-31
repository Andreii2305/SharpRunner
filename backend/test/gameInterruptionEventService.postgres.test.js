const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { DataTypes, Sequelize } = require("sequelize");

const {
  createGameInterruptionEventService,
} = require("../src/services/gameInterruptionEventService");

const databaseUrl = process.env.GAME_INTERRUPTION_EVENT_DATABASE_URL;
const postgresTest = databaseUrl ? test : test.skip;

postgresTest("event recording deduplicates and serializes with replacement and completion on PostgreSQL", async () => {
  const parsed = new URL(databaseUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
  assert.equal(parsed.pathname.slice(1), "sharprunner_game_interruption_event_rehearsal");

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
  const GameInterruptionEvent = define("GameInterruptionEvents", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sessionId: DataTypes.INTEGER,
    studentId: DataTypes.INTEGER,
    eventKey: DataTypes.STRING,
    eventType: DataTypes.STRING,
    receivedAt: DataTypes.DATE,
    appliedAt: DataTypes.DATE,
    appliedScoreDeduction: DataTypes.DECIMAL(5, 2),
    appliedXpDeduction: DataTypes.INTEGER,
  });
  const models = {
    Classroom,
    ClassroomMembership,
    GameInterruptionEvent,
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
    await database.query('DELETE FROM "GameInterruptionEvents" WHERE "studentId" = 730011');
    await database.query('DELETE FROM "GameInterruptionSessions" WHERE "studentId" = 730011');
    await database.query('DELETE FROM "UserProgresses" WHERE "userId" = 730011');
    await database.query('DELETE FROM "ClassroomMemberships" WHERE "studentId" = 730011');
    await database.query('INSERT INTO "Users" ("id", "role", "status") VALUES (730011, \'student\', \'active\') ON CONFLICT ("id") DO UPDATE SET "role" = EXCLUDED."role", "status" = EXCLUDED."status"');
    await database.query('INSERT INTO "Classrooms" ("id", "isActive") VALUES (730025, TRUE) ON CONFLICT ("id") DO UPDATE SET "isActive" = TRUE');
    await database.query(`
      INSERT INTO "ClassroomMemberships" ("classroomId", "studentId", "status")
      VALUES (730025, 730011, 'active')
    `);
    await database.query(`
      INSERT INTO "UserProgresses" ("userId", "levelKey", "isCompleted")
      VALUES (730011, 'tutorial-level-1', FALSE)
    `);
    const firstSession = await GameInterruptionSession.create({
      studentId: 730011,
      classroomId: 730025,
      levelKey: "tutorial-level-1",
      sessionKey: "pg_event_session_one",
      scoreDeductionSnapshot: 1,
      xpDeductionSnapshot: 10,
      lifecycleStatus: "CURRENT",
      startedAt: new Date(),
    });

    const service = createGameInterruptionEventService({
      database,
      models,
      levelAccessLoader: async () => ({ allowed: true, reason: null }),
      levelSettingsLoader: async () => [{ levelKey: "tutorial-level-1" }],
    });
    const input = (eventKey, sessionId = firstSession.id) => ({
      actorId: 730011,
      actorRole: "student",
      classroomId: 730025,
      levelKey: "tutorial-level-1",
      sessionId,
      eventKey,
      eventType: "hidden",
    });

    const duplicate = await Promise.all([
      service.recordInterruptionEvent(input("pg_event_duplicate")),
      service.recordInterruptionEvent(input("pg_event_duplicate")),
    ]);
    assert.deepEqual(duplicate.map((result) => result.changed).sort(), [false, true]);
    assert.equal(await GameInterruptionEvent.count({
      where: { studentId: 730011, eventKey: "pg_event_duplicate" },
    }), 1);

    await service.recordInterruptionEvent(input("pg_event_before_replace"));
    let releaseReplacement;
    let replacementLocked;
    const replacementHasLocks = new Promise((resolve) => { replacementLocked = resolve; });
    const allowReplacement = new Promise((resolve) => { releaseReplacement = resolve; });
    const replacement = database.transaction(async (transaction) => {
      await Classroom.findByPk(730025, { transaction, lock: transaction.LOCK.UPDATE });
      await ClassroomMembership.findOne({
        where: { classroomId: 730025, studentId: 730011 },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      await User.findByPk(730011, { transaction, lock: transaction.LOCK.UPDATE });
      await UserProgress.findOne({
        where: { userId: 730011, levelKey: "tutorial-level-1" },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const session = await GameInterruptionSession.findByPk(firstSession.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      replacementLocked();
      await allowReplacement;
      session.lifecycleStatus = "SUPERSEDED";
      session.supersededAt = new Date();
      await session.save({ transaction });
    });
    await replacementHasLocks;
    const racingReplacement = service.recordInterruptionEvent(input("pg_event_after_replace"));
    releaseReplacement();
    await replacement;
    await assert.rejects(
      racingReplacement,
      (error) => error.code === "SESSION_NOT_CURRENT",
    );

    const secondSession = await GameInterruptionSession.create({
      studentId: 730011,
      classroomId: 730025,
      levelKey: "tutorial-level-1",
      sessionKey: "pg_event_session_two",
      scoreDeductionSnapshot: 1,
      xpDeductionSnapshot: 10,
      lifecycleStatus: "CURRENT",
      startedAt: new Date(),
    });
    let releaseCompletion;
    let completionLocked;
    const completionHasLock = new Promise((resolve) => { completionLocked = resolve; });
    const allowCompletion = new Promise((resolve) => { releaseCompletion = resolve; });
    const completion = database.transaction(async (transaction) => {
      await User.findByPk(730011, { transaction, lock: transaction.LOCK.UPDATE });
      completionLocked();
      await allowCompletion;
      const progress = await UserProgress.findOne({
        where: { userId: 730011, levelKey: "tutorial-level-1" },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      progress.isCompleted = true;
      await progress.save({ transaction });
    });
    await completionHasLock;
    const racingEvent = service.recordInterruptionEvent(input(
      "pg_event_after_completion",
      secondSession.id,
    ));
    releaseCompletion();
    await completion;
    await assert.rejects(racingEvent, (error) => error.code === "LEVEL_ALREADY_COMPLETED");
    assert.equal(await GameInterruptionEvent.count({
      where: { studentId: 730011, eventKey: "pg_event_after_completion" },
    }), 0);
  } finally {
    await database.close();
  }
});
