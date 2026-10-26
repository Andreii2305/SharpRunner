const sequelize = require("../config/database");
const { Validator } = require("sequelize");
const {
  Classroom,
  ClassroomMembership,
  StudentClassroomFeedback,
  User,
} = require("../models");
const {
  STUDENT_CLASSROOM_FEEDBACK_IDEMPOTENCY_KEY_PATTERN,
  STUDENT_CLASSROOM_FEEDBACK_LIMITS,
} = require("../constants/studentClassroomFeedbackConfig");

class StudentClassroomFeedbackError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "StudentClassroomFeedbackError";
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => {
  throw new StudentClassroomFeedbackError(status, code, message);
};

const positiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const plain = (record) => (
  typeof record?.get === "function" ? record.get({ plain: true }) : record
);

const serializeFeedback = (recordInput) => {
  const record = plain(recordInput);
  return {
    id: record.id,
    classroomId: record.classroomId,
    message: record.message,
    createdAt: record.createdAt,
  };
};

const isStudentKeyUniqueError = (error) => {
  if (error?.name !== "SequelizeUniqueConstraintError") return false;
  const evidence = [
    error.constraint,
    error.parent?.constraint,
    error.original?.constraint,
    error.index,
    ...Object.keys(error.fields || {}),
    ...(error.errors || []).flatMap((item) => [item.path, item.constraint]),
  ].filter(Boolean).join(" ").toLowerCase();
  return evidence.includes("student_classroom_feedback_student_key")
    || (evidence.includes("studentid") && evidence.includes("idempotencykey"));
};

const createStudentClassroomFeedbackService = ({
  sequelize: database = sequelize,
  models = {
    Classroom,
    ClassroomMembership,
    StudentClassroomFeedback,
    User,
  },
} = {}) => {
  const findExisting = ({ studentId, idempotencyKey, transaction }) => (
    models.StudentClassroomFeedback.findOne({
      where: { studentId, idempotencyKey },
      transaction,
      lock: transaction.LOCK.UPDATE,
    })
  );

  const requireActiveStudent = async ({ studentId, transaction }) => {
    const actor = await models.User.findByPk(studentId, {
      attributes: ["id", "role", "status"],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!actor || actor.role !== "student" || actor.status !== "active") {
      fail(403, "FORBIDDEN", "Forbidden");
    }
  };

  const submitStudentClassroomFeedback = async ({
    actorId: actorIdInput,
    actorRole: actorRoleInput,
    classroomId: classroomIdInput,
    message: messageInput,
    idempotencyKey: idempotencyKeyInput,
  }) => {
    const actorId = positiveInteger(actorIdInput);
    const classroomId = positiveInteger(classroomIdInput);
    const actorRole = typeof actorRoleInput === "string"
      ? actorRoleInput.trim().toLowerCase()
      : "";
    const message = typeof messageInput === "string" ? messageInput.trim() : "";
    const idempotencyKey = typeof idempotencyKeyInput === "string"
      ? idempotencyKeyInput
      : "";

    if (!actorId
      || !classroomId
      || !Validator.isLength(message, {
        min: 1,
        max: STUDENT_CLASSROOM_FEEDBACK_LIMITS.messageLength,
      })
      || !STUDENT_CLASSROOM_FEEDBACK_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      fail(400, "INVALID_REQUEST", "Invalid request");
    }
    if (actorRole !== "student") {
      fail(403, "FORBIDDEN", "Forbidden");
    }

    const matchesRequest = (recordInput) => {
      const record = plain(recordInput);
      return Number(record.studentId) === actorId
        && Number(record.classroomId) === classroomId
        && record.message === message;
    };

    const replayOrConflict = (record) => {
      if (!matchesRequest(record)) {
        fail(409, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency key conflict");
      }
      return { changed: false, feedback: serializeFeedback(record) };
    };

    return database.transaction(async (transaction) => {
      const classroomRecord = await models.Classroom.findByPk(classroomId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!classroomRecord) {
        fail(404, "CLASSROOM_NOT_FOUND", "Classroom was not found");
      }

      const existing = await findExisting({
        studentId: actorId,
        idempotencyKey,
        transaction,
      });
      if (existing) {
        await requireActiveStudent({ studentId: actorId, transaction });
        return replayOrConflict(existing);
      }

      if (classroomRecord.isActive !== true) {
        fail(409, "CLASSROOM_INACTIVE", "Classroom is inactive");
      }

      const activeMembership = await models.ClassroomMembership.findOne({
        where: { classroomId, studentId: actorId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!activeMembership || activeMembership.status !== "active") {
        fail(403, "FORBIDDEN", "Forbidden");
      }

      await requireActiveStudent({ studentId: actorId, transaction });

      try {
        const created = await database.transaction({ transaction }, async (savepoint) => (
          models.StudentClassroomFeedback.create({
            classroomId,
            studentId: actorId,
            message,
            idempotencyKey,
          }, { transaction: savepoint })
        ));
        return { changed: true, feedback: serializeFeedback(created) };
      } catch (error) {
        if (!isStudentKeyUniqueError(error)) throw error;
        const concurrent = await findExisting({
          studentId: actorId,
          idempotencyKey,
          transaction,
        });
        if (!concurrent) throw error;
        return replayOrConflict(concurrent);
      }
    });
  };

  return { submitStudentClassroomFeedback };
};

const service = createStudentClassroomFeedbackService();

module.exports = {
  StudentClassroomFeedbackError,
  createStudentClassroomFeedbackService,
  submitStudentClassroomFeedback: service.submitStudentClassroomFeedback,
};
