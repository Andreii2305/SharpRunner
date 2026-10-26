const express = require("express");
const { createRateLimit } = require("../middleware/rateLimit");
const privateCheckInService = require("../services/privateCheckInService");
const {
  PRIVATE_CHECK_IN_IDEMPOTENCY_KEY_PATTERN,
} = require("../constants/privateCheckInConfig");

const invalidRequest = () => new privateCheckInService.PrivateCheckInError(
  400,
  "INVALID_REQUEST",
  "Invalid request",
);

const parsePositiveSafeInteger = (value) => {
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
    || !PRIVATE_CHECK_IN_IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw invalidRequest();
  }
  return key;
};

const serializeCheckIn = (record) => ({
  id: record.id,
  classroomId: record.classroomId,
  recipientStudentId: record.recipientStudentId,
  message: record.message,
  createdAt: record.createdAt,
});

const createPrivateCheckInRouter = ({ service = privateCheckInService } = {}) => {
  const router = express.Router();
  const sendRateLimit = createRateLimit({
    windowMs: 60_000,
    max: 10,
    keyGenerator: (req) => `private-check-in:${req.userId}`,
    code: "CHECK_IN_RATE_LIMITED",
    message: "Private check-in sending is temporarily rate limited. Please try again shortly.",
  });

  router.post(
    "/classrooms/:classroomId/students/:studentId/check-ins",
    sendRateLimit,
    async (req, res) => {
      try {
        const classroomId = parsePositiveSafeInteger(req.params.classroomId);
        const studentId = parsePositiveSafeInteger(req.params.studentId);
        const body = validateBody(req);
        const idempotencyKey = readIdempotencyKey(req);
        const result = await service.createPrivateCheckIn({
          actorId: req.userId,
          actorRole: req.userRole,
          classroomId,
          studentId,
          message: body.message,
          idempotencyKey,
        });
        return res.status(result.changed ? 201 : 200).json({
          changed: result.changed,
          checkIn: serializeCheckIn(result.checkIn),
        });
      } catch (error) {
        if (error instanceof privateCheckInService.PrivateCheckInError) {
          return res.status(error.status).json({ code: error.code, message: error.message });
        }
        // Private request contents and idempotency keys are intentionally not logged.
        console.error("Private check-in creation failed");
        return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
      }
    },
  );

  return router;
};

module.exports = {
  createPrivateCheckInRouter,
};
