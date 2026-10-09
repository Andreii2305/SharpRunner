const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const { createRateLimit } = require("../middleware/rateLimit");
const defaultReadService = require("../services/assessmentReadService");
const defaultAttemptService = require("../services/assessmentAttemptService");
const { AssessmentApiError, sendAssessmentError } = require("../services/assessmentErrorService");
const { ASSESSMENT_TYPES } = require("../constants/assessmentConfig");

const codingRunRateLimit = createRateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => `${req.userId}:${req.params.attemptId}`,
  code: "CODING_RUN_RATE_LIMITED",
  message: "Code execution is temporarily rate limited. Please try again shortly.",
});

const parsePositiveId = (value) => {
  if (!/^[1-9][0-9]*$/.test(String(value || ""))) {
    throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
  }
  return parsed;
};

const normalizeType = (value) => {
  const type = typeof value === "string" ? value.toUpperCase() : "";
  if (!Object.values(ASSESSMENT_TYPES).includes(type)) {
    throw new AssessmentApiError(
      400,
      "INVALID_ASSESSMENT_TYPE",
      "Invalid assessment type",
    );
  }
  return type;
};

const validateMutationBody = (req, keys = []) => {
  if (req.body === undefined
    && (Number(req.headers["content-length"] || 0) > 0 || req.headers["transfer-encoding"])) {
    throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
  }
  const body = req.body === undefined && keys.length === 0 ? {} : req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).length !== keys.length
    || !keys.every((key) => Object.prototype.hasOwnProperty.call(body, key))
    || Object.keys(req.query).length > 0) {
    throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
  }
  return body;
};

const submissionKeyFromHeader = (req) => {
  let count = 0;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index].toLowerCase() === "idempotency-key") count += 1;
  }
  const key = req.headers["idempotency-key"];
  if (count !== 1 || typeof key !== "string" || !/^[A-Za-z0-9_-]{8,96}$/.test(key)) {
    throw new AssessmentApiError(400, "INVALID_SUBMISSION_KEY", "Invalid submission key");
  }
  return key;
};

const createAssessmentRouter = ({
  readService = defaultReadService,
  attemptService = defaultAttemptService,
} = {}) => {
  const router = express.Router();
  router.use(authMiddleware, requireRole("student"));

  router.post("/:assessmentId/attempts", async (req, res) => {
    try {
      validateMutationBody(req);
      const payload = await readService.startOrResumeAttempt({
        assessmentId: parsePositiveId(req.params.assessmentId),
        studentId: req.userId,
      });
      return res.status(payload.attempt.resumed ? 200 : 201).json(payload);
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  router.put("/attempts/:attemptId/responses/:questionId", async (req, res) => {
    try {
      const keys = req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? Object.keys(req.body) : [];
      if (keys.length !== 1 || !["selectedChoiceId", "sourceCode"].includes(keys[0])) {
        throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
      }
      const body = validateMutationBody(req, keys);
      if (Object.hasOwn(body, "selectedChoiceId") && body.selectedChoiceId !== null
        && (typeof body.selectedChoiceId !== "number"
          || !Number.isSafeInteger(body.selectedChoiceId) || body.selectedChoiceId <= 0)) {
        throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
      }
      if (Object.hasOwn(body, "sourceCode") && typeof body.sourceCode !== "string") {
        throw new AssessmentApiError(400, "INVALID_CODING_RESPONSE", "Invalid coding response");
      }
      const saved = await attemptService.saveResponse({
        attemptId: parsePositiveId(req.params.attemptId),
        questionId: parsePositiveId(req.params.questionId),
        studentId: req.userId,
        ...(Object.hasOwn(body, "selectedChoiceId")
          ? { selectedChoiceId: body.selectedChoiceId }
          : { sourceCode: body.sourceCode }),
      });
      return res.status(200).json({ response: {
        attemptId: saved.attemptId,
        questionId: saved.questionId,
        ...(Object.hasOwn(saved, "sourceCode")
          ? { sourceCode: saved.sourceCode }
          : { selectedChoiceId: saved.selectedChoiceId }),
      } });
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  router.post(
    "/attempts/:attemptId/questions/:questionId/run",
    codingRunRateLimit,
    async (req, res) => {
      try {
        validateMutationBody(req);
        const result = await attemptService.runPublicCodingQuestion({
          attemptId: parsePositiveId(req.params.attemptId),
          questionId: parsePositiveId(req.params.questionId),
          studentId: req.userId,
        });
        return res.status(200).json({ result });
      } catch (error) {
        return sendAssessmentError(res, error);
      }
    },
  );

  router.post("/attempts/:attemptId/submit", async (req, res) => {
    try {
      validateMutationBody(req);
      const attemptId = parsePositiveId(req.params.attemptId);
      const submissionKey = submissionKeyFromHeader(req);
      const submitted = await attemptService.submitAttempt({
        attemptId,
        studentId: req.userId,
        submissionKey,
      });
      if (submitted.status === "GRADING") {
        return res.status(202).json({
          result: { attemptId: submitted.id, status: "GRADING" },
          reviewAvailable: false,
        });
      }
      const payload = await readService.getStudentResult({ attemptId, studentId: req.userId });
      return res.status(200).json(payload);
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  router.get("/attempts/:attemptId/result", async (req, res) => {
    try {
      const payload = await readService.getStudentResult({
        attemptId: parsePositiveId(req.params.attemptId),
        studentId: req.userId,
      });
      return res.status(200).json(payload);
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  router.get("/classrooms/:classroomId/lessons/:lessonKey/:type/attempts/:attemptId/result", async (req, res) => {
    try {
      const lessonKey = req.params.lessonKey;
      const payload = await readService.getStudentResult({
        attemptId: parsePositiveId(req.params.attemptId),
        studentId: req.userId,
        expectedClassroomId: parsePositiveId(req.params.classroomId),
        expectedLessonKey: lessonKey,
        expectedType: normalizeType(req.params.type),
      });
      return res.status(200).json(payload);
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  router.get("/classrooms/:classroomId/lessons/:lessonKey/:type", async (req, res) => {
    try {
      const payload = await readService.discoverAssessment({
        classroomId: parsePositiveId(req.params.classroomId),
        lessonKey: req.params.lessonKey,
        type: normalizeType(req.params.type),
        studentId: req.userId,
      });
      return res.status(200).json(payload);
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  router.get("/attempts/:attemptId", async (req, res) => {
    try {
      const payload = await readService.getActiveAttempt({
        attemptId: parsePositiveId(req.params.attemptId),
        studentId: req.userId,
      });
      return res.status(200).json(payload);
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  router.get("/:assessmentId", async (req, res) => {
    try {
      const payload = await readService.getPlayerAssessment({
        assessmentId: parsePositiveId(req.params.assessmentId),
        studentId: req.userId,
      });
      return res.status(200).json(payload);
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  return router;
};

const router = createAssessmentRouter();
router.createAssessmentRouter = createAssessmentRouter;

module.exports = router;
