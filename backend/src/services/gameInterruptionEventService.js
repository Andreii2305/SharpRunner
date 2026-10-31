const { Op } = require("sequelize");
const sequelize = require("../config/database");
const {
  Classroom,
  ClassroomMembership,
  GameInterruptionEvent,
  GameInterruptionSession,
  User,
  UserProgress,
} = require("../models");
const {
  GAME_INTERRUPTION_EVENT_TYPE,
  GAME_INTERRUPTION_KEY_PATTERN,
  GAME_INTERRUPTION_SESSION_STATUS,
} = require("../constants/gameInterruptionHistoryConfig");
const { PLAYABLE_LEVEL_KEYS } = require("../constants/progressDefaults");
const { getClassroomLevelSettings } = require("./classroomLevelSettingsService");
const { getStudentLevelAccess, restrictionPayload } = require("./levelAccessService");

const playableLevelKeys = new Set(PLAYABLE_LEVEL_KEYS);
const eventTypes = new Set(Object.values(GAME_INTERRUPTION_EVENT_TYPE));
const PENDING_EVENT_BATCH_LIMIT = 100;
const pendingEventFields = ["eventKey", "eventType", "sessionId"];

class GameInterruptionEventError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "GameInterruptionEventError";
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => {
  throw new GameInterruptionEventError(status, code, message);
};

const positiveInteger = (value) => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const plain = (record) => (
  typeof record?.get === "function" ? record.get({ plain: true }) : record
);

const serializeEvent = (recordInput, sessionInput) => {
  const record = plain(recordInput);
  const session = plain(sessionInput);
  return {
    id: record.id,
    sessionId: record.sessionId,
    classroomId: session.classroomId,
    levelKey: session.levelKey,
    eventType: record.eventType,
    receivedAt: record.receivedAt,
  };
};

const isEventKeyUniqueError = (error) => {
  if (error?.name !== "SequelizeUniqueConstraintError") return false;
  const evidence = [
    error.constraint,
    error.parent?.constraint,
    error.original?.constraint,
    error.index,
    ...Object.keys(error.fields || {}),
    ...(error.errors || []).flatMap((item) => [item.path, item.constraint]),
  ].filter(Boolean).join(" ").toLowerCase();
  return evidence.includes("game_interruption_events_student_key")
    || (evidence.includes("studentid") && evidence.includes("eventkey"));
};

const normalizePendingEntries = (entriesInput) => {
  if (!Array.isArray(entriesInput) || entriesInput.length > PENDING_EVENT_BATCH_LIMIT) {
    fail(400, "INVALID_PENDING_EVENTS", "Invalid pending interruption events");
  }
  const seenKeys = new Set();
  return entriesInput.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).sort().join(",") !== pendingEventFields.join(",")) {
      fail(400, "INVALID_PENDING_EVENTS", "Invalid pending interruption events");
    }
    const sessionId = positiveInteger(entry.sessionId);
    if (!sessionId
      || typeof entry.eventKey !== "string"
      || !GAME_INTERRUPTION_KEY_PATTERN.test(entry.eventKey)
      || typeof entry.eventType !== "string"
      || !eventTypes.has(entry.eventType)
      || seenKeys.has(entry.eventKey)) {
      fail(400, "INVALID_PENDING_EVENTS", "Invalid pending interruption events");
    }
    seenKeys.add(entry.eventKey);
    return { sessionId, eventKey: entry.eventKey, eventType: entry.eventType };
  });
};

const validatePendingInterruptionEvents = (entriesInput) => (
  normalizePendingEntries(entriesInput)
);

