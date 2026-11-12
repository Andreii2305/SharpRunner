const express = require("express");
const { createRateLimit } = require("../middleware/rateLimit");
const platformFeedbackService = require("../services/platformFeedbackService");
const platformFeedbackReadService = require("../services/platformFeedbackReadService");
const {
  FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN,
} = require("../constants/feedbackTestimonialConfig");

const invalidRequest = () => new platformFeedbackService.PlatformFeedbackError(
  400,
  "INVALID_REQUEST",
  "Invalid request",
);

const setPrivateNoStore = (_req, res, next) => {
  res.set("Cache-Control", "private, no-store, max-age=0");
  next();
};

const validateSubmissionBody = (req) => {
  if (req.body === undefined
    && (Number(req.headers["content-length"] || 0) > 0 || req.headers["transfer-encoding"])) {
    throw invalidRequest();
  }
  if (!req.body
    || typeof req.body !== "object"
    || Array.isArray(req.body)
    || Object.keys(req.body).length !== 1
    || !Object.prototype.hasOwnProperty.call(req.body, "message")
    || Object.keys(req.query).length !== 0) {
    throw invalidRequest();
  }
  return req.body;
};

const readIdempotencyKey = (req) => {
  let count = 0;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index].toLowerCase() === "idempotency-key") count += 1;
  }
  const key = req.headers["idempotency-key"];
  if (count !== 1
    || typeof key !== "string"
    || !FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw invalidRequest();
  }
  return key;
};

const parsePagination = (query) => {
  if (Object.keys(query).some((key) => !["page", "limit"].includes(key))) return null;
  const parseValue = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
  };
  const page = parseValue(query.page, 1);
  const limit = parseValue(query.limit, 20, 100);
  if (!page || !limit) return null;
  const offset = (page - 1) * limit;
  return Number.isSafeInteger(offset) ? { page, limit, offset } : null;
};

const serializeFeedback = (feedback) => ({
  id: feedback.id,
  message: feedback.message,
  createdAt: feedback.createdAt,
});

const handleKnownError = (error, res) => {
  if (error instanceof platformFeedbackService.PlatformFeedbackError
    || error instanceof platformFeedbackReadService.PlatformFeedbackReadError) {
    res.status(error.status).json({ code: error.code, message: error.message });
    return true;
  }
  return false;
};

const createPlatformFeedbackRouter = ({
  service = platformFeedbackService,
  readService = platformFeedbackReadService,
} = {}) => {
  const router = express.Router();
  router.use(setPrivateNoStore);
  // Process-local burst protection. Matching retries count, and separate
  // server instances do not share this bucket as a durable quota.
  const submissionRateLimit = createRateLimit({
    windowMs: 60_000,
    max: 10,
    keyGenerator: (req) => `platform-feedback:${req.userId}`,
    code: "PLATFORM_FEEDBACK_RATE_LIMITED",
    message: "Platform feedback submission is temporarily rate limited. Please try again shortly.",
  });

  router.post("/platform", submissionRateLimit, async (req, res) => {
    try {
      const body = validateSubmissionBody(req);
      const idempotencyKey = readIdempotencyKey(req);
      const result = await service.submitPlatformFeedback({
        actorId: req.userId,
        actorRole: req.userRole,
        message: body.message,
        idempotencyKey,
      });
      return res.status(result.changed ? 201 : 200).json({
        changed: result.changed,
        feedback: serializeFeedback(result.feedback),
      });
    } catch (error) {
      if (handleKnownError(error, res)) return undefined;
      // Private message text, request bodies, and idempotency keys are intentionally not logged.
      console.error("Platform feedback submission failed");
      return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
    }
  });

  router.get("/platform/me", async (req, res) => {
    const pagination = parsePagination(req.query);
    if (!pagination) {
      return res.status(400).json({ code: "INVALID_REQUEST", message: "Invalid request" });
    }
    try {
      const result = await readService.listOwnPlatformFeedback({
        actorId: req.userId,
        actorRole: req.userRole,
        ...pagination,
      });
      return res.json(result);
    } catch (error) {
      if (handleKnownError(error, res)) return undefined;
      console.error("Platform feedback author listing failed");
      return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
    }
  });

  return router;
};

const createAdminPlatformFeedbackRouter = ({
  readService = platformFeedbackReadService,
} = {}) => {
  const router = express.Router();
  router.use(setPrivateNoStore);
  router.get("/platform", async (req, res) => {
    const pagination = parsePagination(req.query);
    if (!pagination) {
      return res.status(400).json({ code: "INVALID_REQUEST", message: "Invalid request" });
    }
    try {
      const result = await readService.listAdminPlatformFeedback({
        actorId: req.userId,
        actorRole: req.userRole,
        ...pagination,
      });
      return res.json(result);
    } catch (error) {
      if (handleKnownError(error, res)) return undefined;
      console.error("Platform feedback administrator listing failed");
      return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
    }
  });
  return router;
};

module.exports = { createPlatformFeedbackRouter, createAdminPlatformFeedbackRouter };
