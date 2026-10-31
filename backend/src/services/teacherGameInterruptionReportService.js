const { QueryTypes, Transaction } = require("sequelize");
const sequelize = require("../config/database");
const Classroom = require("../models/Classroom");
const ClassroomMembership = require("../models/ClassroomMembership");
const GameInterruptionCompletionEvidence = require("../models/GameInterruptionCompletionEvidence");
const User = require("../models/User");
const {
  DEFAULT_LEVEL_PROGRESS,
  PLAYABLE_LEVEL_KEYS,
} = require("../constants/progressDefaults");

const playableLevelKeys = new Set(PLAYABLE_LEVEL_KEYS);
const MAX_PAGE_LIMIT = 100;
const MAX_SUPPORTED_OFFSET = 2_147_483_647;

class TeacherGameInterruptionReportError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "TeacherGameInterruptionReportError";
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => {
  throw new TeacherGameInterruptionReportError(status, code, message);
};

const plain = (value) => value?.get ? value.get({ plain: true }) : value;

const positiveSafeInteger = (value) => Number.isSafeInteger(value) && value > 0;

const validatePagination = (page, limit, offset) => (
  positiveSafeInteger(page)
  && positiveSafeInteger(limit)
  && limit <= MAX_PAGE_LIMIT
  && Number.isSafeInteger(offset)
  && offset >= 0
  && offset <= MAX_SUPPORTED_OFFSET
  && offset === (page - 1) * limit
);

const validateInput = (input) => {
  if (!input
    || !positiveSafeInteger(input.actorId)
    || !["teacher", "admin"].includes(input.actorRole)
    || !positiveSafeInteger(input.classroomId)
    || !positiveSafeInteger(input.studentId)
    || typeof input.levelKey !== "string"
    || !playableLevelKeys.has(input.levelKey)
    || !validatePagination(input.sessionPage, input.sessionLimit, input.sessionOffset)
    || !validatePagination(input.eventPage, input.eventLimit, input.eventOffset)) {
    fail(400, "INVALID_REQUEST", "Invalid request");
  }
};

const parseCount = (value) => {
  const normalized = typeof value === "number" ? String(value) : value;
  if (typeof normalized !== "string" || !/^\d+$/.test(normalized)) {
    fail(409, "REPORT_INTEGRITY_ERROR", "Report could not be verified");
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    fail(409, "REPORT_INTEGRITY_ERROR", "Report could not be verified");
  }
  return parsed;
};

const parseHundredths = (value) => {
  if (typeof value !== "string" && typeof value !== "number") {
    fail(409, "REPORT_INTEGRITY_ERROR", "Report could not be verified");
  }
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) fail(409, "REPORT_INTEGRITY_ERROR", "Report could not be verified");
  const result = (Number(match[1]) * 100) + Number((match[2] || "").padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) {
    fail(409, "REPORT_INTEGRITY_ERROR", "Report could not be verified");
  }
  return result;
};

const scoreNumber = (value) => parseHundredths(value) / 100;

const pageResult = ({ items, page, limit, total }) => ({
  items,
  page,
  limit,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / limit),
});

const levelScope = (levelKey) => {
  const progress = DEFAULT_LEVEL_PROGRESS.find((entry) => entry.levelKey === levelKey);
  const match = /-level-(\d+)$/.exec(levelKey);
  return {
    levelKey,
    lessonTitle: progress?.lessonTitle ?? levelKey,
    levelNumber: match ? Number(match[1]) : null,
  };
};

