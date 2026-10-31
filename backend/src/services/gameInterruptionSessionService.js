const { Op } = require("sequelize");
const sequelize = require("../config/database");
const {
  Classroom,
  ClassroomMembership,
  GameInterruptionSession,
  User,
  UserProgress,
} = require("../models");
const {
  GAME_INTERRUPTION_KEY_PATTERN,
  GAME_INTERRUPTION_SESSION_STATUS,
} = require("../constants/gameInterruptionHistoryConfig");
const { PLAYABLE_LEVEL_KEYS } = require("../constants/progressDefaults");
const { getClassroomLevelSettings } = require("./classroomLevelSettingsService");
const { getStudentLevelAccess, restrictionPayload } = require("./levelAccessService");

const playableLevelKeys = new Set(PLAYABLE_LEVEL_KEYS);

class GameInterruptionSessionError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "GameInterruptionSessionError";
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => {
  throw new GameInterruptionSessionError(status, code, message);
};

const positiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const plain = (record) => (
  typeof record?.get === "function" ? record.get({ plain: true }) : record
);

const serializeSession = (recordInput) => {
  const record = plain(recordInput);
  return {
    id: record.id,
    classroomId: record.classroomId,
    levelKey: record.levelKey,
    lifecycleStatus: record.lifecycleStatus,
    startedAt: record.startedAt,
    supersededAt: record.supersededAt ?? null,
    completedAt: record.completedAt ?? null,
    scoreDeductionSnapshot: Number(record.scoreDeductionSnapshot),
    xpDeductionSnapshot: Number(record.xpDeductionSnapshot),
    createdAt: record.createdAt,
  };
};

const isSessionKeyUniqueError = (error) => {
  if (error?.name !== "SequelizeUniqueConstraintError") return false;
  const evidence = [
    error.constraint,
    error.parent?.constraint,
    error.original?.constraint,
    error.index,
    ...Object.keys(error.fields || {}),
    ...(error.errors || []).flatMap((item) => [item.path, item.constraint]),
  ].filter(Boolean).join(" ").toLowerCase();
  return evidence.includes("game_interruption_sessions_student_key")
    || (evidence.includes("studentid") && evidence.includes("sessionkey"));
};