const requireLockedContext = ({
  transaction,
  actorId: actorIdInput,
  classroomId: classroomIdInput,
  levelKey: levelKeyInput,
  student: studentInput,
  classroom: classroomInput,
  membership: membershipInput,
  progress: progressInput,
  sessions: sessionsInput,
}) => {
  if (!transaction || typeof transaction !== "object" || transaction.finished) {
    throw new TypeError("Pending interruption events require a caller-owned transaction");
  }
  const actorId = positiveInteger(actorIdInput);
  const classroomId = positiveInteger(classroomIdInput);
  const levelKey = typeof levelKeyInput === "string" ? levelKeyInput : "";
  const student = plain(studentInput);
  const classroom = plain(classroomInput);
  const membership = plain(membershipInput);
  const progress = plain(progressInput);
  if (!actorId || !classroomId || !playableLevelKeys.has(levelKey)
    || Number(student?.id) !== actorId
    || student?.role !== "student"
    || student?.status !== "active"
    || Number(classroom?.id) !== classroomId
    || classroom?.isActive !== true
    || Number(membership?.studentId) !== actorId
    || Number(membership?.classroomId) !== classroomId
    || membership?.status !== "active"
    || Number(progress?.userId) !== actorId
    || progress?.levelKey !== levelKey
    || typeof progress?.isCompleted !== "boolean"
    || !Array.isArray(sessionsInput)) {
    throw new TypeError("Invalid locked interruption context");
  }

  const sessions = new Map();
  for (const sessionInput of sessionsInput) {
    const session = plain(sessionInput);
    const sessionId = positiveInteger(session?.id);
    if (!sessionId) throw new TypeError("Invalid locked interruption context");
    if (sessions.has(sessionId)) throw new TypeError("Invalid locked interruption context");
    if (Number(session.studentId) !== actorId
      || Number(session.classroomId) !== classroomId
      || session.levelKey !== levelKey) {
      fail(409, "SESSION_SCOPE_MISMATCH", "Interruption session scope mismatch");
    }
    sessions.set(sessionId, sessionInput);
  }
  return {
    transaction,
    actorId,
    classroomId,
    levelKey,
    progress,
    sessions,
  };
};

