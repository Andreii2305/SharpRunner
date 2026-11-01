const { Op } = require("sequelize");
const sequelize = require("../config/database");
const {
  Classroom,
  ClassroomMembership,
  GameInterruptionCompletionEvidence,
  GameInterruptionEvent,
  GameInterruptionSession,
  User,
  UserProgress,
} = require("../models");
const {
  GAME_INTERRUPTION_SESSION_STATUS,
} = require("../constants/gameInterruptionHistoryConfig");
const { PLAYABLE_LEVEL_KEYS } = require("../constants/progressDefaults");
const {
  computeFinalScore,
  getParTimeSeconds,
} = require("./progressService");
const { getClassroomLevelSettings } = require("./classroomLevelSettingsService");
const { getStudentLevelAccess, restrictionPayload } = require("./levelAccessService");
const { pauseProgressSession } = require("./activeLevelTimerService");
const {
  buildEventDedupeKey,
  findRecordedEvent,
  recordLevelCompleted,
} = require("./learningAnalyticsEventService");
const {
  buildCompletionXp,
  awardCompletionXpFromEvidence,
} = require("./gamificationService");
const {
  recordPendingInterruptionEventBatch,
  validatePendingInterruptionEvents,
} = require("./gameInterruptionEventService");
const {
  calculateInterruptionDeductions,
} = require("./gameInterruptionDeductionCalculator");

const POLICY_VERSION = "game-interruption-deduction/v1";
const playableLevelKeys = new Set(PLAYABLE_LEVEL_KEYS);

class GameInterruptionCompletionError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = "GameInterruptionCompletionError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const fail = (status, code, message, details = {}) => {
  throw new GameInterruptionCompletionError(status, code, message, details);
};

const plain = (record) => (
  typeof record?.get === "function" ? record.get({ plain: true }) : record
);

const positiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseHundredths = (value) => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return null;
  const result = (Number(match[1]) * 100) + Number((match[2] || "").padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
};

