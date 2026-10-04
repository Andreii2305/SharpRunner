const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const defaultService = require("../services/teacherAssessmentService");
const { AssessmentApiError, sendAssessmentError } = require("../services/assessmentErrorService");

const CREATE_FIELDS = new Set([
  "lessonKey",
  "type",
  "title",
  "instructions",
  "isRequired",
  "passingPercentage",
  "maxAttempts",
  "requirePassingForCompletion",
  "showScoreAfterSubmission",
  "answerReviewPolicy",
  "shuffleQuestions",
  "shuffleChoices",
]);
const COPY_FIELDS = new Set(["sourceClassroomId", "sourceAssessmentId", "lessonKey", "type"]);

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

const assertQueryKeys = (query, keys) => {
  if (Object.keys(query).length !== keys.length
    || !keys.every((key) => Object.hasOwn(query, key))) {
    throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
  }
};

const readObjectBody = (req) => {
  if (req.body === undefined
    && (Number(req.headers["content-length"] || 0) > 0 || req.headers["transfer-encoding"])) {
    throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
  }
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
  }
  if (Object.keys(req.query).length) {
    throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
  }
  return req.body;
};

const actor = (req) => ({ actorId: req.userId, actorRole: req.userRole });

const readVersionActionBody = (req) => {
  const body = readObjectBody(req);
  if (Object.keys(body).length !== 1 || !Object.hasOwn(body, "version")
    || !Number.isSafeInteger(body.version) || body.version < 1) {
    throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
  }
  return body.version;
};

const assertNoBody = (req) => {
  if (Object.keys(req.query).length || req.body !== undefined
    || Number(req.headers["content-length"] || 0) > 0 || req.headers["transfer-encoding"]) {
    throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
  }
};

const createTeacherAssessmentRouter = ({ service = defaultService } = {}) => {
  const router = express.Router();
  router.use(authMiddleware, requireRole("teacher", "admin"));

  router.get("/classrooms/:classroomId/assessments", async (req, res) => {
    try {
      assertQueryKeys(req.query, ["lessonKey"]);
      const payload = await service.listAssessments({
        classroomId: parsePositiveId(req.params.classroomId),
        lessonKey: req.query.lessonKey,
        ...actor(req),
      });
      return res.status(200).json(payload);
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  router.post("/classrooms/:classroomId/assessments", async (req, res) => {
    try {
      const input = readObjectBody(req);
      if (Object.keys(input).some((key) => !CREATE_FIELDS.has(key))) {
        throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
      }
      const payload = await service.createAssessment({
        classroomId: parsePositiveId(req.params.classroomId),
        input,
        ...actor(req),
      });
      return res.status(201).json(payload);
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  router.post("/classrooms/:classroomId/assessments/copy", async (req, res) => {
    try {
      const body = readObjectBody(req);
      if (Object.keys(body).length !== COPY_FIELDS.size
        || Object.keys(body).some((key) => !COPY_FIELDS.has(key))) {
        throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
      }
      const payload = await service.copyAssessment({
        destinationClassroomId: parsePositiveId(req.params.classroomId),
        sourceClassroomId: parsePositiveId(body.sourceClassroomId),
        sourceAssessmentId: parsePositiveId(body.sourceAssessmentId),
        lessonKey: body.lessonKey,
        type: body.type,
        ...actor(req),
      });
      return res.status(201).json(payload);
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  router.get("/classrooms/:classroomId/assessments/:assessmentId/results", async (req, res) => {
    try {
      assertQueryKeys(req.query, []);
      const payload = await service.getAssessmentResults({
        classroomId: parsePositiveId(req.params.classroomId),
        assessmentId: parsePositiveId(req.params.assessmentId),
        ...actor(req),
      });
      return res.status(200).json(payload);
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  router.get("/classrooms/:classroomId/assessments/:assessmentId", async (req, res) => {
    try {
      assertQueryKeys(req.query, []);
      const payload = await service.getEditorAssessment({
        classroomId: parsePositiveId(req.params.classroomId),
        assessmentId: parsePositiveId(req.params.assessmentId),
        ...actor(req),
      });
      return res.status(200).json(payload);
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  router.put("/classrooms/:classroomId/assessments/:assessmentId", async (req, res) => {
    try {
      const input = readObjectBody(req);
      const saveFields = ["version", "settings", "questions"];
      if (Object.keys(input).length !== saveFields.length
        || !saveFields.every((key) => Object.hasOwn(input, key))) {
        throw new AssessmentApiError(400, "INVALID_REQUEST", "Invalid request");
      }
      const payload = await service.saveAssessmentGraph({
        classroomId: parsePositiveId(req.params.classroomId),
        assessmentId: parsePositiveId(req.params.assessmentId),
        input,
        ...actor(req),
      });
      return res.status(200).json(payload);
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  router.post("/classrooms/:classroomId/assessments/:assessmentId/publish", async (req, res) => {
    try {
      const payload = await service.publishAssessment({
        classroomId: parsePositiveId(req.params.classroomId),
        assessmentId: parsePositiveId(req.params.assessmentId),
        version: readVersionActionBody(req),
        ...actor(req),
      });
      return res.status(200).json(payload);
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  router.post("/classrooms/:classroomId/assessments/:assessmentId/unpublish", async (req, res) => {
    try {
      const payload = await service.unpublishAssessment({
        classroomId: parsePositiveId(req.params.classroomId),
        assessmentId: parsePositiveId(req.params.assessmentId),
        version: readVersionActionBody(req),
        ...actor(req),
      });
      return res.status(200).json(payload);
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  router.post(
    "/classrooms/:classroomId/assessments/:assessmentId/students/:studentId/additional-attempt",
    async (req, res) => {
      try {
        assertNoBody(req);
        const payload = await service.grantAdditionalPostAttempt({
          classroomId: parsePositiveId(req.params.classroomId),
          assessmentId: parsePositiveId(req.params.assessmentId),
          studentId: parsePositiveId(req.params.studentId),
          ...actor(req),
        });
        return res.status(201).json(payload);
      } catch (error) {
        return sendAssessmentError(res, error);
      }
    },
  );

  router.delete("/classrooms/:classroomId/assessments/:assessmentId", async (req, res) => {
    try {
      assertNoBody(req);
      await service.deleteAssessment({
        classroomId: parsePositiveId(req.params.classroomId),
        assessmentId: parsePositiveId(req.params.assessmentId),
        ...actor(req),
      });
      return res.status(204).end();
    } catch (error) {
      return sendAssessmentError(res, error);
    }
  });

  return router;
};

const router = createTeacherAssessmentRouter();
router.createTeacherAssessmentRouter = createTeacherAssessmentRouter;

module.exports = router;