const createGameInterruptionSessionService = ({
  database = sequelize,
  models = {
    Classroom,
    ClassroomMembership,
    GameInterruptionSession,
    User,
    UserProgress,
  },
  levelAccessLoader = getStudentLevelAccess,
  levelSettingsLoader = getClassroomLevelSettings,
  now = () => new Date(),
} = {}) => {
  const startInterruptionSession = async ({
    actorId: actorIdInput,
    actorRole: actorRoleInput,
    classroomId: classroomIdInput,
    levelKey: levelKeyInput,
    sessionKey: sessionKeyInput,
  }) => {
    const actorId = positiveInteger(actorIdInput);
    const classroomId = positiveInteger(classroomIdInput);
    const actorRole = typeof actorRoleInput === "string"
      ? actorRoleInput.trim().toLowerCase()
      : "";
    const levelKey = typeof levelKeyInput === "string"
      ? levelKeyInput.trim().toLowerCase()
      : "";
    const sessionKey = typeof sessionKeyInput === "string" ? sessionKeyInput : "";

    if (!actorId || !classroomId) fail(400, "INVALID_REQUEST", "Invalid request");
    if (actorRole !== "student") fail(403, "FORBIDDEN", "Forbidden");
    if (!playableLevelKeys.has(levelKey)) {
      fail(400, "INVALID_LEVEL_KEY", "Invalid level key");
    }
    if (!GAME_INTERRUPTION_KEY_PATTERN.test(sessionKey)) {
      fail(400, "INVALID_SESSION_KEY", "Invalid session key");
    }

    const runTransaction = async ({ uniqueConflict = null } = {}) => (
      database.transaction(async (transaction) => {
        const lock = transaction.LOCK.UPDATE;
        const classroom = await models.Classroom.findByPk(classroomId, {
          attributes: ["id", "isActive"],
          transaction,
          lock,
        });
        if (!classroom) {
          fail(404, "CLASSROOM_NOT_FOUND", "Classroom was not found");
        }
        if (classroom.isActive !== true) {
          fail(409, "CLASSROOM_INACTIVE", "Classroom is inactive");
        }

        const membership = await models.ClassroomMembership.findOne({
          where: { classroomId, studentId: actorId },
          attributes: ["id", "classroomId", "studentId", "status"],
          transaction,
          lock,
        });
        if (!membership || membership.status !== "active") {
          fail(403, "FORBIDDEN", "Forbidden");
        }

        // Completion and hint mutations lock User before UserProgress. The
        // classroom/membership locks above do not overlap that pair, while this
        // shared order serializes session start against first completion.
        const actor = await models.User.findByPk(actorId, {
          attributes: ["id", "role", "status"],
          transaction,
          lock,
        });
        if (!actor || actor.role !== "student" || actor.status !== "active") {
          fail(403, "FORBIDDEN", "Forbidden");
        }

        const progress = await models.UserProgress.findOne({
          where: { userId: actorId, levelKey },
          attributes: ["id", "userId", "levelKey", "isCompleted"],
          transaction,
          lock,
        });
        if (!progress) {
          fail(404, "PROGRESS_NOT_FOUND", "Progress row was not found");
        }

        const [progressRows, settings] = await Promise.all([
          models.UserProgress.findAll({
            where: { userId: actorId, levelKey: { [Op.in]: PLAYABLE_LEVEL_KEYS } },
            attributes: ["levelKey", "isCompleted"],
            transaction,
          }),
          levelSettingsLoader(classroomId, { transaction }),
        ]);
        const access = await levelAccessLoader({
          userId: actorId,
          levelKey,
          membership,
          levelSettings: settings,
          progressRows,
          transaction,
          now: now(),
        });
        if (!access?.allowed) {
          const restriction = restrictionPayload(access ?? {});
          fail(403, restriction.code ?? "LEVEL_ACCESS_DENIED", restriction.message);
        }

        const existing = await models.GameInterruptionSession.findOne({
          where: { studentId: actorId, sessionKey },
          transaction,
          lock,
        });
        if (existing) {
          if (Number(existing.classroomId) !== classroomId || existing.levelKey !== levelKey) {
            fail(409, "SESSION_KEY_CONFLICT", "Session key conflict");
          }
          return { changed: false, session: serializeSession(existing) };
        }
        if (uniqueConflict) throw uniqueConflict;

        if (progress.isCompleted === true) {
          fail(
            409,
            "LEVEL_ALREADY_COMPLETED",
            "Completed levels do not start interruption sessions",
          );
        }

        const setting = settings.find((item) => item.levelKey === levelKey);
        if (!setting) {
          fail(409, "LEVEL_SETTINGS_UNAVAILABLE", "Level settings are unavailable");
        }
        const scoreDeductionSnapshot = Number(setting.interruptionScoreDeduction);
        const xpDeductionSnapshot = Number(setting.interruptionXpDeduction);
        if (!Number.isFinite(scoreDeductionSnapshot)
          || scoreDeductionSnapshot < 0
          || scoreDeductionSnapshot > 100
          || !Number.isSafeInteger(xpDeductionSnapshot)
          || xpDeductionSnapshot < 0
          || xpDeductionSnapshot > 100) {
          fail(500, "SERVER_ERROR", "Server error");
        }

        const current = await models.GameInterruptionSession.findOne({
          where: {
            studentId: actorId,
            classroomId,
            levelKey,
            lifecycleStatus: GAME_INTERRUPTION_SESSION_STATUS.CURRENT,
          },
          transaction,
          lock,
        });
        const startedAt = now();
        if (current) {
          current.lifecycleStatus = GAME_INTERRUPTION_SESSION_STATUS.SUPERSEDED;
          current.supersededAt = startedAt;
          await current.save({ transaction });
        }

        const created = await database.transaction({ transaction }, async (savepoint) => (
          models.GameInterruptionSession.create({
            studentId: actorId,
            classroomId,
            levelKey,
            sessionKey,
            scoreDeductionSnapshot,
            xpDeductionSnapshot,
            lifecycleStatus: GAME_INTERRUPTION_SESSION_STATUS.CURRENT,
            startedAt,
          }, { transaction: savepoint })
        ));
        return { changed: true, session: serializeSession(created) };
      })
    );

    try {
      return await runTransaction();
    } catch (error) {
      if (!isSessionKeyUniqueError(error)) throw error;
      // The savepoint and outer transaction have rolled back before this
      // authorization and idempotency check. Never query an aborted transaction.
      return runTransaction({ uniqueConflict: error });
    }
  };

  return { startInterruptionSession };
};

const service = createGameInterruptionSessionService();

module.exports = {
  GameInterruptionSessionError,
  createGameInterruptionSessionService,
  startInterruptionSession: service.startInterruptionSession,
};
