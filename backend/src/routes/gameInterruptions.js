const express = require("express");
const requireRole = require("../middleware/requireRole");
const { createRateLimit } = require("../middleware/rateLimit");
const sessionService = require("../services/gameInterruptionSessionService");
const eventService = require("../services/gameInterruptionEventService");
const { PLAYABLE_LEVEL_KEYS } = require("../constants/progressDefaults");
const {
  GAME_INTERRUPTION_EVENT_TYPE,
  GAME_INTERRUPTION_KEY_PATTERN,
} = require("../constants/gameInterruptionHistoryConfig");

const playableLevelKeys = new Set(PLAYABLE_LEVEL_KEYS);
const eventTypes = new Set(Object.values(GAME_INTERRUPTION_EVENT_TYPE));
const studentOnly = requireRole("student");

class GameInterruptionRouteError extends Error {
  constructor() {
    super("Invalid request");
    this.status = 400;
    this.code = "INVALID_REQUEST";
  }
}

const invalidRequest = () => {
  throw new GameInterruptionRouteError();
};

const parsePositiveSafeInteger = (value) => {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) invalidRequest();
    return value;
  }
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) invalidRequest();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) invalidRequest();
  return parsed;
};

const parsePositiveSafeJsonInteger = (value) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    invalidRequest();
  }
  return value;
};

const parseLevelKey = (value) => {
  if (typeof value !== "string") invalidRequest();
  if (!playableLevelKeys.has(value)) invalidRequest();
  return value;
};

const requireBody = (req, allowedFields) => {
  if (Object.keys(req.query).length !== 0) invalidRequest();
  if (req.body === undefined
    && (Number(req.headers["content-length"] || 0) > 0 || req.headers["transfer-encoding"])) {
    invalidRequest();
  }
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) invalidRequest();
  const keys = Object.keys(body);
  if (keys.length !== allowedFields.length
    || keys.some((key) => !allowedFields.includes(key))) {
    invalidRequest();
  }
  return body;
};

const parseKey = (value) => {
  if (typeof value !== "string" || !GAME_INTERRUPTION_KEY_PATTERN.test(value)) {
    invalidRequest();
  }
  return value;
};

const serializeSession = (session) => ({
  id: session.id,
  classroomId: session.classroomId,
  levelKey: session.levelKey,
  lifecycleStatus: session.lifecycleStatus,
  startedAt: session.startedAt,
  supersededAt: session.supersededAt ?? null,
  completedAt: session.completedAt ?? null,
  scoreDeductionSnapshot: session.scoreDeductionSnapshot,
  xpDeductionSnapshot: session.xpDeductionSnapshot,
  createdAt: session.createdAt,
});

const serializeEvent = (event) => ({
  id: event.id,
  sessionId: event.sessionId,
  classroomId: event.classroomId,
  levelKey: event.levelKey,
  eventType: event.eventType,
  receivedAt: event.receivedAt,
});

const sendError = (res, error, expectedError) => {
  if (error instanceof GameInterruptionRouteError || error instanceof expectedError) {
    return res.status(error.status).json({ code: error.code, message: error.message });
  }
  return null;
};

const createGameInterruptionRouter = ({
  sessionServiceImpl = sessionService,
  eventServiceImpl = eventService,
} = {}) => {
  const router = express.Router();
  const sessionRateLimit = createRateLimit({
    windowMs: 60_000,
    max: 30,
    keyGenerator: (req) => `game-interruption-session:${req.userId}`,
    code: "INTERRUPTION_SESSION_RATE_LIMITED",
    message: "Interruption session requests are temporarily rate limited. Please retry shortly.",
  });
  const eventRateLimit = createRateLimit({
    windowMs: 60_000,
    max: 120,
    keyGenerator: (req) => `game-interruption-event:${req.userId}`,
    code: "INTERRUPTION_EVENT_RATE_LIMITED",
    message: "Interruption event requests are temporarily rate limited. Please retry shortly.",
  });

  router.post(
    "/level/:levelKey/interruption-sessions",
    studentOnly,
    sessionRateLimit,
    async (req, res) => {
      try {
        const levelKey = parseLevelKey(req.params.levelKey);
        const body = requireBody(req, ["classroomId", "sessionKey"]);
        const classroomId = parsePositiveSafeJsonInteger(body.classroomId);
        const sessionKey = parseKey(body.sessionKey);
        const result = await sessionServiceImpl.startInterruptionSession({
          actorId: req.userId,
          actorRole: req.userRole,
          classroomId,
          levelKey,
          sessionKey,
        });
        return res.status(result.changed ? 201 : 200).json({
          changed: result.changed,
          session: serializeSession(result.session),
        });
      } catch (error) {
        const mapped = sendError(res, error, sessionService.GameInterruptionSessionError);
        if (mapped) return mapped;
        // Request bodies and idempotency keys are intentionally not logged.
        console.error("Game interruption session start failed");
        return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
      }
    },
  );

  router.post(
    "/level/:levelKey/interruption-sessions/:sessionId/events",
    studentOnly,
    eventRateLimit,
    async (req, res) => {
      try {
        const levelKey = parseLevelKey(req.params.levelKey);
        const sessionId = parsePositiveSafeInteger(req.params.sessionId);
        const body = requireBody(req, ["classroomId", "eventKey", "eventType"]);
        const classroomId = parsePositiveSafeJsonInteger(body.classroomId);
        const eventKey = parseKey(body.eventKey);
        if (typeof body.eventType !== "string" || !eventTypes.has(body.eventType)) {
          invalidRequest();
        }
        const result = await eventServiceImpl.recordInterruptionEvent({
          actorId: req.userId,
          actorRole: req.userRole,
          classroomId,
          levelKey,
          sessionId,
          eventKey,
          eventType: body.eventType,
        });
        return res.status(result.changed ? 201 : 200).json({
          changed: result.changed,
          event: serializeEvent(result.event),
        });
      } catch (error) {
        const mapped = sendError(res, error, eventService.GameInterruptionEventError);
        if (mapped) return mapped;
        // Request bodies and idempotency keys are intentionally not logged.
        console.error("Game interruption event recording failed");
        return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
      }
    },
  );

  return router;
};

module.exports = { createGameInterruptionRouter };