const SUMMARY_SQL = `
  /* report:summary */
  SELECT
    COUNT(e."id")::text AS "recordedEventCount",
    COUNT(e."id") FILTER (WHERE e."appliedAt" IS NOT NULL)::text AS "appliedEventCount",
    COUNT(e."id") FILTER (WHERE e."id" IS NOT NULL AND e."appliedAt" IS NULL)::text AS "unappliedEventCount",
    COALESCE(SUM(e."appliedScoreDeduction") FILTER (WHERE e."appliedAt" IS NOT NULL), 0)::text
      AS "actualScoreDeduction",
    COALESCE(SUM(e."appliedXpDeduction") FILTER (WHERE e."appliedAt" IS NOT NULL), 0)::text
      AS "actualXpDeduction",
    MIN(e."completionEvidenceId") FILTER (WHERE e."appliedAt" IS NOT NULL)::text
      AS "minimumEvidenceId",
    MAX(e."completionEvidenceId") FILTER (WHERE e."appliedAt" IS NOT NULL)::text
      AS "maximumEvidenceId"
  FROM "GameInterruptionSessions" s
  LEFT JOIN "GameInterruptionEvents" e
    ON e."sessionId" = s."id" AND e."studentId" = s."studentId"
  WHERE s."studentId" = :studentId
    AND s."classroomId" = :classroomId
    AND s."levelKey" = :levelKey
`;

const SESSION_COUNT_SQL = `
  /* report:session-count */
  SELECT COUNT(*)::text AS "total"
  FROM "GameInterruptionSessions" s
  WHERE s."studentId" = :studentId
    AND s."classroomId" = :classroomId
    AND s."levelKey" = :levelKey
`;

const SESSIONS_SQL = `
  /* report:sessions */
  SELECT
    s."id",
    s."lifecycleStatus",
    s."startedAt",
    s."supersededAt",
    s."completedAt",
    s."scoreDeductionSnapshot"::text AS "scoreDeductionSnapshot",
    s."xpDeductionSnapshot",
    COUNT(e."id")::text AS "recordedEventCount",
    COUNT(e."id") FILTER (WHERE e."appliedAt" IS NOT NULL)::text AS "appliedEventCount",
    COUNT(e."id") FILTER (WHERE e."id" IS NOT NULL AND e."appliedAt" IS NULL)::text
      AS "unappliedEventCount",
    COALESCE(SUM(e."appliedScoreDeduction") FILTER (WHERE e."appliedAt" IS NOT NULL), 0)::text
      AS "actualScoreDeduction",
    COALESCE(SUM(e."appliedXpDeduction") FILTER (WHERE e."appliedAt" IS NOT NULL), 0)::text
      AS "actualXpDeduction"
  FROM "GameInterruptionSessions" s
  LEFT JOIN "GameInterruptionEvents" e
    ON e."sessionId" = s."id" AND e."studentId" = s."studentId"
  WHERE s."studentId" = :studentId
    AND s."classroomId" = :classroomId
    AND s."levelKey" = :levelKey
  GROUP BY s."id"
  ORDER BY s."startedAt" DESC, s."id" DESC
  LIMIT :limit OFFSET :offset
`;

const EVENT_COUNT_SQL = `
  /* report:event-count */
  SELECT COUNT(*)::text AS "total"
  FROM "GameInterruptionEvents" e
  INNER JOIN "GameInterruptionSessions" s
    ON s."id" = e."sessionId" AND s."studentId" = e."studentId"
  WHERE s."studentId" = :studentId
    AND s."classroomId" = :classroomId
    AND s."levelKey" = :levelKey
`;

const EVENTS_SQL = `
  /* report:events */
  SELECT
    e."id",
    e."sessionId",
    e."eventType",
    e."receivedAt",
    e."appliedAt",
    e."appliedScoreDeduction"::text AS "appliedScoreDeduction",
    e."appliedXpDeduction",
    e."completionEvidenceId"
  FROM "GameInterruptionEvents" e
  INNER JOIN "GameInterruptionSessions" s
    ON s."id" = e."sessionId" AND s."studentId" = e."studentId"
  WHERE s."studentId" = :studentId
    AND s."classroomId" = :classroomId
    AND s."levelKey" = :levelKey
  ORDER BY e."receivedAt" DESC, e."id" DESC
  LIMIT :limit OFFSET :offset
`;

