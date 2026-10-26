const defaultModels = require("../models");

const toPlain = (record) => (
  record && typeof record.get === "function" ? record.get({ plain: true }) : record
);

const normalizeCount = (value) => {
  const numeric = typeof value === "bigint" ? value : BigInt(String(value ?? "0"));
  if (numeric < 0n || numeric > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Classroom feedback count exceeds the supported range");
  }
  return Number(numeric);
};

const validateInput = ({ studentId, page, limit, offset }) => {
  if (![studentId, page, limit].every(Number.isSafeInteger)
    || studentId <= 0 || page <= 0 || limit <= 0 || limit > 100
    || !Number.isSafeInteger(offset) || offset < 0
    || offset !== (page - 1) * limit) {
    throw new TypeError("Invalid student classroom feedback listing input");
  }
};

const createStudentClassroomFeedbackReadService = ({ models = defaultModels } = {}) => {
  const listStudentClassroomFeedback = async ({ studentId, page, limit, offset }) => {
    validateInput({ studentId, page, limit, offset });

    const result = await models.StudentClassroomFeedback.findAndCountAll({
      where: { studentId },
      attributes: ["id", "classroomId", "message", "createdAt"],
      include: [{
        model: models.Classroom,
        as: "classroom",
        attributes: ["id", "className", "section", "schoolYear", "isActive"],
        required: false,
      }],
      distinct: true,
      order: [["createdAt", "DESC"], ["id", "DESC"]],
      limit,
      offset,
    });
    const total = normalizeCount(result.count);
    const feedback = result.rows.map((record) => {
      const row = toPlain(record);
      return {
        id: row.id,
        classroomId: row.classroomId,
        classroom: row.classroom ? {
          id: row.classroom.id,
          className: row.classroom.className,
          section: row.classroom.section,
          schoolYear: row.classroom.schoolYear,
          isActive: row.classroom.isActive,
        } : null,
        message: row.message,
        createdAt: row.createdAt,
      };
    });

    return {
      feedback,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  };

  return { listStudentClassroomFeedback };
};

module.exports = {
  createStudentClassroomFeedbackReadService,
  ...createStudentClassroomFeedbackReadService(),
};
