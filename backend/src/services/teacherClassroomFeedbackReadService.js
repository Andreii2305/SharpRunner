const defaultModels = require("../models");

class TeacherClassroomFeedbackReadError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "TeacherClassroomFeedbackReadError";
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => {
  throw new TeacherClassroomFeedbackReadError(status, code, message);
};

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

const validateInput = ({ actorId, classroomId, page, limit, offset }) => {
  if (![actorId, classroomId, page, limit].every(Number.isSafeInteger)
    || actorId <= 0 || classroomId <= 0 || page <= 0 || limit <= 0 || limit > 100
    || !Number.isSafeInteger(offset) || offset < 0
    || offset !== (page - 1) * limit) {
    throw new TypeError("Invalid classroom feedback listing input");
  }
};

const createTeacherClassroomFeedbackReadService = ({ models = defaultModels } = {}) => {
  const listTeacherClassroomFeedback = async ({ actorId, classroomId, page, limit, offset }) => {
    validateInput({ actorId, classroomId, page, limit, offset });

    const classroom = await models.Classroom.findByPk(classroomId, {
      attributes: ["id", "teacherId"],
    });
    if (!classroom) {
      fail(404, "CLASSROOM_NOT_FOUND", "Classroom was not found");
    }
    if (Number(classroom.teacherId) !== actorId) {
      fail(403, "FORBIDDEN", "Forbidden");
    }

    const result = await models.StudentClassroomFeedback.findAndCountAll({
      where: { classroomId },
      attributes: ["id", "classroomId", "message", "createdAt"],
      include: [{
        model: models.User,
        as: "student",
        attributes: ["id", "firstName", "lastName", "username"],
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
        message: row.message,
        createdAt: row.createdAt,
        student: row.student ? {
          id: row.student.id,
          firstName: row.student.firstName,
          lastName: row.student.lastName,
          username: row.student.username,
        } : null,
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

  return { listTeacherClassroomFeedback };
};

module.exports = {
  TeacherClassroomFeedbackReadError,
  createTeacherClassroomFeedbackReadService,
  ...createTeacherClassroomFeedbackReadService(),
};
