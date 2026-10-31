const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { DataTypes, Sequelize } = require("sequelize");

const {
  createGameInterruptionCompletionService,
} = require("../src/services/gameInterruptionCompletionService");

const databaseUrl = process.env.GAME_INTERRUPTION_COMPLETION_DATABASE_URL;
const postgresTest = databaseUrl ? test : test.skip;

postgresTest("cross-classroom first completions serialize to one immutable PostgreSQL result", async () => {
  const parsed = new URL(databaseUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
  assert.equal(
    parsed.pathname.slice(1),
    "sharprunner_game_interruption_completion_rehearsal",
  );

  const database = new Sequelize(databaseUrl, { logging: false });
  const schema = `completion_${crypto.randomUUID().replaceAll("-", "")}`;
  await database.authenticate();
  await database.createSchema(schema);
  const define = (name, attributes, options = {}) => database.define(name, attributes, {
    tableName: name,
    schema,
    freezeTableName: true,
    ...options,
  });
  const User = define("Users", {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    role: DataTypes.STRING,
    status: DataTypes.STRING,
    xpTotal: DataTypes.INTEGER,
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
    orderIndex: DataTypes.INTEGER,
    progressPercent: DataTypes.INTEGER,
    isCompleted: DataTypes.BOOLEAN,
    completedAt: DataTypes.DATE,
    attemptCount: DataTypes.INTEGER,
    timeSpentSeconds: DataTypes.INTEGER,
    hintUsed: DataTypes.BOOLEAN,
    activeSessionId: DataTypes.STRING,
    finalScore: DataTypes.DECIMAL(5, 2),
    xpAwarded: DataTypes.INTEGER,
    xpAwardedAt: DataTypes.DATE,
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
  const GameInterruptionCompletionEvidence = define(
    "GameInterruptionCompletionEvidence",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      studentId: DataTypes.INTEGER,
      classroomId: DataTypes.INTEGER,
      levelKey: DataTypes.STRING,
      policyVersion: DataTypes.STRING,
      appliedEventCount: DataTypes.INTEGER,
      baseScore: DataTypes.DECIMAL(5, 2),
      scoreDeduction: DataTypes.DECIMAL(5, 2),
      finalScore: DataTypes.DECIMAL(5, 2),
      grossCompletionXp: DataTypes.INTEGER,
      xpDeduction: DataTypes.INTEGER,
      netCompletionXp: DataTypes.INTEGER,
      completedAt: DataTypes.DATE,
    },
    {
      updatedAt: false,
      indexes: [{ unique: true, fields: ["studentId", "levelKey"] }],
    },
  );
  const GameInterruptionEvent = define("GameInterruptionEvents", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sessionId: DataTypes.INTEGER,
    studentId: DataTypes.INTEGER,
    completionEvidenceId: DataTypes.INTEGER,
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
    GameInterruptionCompletionEvidence,
    GameInterruptionEvent,
    GameInterruptionSession,
    User,
    UserProgress,
  };

  try {
    await database.sync();
    await User.create({ id: 720011, role: "student", status: "active", xpTotal: 0 });
    await Classroom.bulkCreate([
      { id: 720025, isActive: true },
      { id: 720026, isActive: true },
    ]);
    await ClassroomMembership.bulkCreate([
      { classroomId: 720025, studentId: 720011, status: "active" },
      { classroomId: 720026, studentId: 720011, status: "active" },
    ]);
    await UserProgress.create({
      userId: 720011,
      levelKey: "tutorial-level-1",
      orderIndex: 1,
      progressPercent: 50,
      isCompleted: false,
      completedAt: null,
      attemptCount: 0,
      timeSpentSeconds: 0,
      hintUsed: false,
      activeSessionId: null,
      finalScore: null,
      xpAwarded: 0,
      xpAwardedAt: null,
    });
    await GameInterruptionSession.bulkCreate([
      {
        studentId: 720011, classroomId: 720025, levelKey: "tutorial-level-1",
        sessionKey: "completion_pg_session_a", scoreDeductionSnapshot: "1.00",
        xpDeductionSnapshot: 10, lifecycleStatus: "CURRENT", startedAt: new Date(),
      },
      {
        studentId: 720011, classroomId: 720026, levelKey: "tutorial-level-1",
        sessionKey: "completion_pg_session_b", scoreDeductionSnapshot: "1.00",
        xpDeductionSnapshot: 10, lifecycleStatus: "CURRENT", startedAt: new Date(),
      },
    ]);

    const xpAwarder = async ({ user, progress, completionEvidenceId }, { transaction }) => {
      const evidence = await GameInterruptionCompletionEvidence.findByPk(
        completionEvidenceId,
        { transaction },
      );
      if (progress.xpAwardedAt) {
        return {
          changed: false,
          xpGrantedNow: 0,
          totalXp: user.xpTotal,
          completionAward: { netAmount: evidence.netCompletionXp, breakdown: [] },
        };
      }
      progress.xpAwarded = evidence.netCompletionXp;
      progress.xpAwardedAt = new Date();
      user.xpTotal += evidence.netCompletionXp;
      await user.save({ transaction });
      await progress.save({ transaction });
      return {
        changed: true,
        xpGrantedNow: evidence.netCompletionXp,
        totalXp: user.xpTotal,
        completionAward: { netAmount: evidence.netCompletionXp, breakdown: [] },
      };
    };
    const service = createGameInterruptionCompletionService({
      database,
      models,
      settingsLoader: async () => [{ levelKey: "tutorial-level-1", isEnabled: true }],
      accessLoader: async () => ({ allowed: true, effectiveDueAt: null }),
      pendingEventRecorder: async () => [],
      completionXpBuilder: () => ({ total: 25 }),
      xpAwarder,
      progressSessionPauser: async () => undefined,
      completionAnalyticsRecorder: async () => undefined,
      scoreCalculator: () => 95,
      parTimeLoader: () => 60,
    });
    const input = (classroomId) => ({
      actorId: 720011,
      actorRole: "student",
      classroomId,
      classroomWasExplicit: true,
      levelKey: "tutorial-level-1",
      completionActionId: `completion_pg_${classroomId}`,
      completionOccurredAt: new Date(),
      interruptionEvents: [],
    });
    const results = await Promise.all([
      service.completeLevel(input(720025)),
      service.completeLevel(input(720026)),
    ]);
    assert.equal(results.filter((result) => result.completedNow).length, 1);
    assert.equal(new Set(results.map((result) => result.completionDeductions.classroomId)).size, 1);
    assert.equal(await GameInterruptionCompletionEvidence.count(), 1);
    assert.equal(await GameInterruptionSession.count({ where: { lifecycleStatus: "CURRENT" } }), 0);
  } finally {
    await database.dropSchema(schema, { cascade: true });
    await database.close();
  }
});
