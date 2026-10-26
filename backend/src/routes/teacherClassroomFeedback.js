const express = require("express");
const teacherClassroomFeedbackReadService = require("../services/teacherClassroomFeedbackReadService");

const invalidRequest = (res) => res.status(400).json({
  code: "INVALID_REQUEST",
  message: "Invalid request",
});

const parsePositiveSafeInteger = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
};

const parseRequest = (req) => {
  if (Object.keys(req.query).some((key) => !["page", "limit"].includes(key))) return null;
  const classroomId = parsePositiveSafeInteger(req.params.classroomId);
  const page = parsePositiveSafeInteger(req.query.page, 1);
  const limit = parsePositiveSafeInteger(req.query.limit, 20, 100);
  if (!classroomId || !page || !limit) return null;
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) return null;
  return { classroomId, page, limit, offset };
};

const createTeacherClassroomFeedbackRouter = ({
  service = teacherClassroomFeedbackReadService,
} = {}) => {
  const router = express.Router();

  router.get("/classrooms/:classroomId/student-feedback", async (req, res) => {
    if (req.userRole !== "teacher") {
      return res.status(403).json({ code: "FORBIDDEN", message: "Forbidden" });
    }
    const input = parseRequest(req);
    if (!input) return invalidRequest(res);

    try {
      const result = await service.listTeacherClassroomFeedback({
        actorId: req.userId,
        ...input,
      });
      return res.json(result);
    } catch (error) {
      if (error instanceof teacherClassroomFeedbackReadService.TeacherClassroomFeedbackReadError) {
        return res.status(error.status).json({ code: error.code, message: error.message });
      }
      // Feedback contents and internal query details are intentionally not logged.
      console.error("Teacher classroom feedback listing failed");
      return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
    }
  });

  return router;
};

module.exports = { createTeacherClassroomFeedbackRouter };
