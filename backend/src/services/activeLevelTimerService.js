const crypto = require("crypto");
const { Op } = require("sequelize");
const UserProgress = require("../models/UserProgress");

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

const pauseProgressSession = async (progress, { now = new Date(), stopAt = null } = {}) => {
  addConfirmedTime(progress, now, stopAt);
  clearActiveSegment(progress);
  await progress.save();
  return Math.max(0, Number(progress.timeSpentSeconds) || 0);
};

const pauseOtherLevelSessions = async (userId, levelKey, now = new Date()) => {
  const rows = await UserProgress.findAll({
    where: {
      userId,
      levelKey: { [Op.ne]: levelKey },
      activeSessionId: { [Op.ne]: null },
    },
  });
  await Promise.all(
    rows.filter((row) => row.activeSessionId).map((row) => pauseProgressSession(row, { now })),
  );
};

const startProgressSession = async (progress, requestedSessionId, now = new Date()) => {
  if (progress.activeSessionId) addConfirmedTime(progress, now);
  const sessionId = normalizeSessionId(requestedSessionId);
  progress.activeSessionId = sessionId;
  progress.activeSessionStartedAt = now;
  progress.lastHeartbeatAt = now;
  if (!progress.startedAt) progress.startedAt = now;
  await progress.save();
  return { sessionId, activeSeconds: Math.max(0, Number(progress.timeSpentSeconds) || 0) };
};

const heartbeatProgressSession = async (progress, sessionId, now = new Date()) => {
  if (!sessionId || progress.activeSessionId !== sessionId) {
    return { replaced: true, activeSeconds: Math.max(0, Number(progress.timeSpentSeconds) || 0) };
  }
  addConfirmedTime(progress, now);
  progress.lastHeartbeatAt = now;
  await progress.save();
  return { replaced: false, activeSeconds: Math.max(0, Number(progress.timeSpentSeconds) || 0) };
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