const timestampMilliseconds = (value) => {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const completionDeductionsFromEvidence = (evidenceInput) => {
  const evidence = plain(evidenceInput);
  return {
    policyVersion: evidence.policyVersion,
    classroomId: Number(evidence.classroomId),
    levelKey: evidence.levelKey,
    eventCount: Number(evidence.appliedEventCount),
    score: {
      base: Number(evidence.baseScore),
      deducted: Number(evidence.scoreDeduction),
      final: Number(evidence.finalScore),
    },
    xp: {
      gross: Number(evidence.grossCompletionXp),
      deducted: Number(evidence.xpDeduction),
      net: Number(evidence.netCompletionXp),
    },
  };
};

const serializeXpAward = (result) => ({
  awarded: result.changed && result.xpGrantedNow > 0,
  amount: result.xpGrantedNow,
  originalAmount: result.completionAward.netAmount,
  totalXp: result.totalXp,
  breakdown: result.completionAward.breakdown,
});

const createGameInterruptionCompletionService = ({
  database = sequelize,
  models = {
    Classroom,
    ClassroomMembership,
    GameInterruptionCompletionEvidence,
    GameInterruptionEvent,
    GameInterruptionSession,
    User,
    UserProgress,
  },
  settingsLoader = getClassroomLevelSettings,
  accessLoader = getStudentLevelAccess,
  pendingEventRecorder = recordPendingInterruptionEventBatch,
  deductionCalculator = calculateInterruptionDeductions,
  completionXpBuilder = buildCompletionXp,
  xpAwarder = awardCompletionXpFromEvidence,
  progressSessionPauser = pauseProgressSession,
  completionAnalyticsRecorder = recordLevelCompleted,
  completionAnalyticsFinder = findRecordedEvent,
  scoreCalculator = computeFinalScore,
  parTimeLoader = getParTimeSeconds,
  now = () => new Date(),
} = {}) => {
  const verifyPersistedEvidence = async ({
    transaction,
    actorId,
    levelKey,
    progress,
    student,
    sessions,
    evidence,
  }) => {
    const values = plain(evidence);
    const eventCount = Number(values.appliedEventCount);
    const scoreDeductionHundredths = parseHundredths(values.scoreDeduction);
    const finalScoreHundredths = parseHundredths(values.finalScore);
    const evidenceCompletedAt = timestampMilliseconds(values.completedAt);
    const progressFinalScoreHundredths = parseHundredths(progress.finalScore);
    const progressCompletedAt = timestampMilliseconds(progress.completedAt);
    if (!Number.isSafeInteger(eventCount) || eventCount < 0
      || scoreDeductionHundredths == null
      || finalScoreHundredths == null
      || evidenceCompletedAt == null
      || progressFinalScoreHundredths !== finalScoreHundredths
      || progressCompletedAt !== evidenceCompletedAt
      || !Number.isSafeInteger(Number(values.xpDeduction))
      || progress.xpAwardedAt == null) {
      fail(409, "COMPLETION_INTEGRITY_ERROR", "Completion record could not be verified");
    }
    const analytics = plain(await completionAnalyticsFinder(
      buildEventDedupeKey("level-completed", [actorId, levelKey]),
      { transaction },
    ));
    if (!analytics
      || Number(analytics.studentId) !== actorId
      || Number(analytics.classroomId) !== Number(values.classroomId)
      || analytics.levelKey !== levelKey
      || analytics.eventType !== "level_completed"
      || parseHundredths(analytics.score) !== finalScoreHundredths
      || timestampMilliseconds(analytics.occurredAt) !== evidenceCompletedAt) {
      fail(409, "COMPLETION_INTEGRITY_ERROR", "Completion record could not be verified");
    }
    const sessionById = new Map(sessions.map((session) => [Number(session.id), plain(session)]));
    const evidenceSessionIds = sessions
      .filter((session) => Number(session.classroomId) === Number(values.classroomId))
      .map((session) => Number(session.id));
    const events = evidenceSessionIds.length === 0 ? [] : await models.GameInterruptionEvent.findAll({
      where: {
        studentId: actorId,
        sessionId: { [Op.in]: evidenceSessionIds },
      },
      order: [["receivedAt", "ASC"], ["id", "ASC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    let actualScoreHundredths = 0;
    let actualXp = 0;
    for (const eventRecord of events) {
      const event = plain(eventRecord);
      const session = sessionById.get(Number(event.sessionId));
      const scoreHundredths = parseHundredths(event.appliedScoreDeduction);
      if (!session
        || Number(event.studentId) !== actorId
        || Number(session.studentId) !== actorId
        || Number(session.classroomId) !== Number(values.classroomId)
        || session.levelKey !== levelKey
        || Number(event.completionEvidenceId) !== Number(values.id)
        || event.appliedAt == null
        || scoreHundredths == null
        || !Number.isSafeInteger(Number(event.appliedXpDeduction))) {
        fail(409, "COMPLETION_INTEGRITY_ERROR", "Completion record could not be verified");
      }
      actualScoreHundredths += scoreHundredths;
      actualXp += Number(event.appliedXpDeduction);
    }
    if (events.length !== eventCount
      || actualScoreHundredths !== scoreDeductionHundredths
      || actualXp !== Number(values.xpDeduction)) {
      fail(409, "COMPLETION_INTEGRITY_ERROR", "Completion record could not be verified");
    }
    const xpResult = await xpAwarder({
      userId: actorId,
      levelKey,
      completionEvidenceId: values.id,
      user: student,
      progress,
    }, { transaction });
    if (xpResult.changed) {
      fail(409, "COMPLETION_INTEGRITY_ERROR", "Completion record could not be verified");
    }
    return {
      levelRow: progress,
      completedNow: false,
      xpAward: serializeXpAward(xpResult),
      completionDeductions: completionDeductionsFromEvidence(values),
    };
  };

  const completeLevel = async ({
    actorId: actorIdInput,
    actorRole: actorRoleInput,
    classroomId: classroomIdInput,
    classroomWasExplicit = false,
    levelKey: levelKeyInput,
    progressPercent = 100,
    completionActionId,
    completionOccurredAt: completionOccurredAtInput,
    interruptionEvents: interruptionEventsInput = [],
  } = {}) => {
    const actorId = positiveInteger(actorIdInput);
    const classroomId = positiveInteger(classroomIdInput);
    const actorRole = typeof actorRoleInput === "string" ? actorRoleInput : "";
    const levelKey = typeof levelKeyInput === "string" ? levelKeyInput : "";
    const interruptionEvents = validatePendingInterruptionEvents(interruptionEventsInput);
    const completionOccurredAt = completionOccurredAtInput instanceof Date
      ? completionOccurredAtInput
      : new Date(completionOccurredAtInput);
    if (!actorId || !classroomId || actorRole !== "student"
      || !playableLevelKeys.has(levelKey)
      || !Number.isFinite(completionOccurredAt.getTime())) {
      fail(400, "INVALID_REQUEST", "Invalid request");
    }
    if (interruptionEvents.length > 0 && classroomWasExplicit !== true) {
      fail(400, "CLASSROOM_ID_REQUIRED", "classroomId is required for interruption history");
    }

    return database.transaction(async (transaction) => {
      const lock = transaction.LOCK.UPDATE;
      const classroom = await models.Classroom.findByPk(classroomId, {
        attributes: ["id", "isActive"], transaction, lock,
      });
      if (!classroom) fail(404, "CLASSROOM_NOT_FOUND", "Classroom was not found");
      if (classroom.isActive !== true) fail(409, "CLASSROOM_INACTIVE", "Classroom is inactive");

      const membership = await models.ClassroomMembership.findOne({
        where: { classroomId, studentId: actorId },
        attributes: ["id", "classroomId", "studentId", "status"],
        transaction,
        lock,
      });
      if (!membership || membership.status !== "active") fail(403, "FORBIDDEN", "Forbidden");

      const student = await models.User.findByPk(actorId, {
        attributes: ["id", "role", "status", "xpTotal"], transaction, lock,
      });
      if (!student || student.role !== "student" || student.status !== "active") {
        fail(403, "FORBIDDEN", "Forbidden");
      }

      const progress = await models.UserProgress.findOne({
        where: { userId: actorId, levelKey }, transaction, lock,
      });
      if (!progress) fail(404, "PROGRESS_NOT_FOUND", "Progress row was not found");

      const sessions = await models.GameInterruptionSession.findAll({
        where: { studentId: actorId, levelKey },
        order: [["id", "ASC"]],
        transaction,
        lock,
      });
      if (sessions.length > 0 && classroomWasExplicit !== true) {
        fail(400, "CLASSROOM_ID_REQUIRED", "classroomId is required for interruption history");
      }

      const evidence = await models.GameInterruptionCompletionEvidence.findOne({
        where: { studentId: actorId, levelKey }, transaction,
      });
      const [progressRows, settings] = await Promise.all([
        models.UserProgress.findAll({
          where: { userId: actorId, levelKey: { [Op.in]: PLAYABLE_LEVEL_KEYS } },
          attributes: ["levelKey", "isCompleted"],
          transaction,
        }),
        settingsLoader(classroomId, { transaction }),
      ]);
      const access = await accessLoader({
        userId: actorId,
        levelKey,
        membership,
        levelSettings: settings,
        progressRows,
        transaction,
        now: completionOccurredAt,
      });
      if (!access?.allowed) {
        const restriction = restrictionPayload(access ?? {});
        fail(403, restriction.code ?? "LEVEL_ACCESS_DENIED", restriction.message, restriction);
      }
      if (progress.isCompleted === true) {
        if (!evidence) {
          return {
            levelRow: progress,
            completedNow: false,
            xpAward: null,
            completionDeductions: null,
          };
        }
        return verifyPersistedEvidence({
          transaction, actorId, levelKey, progress, student, sessions, evidence,
        });
      }
      if (evidence) {
        fail(409, "COMPLETION_INTEGRITY_ERROR", "Completion record could not be verified");
      }
      const setting = settings.find((item) => item.levelKey === levelKey);
      if (!setting) fail(409, "LEVEL_SETTINGS_UNAVAILABLE", "Level settings are unavailable");

      if (progress.activeSessionId) {
        await progressSessionPauser(progress, {
          analyticsContext: {
            studentId: actorId,
            classroomId,
            syncId: completionActionId,
          },
          transaction,
        });
      }

      const exactSessions = sessions.filter(
        (session) => Number(session.classroomId) === classroomId,
      );
      await pendingEventRecorder({
        transaction,
        actorId,
        classroomId,
        levelKey,
        student,
        classroom,
        membership,
        progress,
        sessions: exactSessions,
        entries: interruptionEvents,
      });

      const exactSessionIds = exactSessions.map((session) => Number(session.id));
      const events = exactSessionIds.length === 0 ? [] : await models.GameInterruptionEvent.findAll({
        where: {
          studentId: actorId,
          sessionId: { [Op.in]: exactSessionIds },
          appliedAt: null,
        },
        order: [["receivedAt", "ASC"], ["id", "ASC"]],
        transaction,
        lock,
      });
      const settlementNow = timestampMilliseconds(now());
      const currentSessionStartedAt = sessions
        .filter((session) => session.lifecycleStatus === GAME_INTERRUPTION_SESSION_STATUS.CURRENT)
        .map((session) => timestampMilliseconds(session.startedAt));
      if (settlementNow == null || currentSessionStartedAt.some((value) => value == null)) {
        fail(500, "SERVER_ERROR", "Server error");
      }
      const completionSettledAt = new Date(Math.max(
        completionOccurredAt.getTime(),
        settlementNow,
        ...currentSessionStartedAt,
      ));
      const sessionById = new Map(exactSessions.map((session) => [Number(session.id), session]));
      const attemptCount = Math.max(0, Number(progress.attemptCount) || 0);
      const timeSpentSeconds = Math.max(0, Number(progress.timeSpentSeconds) || 0);
      const baseScore = scoreCalculator({
        attemptCount,
        timeSpentSeconds,
        parTimeSeconds: parTimeLoader(progress.orderIndex),
        deadlineAt: access.effectiveDueAt ?? setting.dueAt ?? null,
        completedAt: progress.completedAt ?? completionOccurredAt,
        wrongAttemptDeduction: setting.wrongAttemptDeduction ?? 5,
        lateDeductionPerDay: setting.lateDeductionPerDay ?? 3,
      });
      const grossXp = completionXpBuilder({
        attemptCount,
        hintUsed: progress.hintUsed,
      }).total;
      const calculation = deductionCalculator({
        baseScore,
        grossCompletionXp: grossXp,
        events: events.map((eventRecord) => {
          const event = plain(eventRecord);
          const session = plain(sessionById.get(Number(event.sessionId)));
          if (!session) fail(409, "COMPLETION_INTEGRITY_ERROR", "Completion record could not be verified");
          return {
            id: Number(event.id),
            receivedAt: event.receivedAt,
            scoreDeductionSnapshot: session.scoreDeductionSnapshot,
            xpDeductionSnapshot: Number(session.xpDeductionSnapshot),
          };
        }),
      });
      const completedAt = completionSettledAt;
      const evidenceRecord = await models.GameInterruptionCompletionEvidence.create({
        studentId: actorId,
        classroomId,
        levelKey,
        policyVersion: POLICY_VERSION,
        appliedEventCount: calculation.eventCount,
        baseScore: calculation.score.base,
        scoreDeduction: calculation.score.deducted,
        finalScore: calculation.score.final,
        grossCompletionXp: calculation.xp.gross,
        xpDeduction: calculation.xp.deducted,
        netCompletionXp: calculation.xp.net,
        completedAt,
      }, { transaction });

      const applicationById = new Map(
        calculation.eventApplications.map((item) => [Number(item.eventId), item]),
      );
      for (const eventRecord of events) {
        const application = applicationById.get(Number(eventRecord.id));
        if (!application) fail(409, "COMPLETION_INTEGRITY_ERROR", "Completion record could not be verified");
        eventRecord.appliedAt = completionSettledAt;
        eventRecord.appliedScoreDeduction = application.appliedScoreDeduction;
        eventRecord.appliedXpDeduction = application.appliedXpDeduction;
        eventRecord.completionEvidenceId = evidenceRecord.id;
        await eventRecord.save({ transaction });
      }

      progress.progressPercent = 100;
      progress.isCompleted = true;
      progress.completedAt = completedAt;
      progress.attemptCount = attemptCount;
      progress.timeSpentSeconds = timeSpentSeconds;
      progress.finalScore = Number(calculation.score.final);
      await progress.save({ transaction });

      await completionAnalyticsRecorder({
        studentId: actorId,
        classroomId,
        levelKey,
        attemptNumber: attemptCount + 1,
        score: progress.finalScore,
        activityId: completionActionId,
        occurredAt: completedAt,
      }, { transaction });

      const xpResult = await xpAwarder({
        userId: actorId,
        levelKey,
        completionEvidenceId: evidenceRecord.id,
        user: student,
        progress,
      }, { transaction });

      for (const session of sessions) {
        if (session.lifecycleStatus !== GAME_INTERRUPTION_SESSION_STATUS.CURRENT) continue;
        session.lifecycleStatus = GAME_INTERRUPTION_SESSION_STATUS.COMPLETED;
        session.completedAt = completedAt;
        session.supersededAt = null;
        await session.save({ transaction });
      }

      return {
        levelRow: progress,
        completedNow: true,
        xpAward: serializeXpAward(xpResult),
        completionDeductions: completionDeductionsFromEvidence(evidenceRecord),
      };
    });
  };

  return { completeLevel };
};

const service = createGameInterruptionCompletionService();

module.exports = {
  GameInterruptionCompletionError,
  POLICY_VERSION,
  completionDeductionsFromEvidence,
  createGameInterruptionCompletionService,
  completeLevelWithInterruptionDeductions: service.completeLevel,
};
