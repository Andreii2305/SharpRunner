const express = require("express");
const { createRateLimit } = require("../middleware/rateLimit");
const studentClassroomFeedbackService = require("../services/studentClassroomFeedbackService");
const studentClassroomFeedbackReadService = require("../services/studentClassroomFeedbackReadService");
const {
  STUDENT_CLASSROOM_FEEDBACK_IDEMPOTENCY_KEY_PATTERN,
} = require("../constants/studentClassroomFeedbackConfig");

const invalidRequest = () => new studentClassroomFeedbackService.StudentClassroomFeedbackError(
  400,
  "INVALID_REQUEST",
  "Invalid request",
);

const parseClassroomId = (value) => {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) throw invalidRequest();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw invalidRequest();
  return parsed;
};

const validateBody = (req) => {
  if (req.body === undefined
    && (Number(req.headers["content-length"] || 0) > 0 || req.headers["transfer-encoding"])) {
    throw invalidRequest();
  }
  const body = req.body;
  if (!body
    || typeof body !== "object"
    || Array.isArray(body)
    || Object.keys(body).length !== 1
    || !Object.prototype.hasOwnProperty.call(body, "message")
    || Object.keys(req.query).length !== 0) {
    throw invalidRequest();
  }
  return body;
};

const readIdempotencyKey = (req) => {
  let count = 0;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index].toLowerCase() === "idempotency-key") count += 1;
  }
  const key = req.headers["idempotency-key"];
  if (count !== 1
    || typeof key !== "string"
    || !STUDENT_CLASSROOM_FEEDBACK_IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw invalidRequest();
  }
  return key;
};

const serializeFeedback = (feedback) => ({
  id: feedback.id,
  classroomId: feedback.classroomId,
  message: feedback.message,
  createdAt: feedback.createdAt,
});

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
  if (!Number.isSafeInteger(offset)) return null;
  return { page, limit, offset };
};

const createStudentClassroomFeedbackRouter = ({
  service = studentClassroomFeedbackService,
  readService = studentClassroomFeedbackReadService,
} = {}) => {
  const router = express.Router();
  // Process-local burst protection: retries count, and multiple server
  // instances do not share this bucket as a durable quota.
  const submissionRateLimit = createRateLimit({
    windowMs: 60_000,
    max: 10,
    keyGenerator: (req) => `classroom-feedback:${req.userId}`,
    code: "FEEDBACK_RATE_LIMITED",
    message: "Classroom feedback submission is temporarily rate limited. Please try again shortly.",
  });

  router.get("/feedback/me", async (req, res) => {
    const pagination = parsePagination(req.query);
    if (!pagination) {
      return res.status(400).json({ code: "INVALID_REQUEST", message: "Invalid request" });
    }
    try {
      const result = await readService.listStudentClassroomFeedback({
        studentId: req.userId,
        ...pagination,
      });
      return res.json(result);
    } catch (error) {
      // Private feedback contents and internal query details are intentionally not logged.
      console.error("Student classroom feedback listing failed");
      return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
    }
  });

  router.post("/:classroomId/feedback", submissionRateLimit, async (req, res) => {
    try {
      const classroomId = parseClassroomId(req.params.classroomId);
      const body = validateBody(req);
      const idempotencyKey = readIdempotencyKey(req);
      const result = await service.submitStudentClassroomFeedback({
        actorId: req.userId,
        actorRole: req.userRole,
        classroomId,
        message: body.message,
        idempotencyKey,
      });
      return res.status(result.changed ? 201 : 200).json({
        changed: result.changed,
        feedback: serializeFeedback(result.feedback),
      });
    } catch (error) {
      if (error instanceof studentClassroomFeedbackService.StudentClassroomFeedbackError) {
        return res.status(error.status).json({ code: error.code, message: error.message });
      }
      // Private feedback contents and idempotency keys are intentionally not logged.
      console.error("Classroom feedback submission failed");
      return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
    }
  });

  return router;
};

module.exports = { createStudentClassroomFeedbackRouter };
