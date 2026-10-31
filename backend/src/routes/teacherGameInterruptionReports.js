const express = require("express");
const requireRole = require("../middleware/requireRole");
const { PLAYABLE_LEVEL_KEYS } = require("../constants/progressDefaults");
const reportServiceDefault = require("../services/teacherGameInterruptionReportService");

const allowedQueryFields = new Set([
  "classroomId",
  "sessionPage",
  "sessionLimit",
  "eventPage",
  "eventLimit",
]);
const playableLevelKeys = new Set(PLAYABLE_LEVEL_KEYS);
const MAX_SUPPORTED_OFFSET = 2_147_483_647;

class TeacherGameInterruptionReportRouteError extends Error {
  constructor() {
    super("Invalid request");
    this.status = 400;
    this.code = "INVALID_REQUEST";
  }
}

const invalidRequest = () => { throw new TeacherGameInterruptionReportRouteError(); };

const positiveSafeInteger = (value) => {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) invalidRequest();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) invalidRequest();
  return parsed;
};

const paginationValue = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
  if (value === undefined) return fallback;
  const parsed = positiveSafeInteger(value);
  if (parsed > maximum) invalidRequest();
  return parsed;
};

const parseRequest = (req) => {
  if (Object.keys(req.query).some((key) => !allowedQueryFields.has(key))) invalidRequest();
  const studentId = positiveSafeInteger(req.params.studentId);
  if (typeof req.params.levelKey !== "string" || !playableLevelKeys.has(req.params.levelKey)) {
    invalidRequest();
  }
  const classroomId = positiveSafeInteger(req.query.classroomId);
  const sessionPage = paginationValue(req.query.sessionPage, 1);
  const sessionLimit = paginationValue(req.query.sessionLimit, 20, 100);
  const eventPage = paginationValue(req.query.eventPage, 1);
  const eventLimit = paginationValue(req.query.eventLimit, 20, 100);
  const sessionOffset = (sessionPage - 1) * sessionLimit;
  const eventOffset = (eventPage - 1) * eventLimit;
  if (!Number.isSafeInteger(sessionOffset)
    || sessionOffset > MAX_SUPPORTED_OFFSET
    || !Number.isSafeInteger(eventOffset)
    || eventOffset > MAX_SUPPORTED_OFFSET) {
    invalidRequest();
  }
  return {
    studentId,
    classroomId,
    levelKey: req.params.levelKey,
    sessionPage,
    sessionLimit,
    sessionOffset,
    eventPage,
    eventLimit,
    eventOffset,
  };
};

const createTeacherGameInterruptionReportRouter = ({
  reportService = reportServiceDefault,
} = {}) => {
  const router = express.Router();
  router.get(
    "/analytics/students/:studentId/game-interruptions/:levelKey",
    requireRole("teacher", "admin"),
    async (req, res) => {
      try {
        const request = parseRequest(req);
        const report = await reportService.getTeacherGameInterruptionReport({
          actorId: req.userId,
          actorRole: req.userRole,
          ...request,
        });
        return res.json(report);
      } catch (error) {
        if (error instanceof TeacherGameInterruptionReportRouteError
          || error instanceof reportServiceDefault.TeacherGameInterruptionReportError) {
          return res.status(error.status).json({ code: error.code, message: error.message });
        }
        // Scope identifiers and private report internals are intentionally not logged.
        console.error("Teacher game interruption report failed");
        return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
      }
    },
  );
  return router;
};

module.exports = { createTeacherGameInterruptionReportRouter };
