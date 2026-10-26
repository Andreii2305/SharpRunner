const sequelize = require("../config/database");
const { Validator } = require("sequelize");
const {
  Classroom,
  ClassroomMembership,
  TeacherStudentCheckIn,
  User,
} = require("../models");
const {
  PRIVATE_CHECK_IN_IDEMPOTENCY_KEY_PATTERN,
  PRIVATE_CHECK_IN_LIMITS,
} = require("../constants/privateCheckInConfig");

const SUPPORTED_ACTOR_ROLES = new Set(["teacher", "admin"]);

class PrivateCheckInError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "PrivateCheckInError";
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => {
  throw new PrivateCheckInError(status, code, message);
};

const positiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const plain = (record) => (
  typeof record?.get === "function" ? record.get({ plain: true }) : record
);

const serializeCheckIn = (recordInput) => {
  const record = plain(recordInput);
  return {
    id: record.id,
    senderId: record.senderId,
    senderRole: record.senderRole,
    recipientStudentId: record.recipientStudentId,
    classroomId: record.classroomId,
    message: record.message,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
};

const isSenderKeyUniqueError = (error) => {
  if (error?.name !== "SequelizeUniqueConstraintError") return false;
  const evidence = [
    error.constraint,
    error.parent?.constraint,
    error.original?.constraint,
    error.index,
    ...Object.keys(error.fields || {}),
    ...(error.errors || []).flatMap((item) => [item.path, item.constraint]),
  ].filter(Boolean).join(" ").toLowerCase();
  return evidence.includes("teacher_student_check_ins_sender_key")
    || (evidence.includes("senderid") && evidence.includes("idempotencykey"));
};

const createPrivateCheckInService = ({
  sequelize: database = sequelize,
  models = {
    Classroom,
    ClassroomMembership,
    TeacherStudentCheckIn,
    User,
  },
} = {}) => {
  const findExisting = ({ senderId, idempotencyKey, transaction }) => (
    models.TeacherStudentCheckIn.findOne({
      where: { senderId, idempotencyKey },
      transaction,
      lock: transaction.LOCK.UPDATE,
    })
  );

  const createPrivateCheckIn = async ({
    actorId: actorIdInput,
    actorRole: actorRoleInput,
    classroomId: classroomIdInput,
    studentId: studentIdInput,
    message: messageInput,
    idempotencyKey: idempotencyKeyInput,
  }) => {
    const actorId = positiveInteger(actorIdInput);
    const classroomId = positiveInteger(classroomIdInput);
    const studentId = positiveInteger(studentIdInput);
    const actorRole = typeof actorRoleInput === "string"
      ? actorRoleInput.trim().toLowerCase()
      : "";
    const message = typeof messageInput === "string" ? messageInput.trim() : "";
    const idempotencyKey = typeof idempotencyKeyInput === "string"
      ? idempotencyKeyInput
      : "";

    if (!actorId
      || !classroomId
      || !studentId
      || !SUPPORTED_ACTOR_ROLES.has(actorRole)
      || !Validator.isLength(message, {
        min: 1,
        max: PRIVATE_CHECK_IN_LIMITS.messageLength,
      })
      || !PRIVATE_CHECK_IN_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      fail(400, "INVALID_REQUEST", "Invalid request");
    }

    const matchesRequest = (recordInput) => {
      const record = plain(recordInput);
      return Number(record.senderId) === actorId
        && Number(record.classroomId) === classroomId
        && Number(record.recipientStudentId) === studentId
        && record.message === message;
    };

    const replayOrConflict = (record) => {
      if (!matchesRequest(record)) {
        fail(409, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency key conflict");
      }
      return { changed: false, checkIn: serializeCheckIn(record) };
    };

    return database.transaction(async (transaction) => {
      const classroomRecord = await models.Classroom.findByPk(classroomId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!classroomRecord) {
        fail(404, "CLASSROOM_NOT_FOUND", "Classroom was not found");
      }
      if (actorRole !== "admin" && (
        actorRole !== "teacher" || Number(classroomRecord.teacherId) !== actorId
      )) {
        fail(403, "FORBIDDEN", "Forbidden");
      }

      const existing = await findExisting({
        senderId: actorId,
        idempotencyKey,
        transaction,
      });
      if (existing) return replayOrConflict(existing);

      if (classroomRecord.isActive !== true) {
        fail(409, "CLASSROOM_INACTIVE", "Classroom is inactive");
      }

      const activeMembership = await models.ClassroomMembership.findOne({
        where: { classroomId, studentId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!activeMembership || activeMembership.status !== "active") {
        fail(404, "ACTIVE_STUDENT_NOT_FOUND", "Active student was not found");
      }

      const recipient = await models.User.findByPk(studentId, {
        attributes: ["id", "role", "status"],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!recipient || recipient.role !== "student" || recipient.status !== "active") {
        fail(404, "ACTIVE_STUDENT_NOT_FOUND", "Active student was not found");
      }

      try {
        const created = await database.transaction({ transaction }, async (savepoint) => (
          models.TeacherStudentCheckIn.create({
            senderId: actorId,
            senderRole: actorRole,
            recipientStudentId: studentId,
            classroomId,
            message,
            idempotencyKey,
          }, { transaction: savepoint })
        ));
        return { changed: true, checkIn: serializeCheckIn(created) };
      } catch (error) {
        if (!isSenderKeyUniqueError(error)) throw error;
        const concurrent = await findExisting({
          senderId: actorId,
          idempotencyKey,
          transaction,
        });
        if (!concurrent) throw error;
        return replayOrConflict(concurrent);
      }
    });
  };

  return { createPrivateCheckIn };
};

const service = createPrivateCheckInService();

module.exports = {
  PrivateCheckInError,
  createPrivateCheckInService,
  createPrivateCheckIn: service.createPrivateCheckIn,
};