const createTeacherGameInterruptionReportService = ({
  database = sequelize,
  models = {
    Classroom,
    ClassroomMembership,
    GameInterruptionCompletionEvidence,
    User,
  },
  now = () => new Date(),
} = {}) => {
  const getTeacherGameInterruptionReport = async (input) => {
    validateInput(input);
    const {
      actorId,
      actorRole,
      classroomId,
      studentId,
      levelKey,
      sessionPage,
      sessionLimit,
      sessionOffset,
      eventPage,
      eventLimit,
      eventOffset,
    } = input;

    return database.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
      readOnly: true,
    }, async (transaction) => {
      const classroomWhere = { id: classroomId, isActive: true };
      if (actorRole === "teacher") classroomWhere.teacherId = actorId;
      const classroom = plain(await models.Classroom.findOne({
        where: classroomWhere,
        attributes: ["id", "teacherId", "className", "section", "isActive"],
        transaction,
      }));
      if (!classroom) {
        fail(403, "CLASSROOM_NOT_AVAILABLE", "Classroom is not available to this teacher");
      }

      const membership = await models.ClassroomMembership.findOne({
        where: { classroomId, studentId, status: "active" },
        attributes: ["classroomId", "studentId", "status"],
        transaction,
      });
      if (!membership) {
        fail(403, "STUDENT_NOT_AVAILABLE", "Student is not an active member of this classroom");
      }

      const student = plain(await models.User.findOne({
        where: { id: studentId, role: "student", status: "active" },
        attributes: ["id", "firstName", "lastName", "username"],
        transaction,
      }));
      if (!student) {
        fail(403, "STUDENT_NOT_AVAILABLE", "Student is not an active member of this classroom");
      }

      const scopeReplacements = { studentId, classroomId, levelKey };
      const query = (sql, replacements = scopeReplacements) => database.query(sql, {
        replacements,
        type: QueryTypes.SELECT,
        transaction,
      });
      const [summaryRows, sessionCountRows, sessionRows, eventCountRows, eventRows] = [
        await query(SUMMARY_SQL),
        await query(SESSION_COUNT_SQL),
        await query(SESSIONS_SQL, {
          ...scopeReplacements,
          limit: sessionLimit,
          offset: sessionOffset,
        }),
        await query(EVENT_COUNT_SQL),
        await query(EVENTS_SQL, {
          ...scopeReplacements,
          limit: eventLimit,
          offset: eventOffset,
        }),
      ];
      const evidence = plain(await models.GameInterruptionCompletionEvidence.findOne({
        where: { studentId, classroomId, levelKey },
        attributes: [
          "id", "studentId", "classroomId", "levelKey", "policyVersion",
          "appliedEventCount", "baseScore", "scoreDeduction", "finalScore",
          "grossCompletionXp", "xpDeduction", "netCompletionXp", "completedAt",
        ],
        transaction,
      }));

      const summaryRow = summaryRows[0] || {};
      const summary = {
        recordedEventCount: parseCount(summaryRow.recordedEventCount ?? "0"),
        appliedEventCount: parseCount(summaryRow.appliedEventCount ?? "0"),
        unappliedEventCount: parseCount(summaryRow.unappliedEventCount ?? "0"),
        actualScoreDeduction: scoreNumber(summaryRow.actualScoreDeduction ?? "0"),
        actualXpDeduction: parseCount(summaryRow.actualXpDeduction ?? "0"),
      };
      if (summary.recordedEventCount !== summary.appliedEventCount + summary.unappliedEventCount) {
        fail(409, "REPORT_INTEGRITY_ERROR", "Report could not be verified");
      }

      let completionEvidence = { availability: "unavailable" };
      if (!evidence) {
        if (summary.appliedEventCount !== 0
          || summaryRow.minimumEvidenceId != null
          || summaryRow.maximumEvidenceId != null) {
          fail(409, "REPORT_INTEGRITY_ERROR", "Report could not be verified");
        }
      } else {
        const evidenceId = parseCount(evidence.id);
        const evidenceEventCount = parseCount(evidence.appliedEventCount);
        const evidenceIdsMatch = evidenceEventCount === 0
          ? summaryRow.minimumEvidenceId == null && summaryRow.maximumEvidenceId == null
          : parseCount(summaryRow.minimumEvidenceId) === evidenceId
            && parseCount(summaryRow.maximumEvidenceId) === evidenceId;
        if (Number(evidence.studentId) !== studentId
          || Number(evidence.classroomId) !== classroomId
          || evidence.levelKey !== levelKey
          || evidenceEventCount !== summary.appliedEventCount
          || parseHundredths(evidence.scoreDeduction) !== parseHundredths(summaryRow.actualScoreDeduction)
          || parseCount(evidence.xpDeduction) !== summary.actualXpDeduction
          || !evidenceIdsMatch) {
          fail(409, "REPORT_INTEGRITY_ERROR", "Report could not be verified");
        }
        completionEvidence = {
          availability: "available",
          policyVersion: evidence.policyVersion,
          eventCount: evidenceEventCount,
          completedAt: evidence.completedAt,
          score: {
            base: scoreNumber(evidence.baseScore),
            deducted: scoreNumber(evidence.scoreDeduction),
            final: scoreNumber(evidence.finalScore),
          },
          xp: {
            gross: parseCount(evidence.grossCompletionXp),
            deducted: parseCount(evidence.xpDeduction),
            net: parseCount(evidence.netCompletionXp),
          },
        };
      }

      const serializedSessions = sessionRows.map((row) => {
        const recordedEventCount = parseCount(row.recordedEventCount);
        const appliedEventCount = parseCount(row.appliedEventCount);
        const unappliedEventCount = parseCount(row.unappliedEventCount);
        if (recordedEventCount !== appliedEventCount + unappliedEventCount) {
          fail(409, "REPORT_INTEGRITY_ERROR", "Report could not be verified");
        }
        return {
          id: parseCount(row.id),
          lifecycleStatus: row.lifecycleStatus,
          startedAt: row.startedAt,
          supersededAt: row.supersededAt ?? null,
          completedAt: row.completedAt ?? null,
          scoreDeductionSnapshot: scoreNumber(row.scoreDeductionSnapshot),
          xpDeductionSnapshot: parseCount(row.xpDeductionSnapshot),
          recordedEventCount,
          appliedEventCount,
          unappliedEventCount,
          actualScoreDeduction: scoreNumber(row.actualScoreDeduction),
          actualXpDeduction: parseCount(row.actualXpDeduction),
        };
      });

      const serializedEvents = eventRows.map((row) => {
        const fields = [
          row.appliedAt,
          row.appliedScoreDeduction,
          row.appliedXpDeduction,
          row.completionEvidenceId,
        ];
        const applied = fields.every((value) => value !== null && value !== undefined);
        const unapplied = fields.every((value) => value === null || value === undefined);
        if ((!applied && !unapplied)
          || (applied && (!evidence || Number(row.completionEvidenceId) !== Number(evidence.id)))) {
          fail(409, "REPORT_INTEGRITY_ERROR", "Report could not be verified");
        }
        return {
          id: parseCount(row.id),
          sessionId: parseCount(row.sessionId),
          type: row.eventType,
          receivedAt: row.receivedAt,
          applicationStatus: applied ? "applied" : "unapplied",
          appliedAt: applied ? row.appliedAt : null,
          actualScoreDeduction: applied ? scoreNumber(row.appliedScoreDeduction) : null,
          actualXpDeduction: applied ? parseCount(row.appliedXpDeduction) : null,
        };
      });

      return {
        scope: {
          classroom: {
            id: Number(classroom.id),
            className: classroom.className,
            section: classroom.section,
            isActive: Boolean(classroom.isActive),
          },
          student: {
            id: Number(student.id),
            firstName: student.firstName,
            lastName: student.lastName,
            username: student.username,
          },
          level: levelScope(levelKey),
        },
        summary,
        completionEvidence,
        sessions: pageResult({
          items: serializedSessions,
          page: sessionPage,
          limit: sessionLimit,
          total: parseCount(sessionCountRows[0]?.total ?? "0"),
        }),
        events: pageResult({
          items: serializedEvents,
          page: eventPage,
          limit: eventLimit,
          total: parseCount(eventCountRows[0]?.total ?? "0"),
        }),
        generatedAt: now(),
      };
    });
  };

  return { getTeacherGameInterruptionReport };
};

const service = createTeacherGameInterruptionReportService();

module.exports = {
  MAX_SUPPORTED_OFFSET,
  TeacherGameInterruptionReportError,
  createTeacherGameInterruptionReportService,
  getTeacherGameInterruptionReport: service.getTeacherGameInterruptionReport,
};