const createGameInterruptionEventService = ({
  database = sequelize,
  models = {
    Classroom,
    ClassroomMembership,
    GameInterruptionEvent,
    GameInterruptionSession,
    User,
    UserProgress,
  },
  levelAccessLoader = getStudentLevelAccess,
  levelSettingsLoader = getClassroomLevelSettings,
  now = () => new Date(),
} = {}) => {
  /**
   * Inserts or acknowledges pending interruption events inside locks owned by
   * the caller. The caller must already hold and supply the exact active
   * student/classroom/membership context, the exact progress row, and every
   * referenced session row. This helper never acquires those locks and never
   * opens or commits an outer transaction.
   */
  const recordPendingInterruptionEventBatch = async (input = {}) => {
    const entries = normalizePendingEntries(input.entries);
    const context = requireLockedContext(input);
    for (const pending of entries) {
      if (!context.sessions.has(pending.sessionId)) {
        fail(404, "SESSION_NOT_FOUND", "Interruption session was not found");
      }
    }
    if (entries.length === 0) return [];

    const receivedAt = now();
    const runSavepoint = () => database.transaction(
      { transaction: context.transaction },
      async (savepoint) => {
        const existingRows = await models.GameInterruptionEvent.findAll({
          where: {
            studentId: context.actorId,
            eventKey: { [Op.in]: entries.map(({ eventKey }) => eventKey) },
          },
          transaction: savepoint,
          lock: savepoint.LOCK.UPDATE,
        });
        const existingByKey = new Map(existingRows.map((row) => [plain(row).eventKey, row]));
        const validated = entries.map((pending) => {
          const session = context.sessions.get(pending.sessionId);
          const existing = existingByKey.get(pending.eventKey);
          if (existing) {
            const existingValues = plain(existing);
            if (Number(existingValues.sessionId) !== pending.sessionId
              || existingValues.eventType !== pending.eventType) {
              fail(409, "EVENT_KEY_CONFLICT", "Event key conflict");
            }
            return { pending, session, existing };
          }
          if (context.progress.isCompleted === true) {
            fail(
              409,
              "LEVEL_ALREADY_COMPLETED",
              "Completed levels do not accept interruption events",
            );
          }
          if (plain(session).lifecycleStatus !== GAME_INTERRUPTION_SESSION_STATUS.CURRENT) {
            fail(409, "SESSION_NOT_CURRENT", "Interruption session is not current");
          }
          return { pending, session, existing: null };
        });

        const results = [];
        for (const item of validated) {
          if (item.existing) {
            results.push({
              changed: false,
              event: serializeEvent(item.existing, item.session),
            });
            continue;
          }
          const created = await models.GameInterruptionEvent.create({
            sessionId: item.pending.sessionId,
            studentId: context.actorId,
            eventKey: item.pending.eventKey,
            eventType: item.pending.eventType,
            receivedAt,
            appliedAt: null,
            appliedScoreDeduction: null,
            appliedXpDeduction: null,
            completionEvidenceId: null,
          }, { transaction: savepoint });
          results.push({ changed: true, event: serializeEvent(created, item.session) });
        }
        return results;
      },
    );

    try {
      return await runSavepoint();
    } catch (error) {
      if (!isEventKeyUniqueError(error)) throw error;
      // The whole batch savepoint has rolled back. One retry can now observe
      // and acknowledge the winner without querying an aborted transaction.
      return runSavepoint();
    }
  };

  const recordInterruptionEvent = async ({
    actorId: actorIdInput,
    actorRole: actorRoleInput,
    classroomId: classroomIdInput,
    levelKey: levelKeyInput,
    sessionId: sessionIdInput,
    eventKey: eventKeyInput,
    eventType: eventTypeInput,
  }, { transaction: callerTransaction = null } = {}) => {
    const actorId = positiveInteger(actorIdInput);
    const classroomId = positiveInteger(classroomIdInput);
    const sessionId = positiveInteger(sessionIdInput);
    const actorRole = typeof actorRoleInput === "string"
      ? actorRoleInput.trim().toLowerCase()
      : "";
    const levelKey = typeof levelKeyInput === "string"
      ? levelKeyInput.trim().toLowerCase()
      : "";
    const eventKey = typeof eventKeyInput === "string" ? eventKeyInput : "";
    const eventType = typeof eventTypeInput === "string" ? eventTypeInput : "";

    if (!actorId || !classroomId || !sessionId) {
      fail(400, "INVALID_REQUEST", "Invalid request");
    }
    if (actorRole !== "student") fail(403, "FORBIDDEN", "Forbidden");
    if (!playableLevelKeys.has(levelKey)) {
      fail(400, "INVALID_LEVEL_KEY", "Invalid level key");
    }
    if (!GAME_INTERRUPTION_KEY_PATTERN.test(eventKey)) {
      fail(400, "INVALID_EVENT_KEY", "Invalid event key");
    }
    if (!eventTypes.has(eventType)) {
      fail(400, "INVALID_EVENT_TYPE", "Invalid event type");
    }

    const execute = async (transaction) => {
      const lock = transaction.LOCK.UPDATE;
      const classroom = await models.Classroom.findByPk(classroomId, {
        attributes: ["id", "isActive"],
        transaction,
        lock,
      });
      if (!classroom) fail(404, "CLASSROOM_NOT_FOUND", "Classroom was not found");
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

      // Keep the completion/session-start order: classroom, membership,
      // student, exact progress, then exact interruption session.
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
      if (!progress) fail(404, "PROGRESS_NOT_FOUND", "Progress row was not found");

      const session = await models.GameInterruptionSession.findOne({
        where: { id: sessionId, studentId: actorId, classroomId, levelKey },
        attributes: [
          "id", "studentId", "classroomId", "levelKey", "lifecycleStatus",
          "startedAt", "supersededAt", "completedAt",
        ],
        transaction,
        lock,
      });
      if (!session) fail(404, "SESSION_NOT_FOUND", "Interruption session was not found");

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

      const [result] = await recordPendingInterruptionEventBatch({
        transaction,
        actorId,
        classroomId,
        levelKey,
        student: actor,
        classroom,
        membership,
        progress,
        sessions: [session],
        entries: [{ sessionId, eventKey, eventType }],
      });
      return result;
    };

    if (callerTransaction) return execute(callerTransaction);
    return database.transaction(execute);
  };

  return { recordInterruptionEvent, recordPendingInterruptionEventBatch };
};

const service = createGameInterruptionEventService();

module.exports = {
  GameInterruptionEventError,
  createGameInterruptionEventService,
  recordInterruptionEvent: service.recordInterruptionEvent,
  recordPendingInterruptionEventBatch: service.recordPendingInterruptionEventBatch,
  validatePendingInterruptionEvents,
};
