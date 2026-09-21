const crypto = require("crypto");
const { Op } = require("sequelize");
const sequelize = require("../config/database");
const UserProgress = require("../models/UserProgress");
const {
  buildEventDedupeKey,
  findRecordedEvent,
  normalizeActionId,
  recordActiveTime,
  recordLevelStarted,
} = require("./learningAnalyticsEventService");

const HEARTBEAT_INTERVAL_SECONDS = 30;
const MAX_UNCONFIRMED_SECONDS = 45;

const normalizeSessionId = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(value)
    ? value
    : crypto.randomUUID();

const addConfirmedTime = (progress, now = new Date(), stopAt = null) => {
  if (!progress.activeSessionId || !progress.lastHeartbeatAt) return 0;
  const previousMs = new Date(progress.lastHeartbeatAt).getTime();
  const stopMs = stopAt ? Math.min(now.getTime(), new Date(stopAt).getTime()) : now.getTime();
  if (!Number.isFinite(previousMs) || !Number.isFinite(stopMs) || stopMs <= previousMs) return 0;
  const elapsedSeconds = Math.max(0, Math.floor((stopMs - previousMs) / 1000));
  // A gap beyond the stale window is not evidence of activity. Be conservative
  // after browser closure, suspension, or a lost network connection.
  const seconds = elapsedSeconds <= MAX_UNCONFIRMED_SECONDS ? elapsedSeconds : 0;
  progress.timeSpentSeconds = Math.max(0, Number(progress.timeSpentSeconds) || 0) + seconds;
  return seconds;
};

const clearActiveSegment = (progress) => {
  progress.activeSessionId = null;
  progress.activeSessionStartedAt = null;
  progress.lastHeartbeatAt = null;
};

const analyticsStudentId = (progress, context) => context?.studentId ?? progress.userId;

const activeTimeDedupeKey = (progress, context) => buildEventDedupeKey("active-time", [
  analyticsStudentId(progress, context),
  progress.levelKey,
  normalizeActionId(context.syncId),
]);

const runMutation = (context, callback) => {
  if (!context) return callback(null);
  if (context.transaction) return callback(context.transaction);
  return sequelize.transaction(callback);
};

const saveProgress = (progress, transaction) => (
  transaction ? progress.save({ transaction }) : progress.save()
);

const lockProgress = async (progress, transaction) => {
  if (transaction && typeof progress.reload === "function") {
    await progress.reload({ transaction, lock: transaction.LOCK.UPDATE });
  }
};

const hasRecordedTimerSync = async (progress, context, transaction) => {
  if (!context?.syncId) return false;
  const event = await findRecordedEvent(activeTimeDedupeKey(progress, context), { transaction });
  return Boolean(event);
};

const appendActiveTime = (progress, seconds, occurredAt, context, transaction) => {
  if (!context || seconds < 1) return Promise.resolve(null);
  return recordActiveTime({
    studentId: analyticsStudentId(progress, context),
    classroomId: context.classroomId ?? null,
    levelKey: progress.levelKey,
    activeSeconds: seconds,
    syncId: context.syncId,
    occurredAt,
  }, { transaction });
};

const pauseProgressSession = async (
  progress,
  {
    now = new Date(),
    stopAt = null,
    expectedSessionId = null,
    analyticsContext = null,
    transaction = null,
  } = {},
) => runMutation(
  analyticsContext ? { ...analyticsContext, transaction } : null,
  async (activeTransaction) => {
    await lockProgress(progress, activeTransaction);
    const activeSeconds = () => Math.max(0, Number(progress.timeSpentSeconds) || 0);
    if (progress.isCompleted) {
      return { activeSeconds: activeSeconds(), ended: false, completed: true };
    }
    if (expectedSessionId && progress.activeSessionId !== expectedSessionId) {
      return { activeSeconds: activeSeconds(), ended: false, replaced: true };
    }
    if (!progress.activeSessionId) {
      return { activeSeconds: activeSeconds(), ended: false };
    }
    if (analyticsContext && await hasRecordedTimerSync(
      progress,
      analyticsContext,
      activeTransaction,
    )) {
      return { activeSeconds: activeSeconds(), ended: false, duplicate: true };
    }
    const seconds = addConfirmedTime(progress, now, stopAt);
    clearActiveSegment(progress);
    await saveProgress(progress, activeTransaction);
    await appendActiveTime(progress, seconds, now, analyticsContext, activeTransaction);
    return { activeSeconds: activeSeconds(), ended: true };
  },
);

const deriveSwitchSyncId = (syncId, levelKey) => {
  const digest = crypto.createHash("sha256").update(`${syncId}:${levelKey}`).digest("hex");
  return `switch_${digest.slice(0, 32)}`;
};

const pauseOtherLevelSessions = async (
  userId,
  levelKey,
  now = new Date(),
  analyticsContext = null,
) => {
  const rows = await UserProgress.findAll({
    where: {
      userId,
      levelKey: { [Op.ne]: levelKey },
      activeSessionId: { [Op.ne]: null },
    },
  });
  await Promise.all(
    rows.filter((row) => row.activeSessionId).map((row) => pauseProgressSession(row, {
      now,
      expectedSessionId: row.activeSessionId,
      analyticsContext: analyticsContext
        ? {
            ...analyticsContext,
            studentId: analyticsContext.studentId ?? userId,
            syncId: deriveSwitchSyncId(analyticsContext.syncId, row.levelKey),
          }
        : null,
    })),
  );
};

const startProgressSession = async (
  progress,
  requestedSessionId,
  now = new Date(),
  analyticsContext = null,
) => {
  const sessionId = normalizeSessionId(requestedSessionId);
  const context = analyticsContext ? { ...analyticsContext, syncId: sessionId } : null;
  return runMutation(context, async (transaction) => {
    await lockProgress(progress, transaction);
    if (progress.isCompleted) {
      return {
        sessionId: null,
        activeSeconds: Math.max(0, Number(progress.timeSpentSeconds) || 0),
        completed: true,
      };
    }
    if (progress.activeSessionId && context && await hasRecordedTimerSync(
      progress,
      context,
      transaction,
    )) {
      return { sessionId, activeSeconds: Math.max(0, Number(progress.timeSpentSeconds) || 0) };
    }

    const firstStart = !progress.startedAt;
    const previousHeartbeatMs = new Date(progress.lastHeartbeatAt).getTime();
    const sessionStartedAt = progress.activeSessionId
      && Number.isFinite(previousHeartbeatMs)
      && previousHeartbeatMs > now.getTime()
      ? new Date(previousHeartbeatMs)
      : now;
    const seconds = progress.activeSessionId ? addConfirmedTime(progress, now) : 0;
    progress.activeSessionId = sessionId;
    progress.activeSessionStartedAt = sessionStartedAt;
    progress.lastHeartbeatAt = sessionStartedAt;
    if (firstStart) progress.startedAt = now;
    await saveProgress(progress, transaction);
    if (firstStart && context) {
      await recordLevelStarted({
        studentId: analyticsStudentId(progress, context),
        classroomId: context.classroomId ?? null,
        levelKey: progress.levelKey,
        occurredAt: now,
      }, { transaction });
    }
    await appendActiveTime(progress, seconds, now, context, transaction);
    return { sessionId, activeSeconds: Math.max(0, Number(progress.timeSpentSeconds) || 0) };
  });
};

const heartbeatProgressSession = async (
  progress,
  sessionId,
  now = new Date(),
  analyticsContext = null,
) => {
  if (!sessionId || progress.activeSessionId !== sessionId) {
    return { replaced: true, activeSeconds: Math.max(0, Number(progress.timeSpentSeconds) || 0) };
  }
  return runMutation(analyticsContext, async (transaction) => {
    await lockProgress(progress, transaction);
    if (progress.isCompleted) {
      return {
        replaced: false,
        completed: true,
        activeSeconds: Math.max(0, Number(progress.timeSpentSeconds) || 0),
      };
    }
    if (progress.activeSessionId !== sessionId) {
      return {
        replaced: true,
        activeSeconds: Math.max(0, Number(progress.timeSpentSeconds) || 0),
      };
    }
    if (analyticsContext && await hasRecordedTimerSync(
      progress,
      analyticsContext,
      transaction,
    )) {
      return {
        replaced: false,
        duplicate: true,
        activeSeconds: Math.max(0, Number(progress.timeSpentSeconds) || 0),
      };
    }
    const previousHeartbeatMs = new Date(progress.lastHeartbeatAt).getTime();
    if (Number.isFinite(previousHeartbeatMs) && now.getTime() <= previousHeartbeatMs) {
      return {
        replaced: false,
        duplicate: false,
        outOfOrder: true,
        activeSeconds: Math.max(0, Number(progress.timeSpentSeconds) || 0),
      };
    }
    const seconds = addConfirmedTime(progress, now);
    progress.lastHeartbeatAt = now;
    await saveProgress(progress, transaction);
    await appendActiveTime(progress, seconds, now, analyticsContext, transaction);
    return {
      replaced: false,
      duplicate: false,
      activeSeconds: Math.max(0, Number(progress.timeSpentSeconds) || 0),
    };
  });
};

module.exports = {
  HEARTBEAT_INTERVAL_SECONDS,
  MAX_UNCONFIRMED_SECONDS,
  addConfirmedTime,
  clearActiveSegment,
  heartbeatProgressSession,
  pauseOtherLevelSessions,
  pauseProgressSession,
  startProgressSession,
};
