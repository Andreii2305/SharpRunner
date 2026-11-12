const sequelize = require("../config/database");
const { PlatformFeedbackSubmission, User } = require("../models");
const {
  FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN,
  FEEDBACK_TESTIMONIAL_LIMITS,
  normalizeFeedbackTestimonialText,
} = require("../constants/feedbackTestimonialConfig");

class PlatformFeedbackError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "PlatformFeedbackError";
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => {
  throw new PlatformFeedbackError(status, code, message);
};

const toPlain = (record) => (
  typeof record?.get === "function" ? record.get({ plain: true }) : record
);

const serializeFeedback = (recordInput) => {
  const record = toPlain(recordInput);
  return {
    id: record.id,
    message: record.message,
    createdAt: record.createdAt,
  };
};

const isAuthorKeyUniqueError = (error) => {
  if (error?.name !== "SequelizeUniqueConstraintError") return false;
  const evidence = [
    error.constraint,
    error.parent?.constraint,
    error.original?.constraint,
    error.index,
    ...Object.keys(error.fields || {}),
    ...(error.errors || []).flatMap((item) => [item.path, item.constraint]),
  ].filter(Boolean).join(" ").toLowerCase();
  return evidence.includes("platform_feedback_submissions_author_key")
    || (evidence.includes("authoruserid") && evidence.includes("idempotencykey"));
};

const createPlatformFeedbackService = ({
  sequelize: database = sequelize,
  models = { PlatformFeedbackSubmission, User },
} = {}) => {
  const findExisting = ({ authorUserId, idempotencyKey, transaction }) => (
    models.PlatformFeedbackSubmission.findOne({
      where: { authorUserId, idempotencyKey },
      transaction,
      lock: transaction.LOCK.UPDATE,
    })
  );

  const submitPlatformFeedback = async ({
    actorId,
    actorRole: actorRoleInput,
    message: messageInput,
    idempotencyKey: idempotencyKeyInput,
  }) => {
    const actorRole = typeof actorRoleInput === "string"
      ? actorRoleInput.trim().toLowerCase()
      : "";
    const message = normalizeFeedbackTestimonialText(messageInput);
    const idempotencyKey = typeof idempotencyKeyInput === "string"
      ? idempotencyKeyInput
      : "";

    if (!Number.isSafeInteger(actorId)
      || actorId <= 0
      || typeof message !== "string"
      || [...message].length < 1
      || [...message].length > FEEDBACK_TESTIMONIAL_LIMITS.messageLength
      || !FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      fail(400, "INVALID_REQUEST", "Invalid request");
    }
    if (!new Set(["student", "teacher"]).has(actorRole)) {
      fail(403, "FORBIDDEN", "Forbidden");
    }

    const replayOrConflict = (recordInput) => {
      const record = toPlain(recordInput);
      if (Number(record.authorUserId) !== actorId || record.message !== message) {
        fail(409, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency key conflict");
      }
      return { changed: false, feedback: serializeFeedback(record) };
    };

    return database.transaction(async (transaction) => {
      const author = await models.User.findByPk(actorId, {
        attributes: ["id", "role", "status"],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!author
        || author.status !== "active"
        || !["student", "teacher"].includes(String(author.role).toLowerCase())) {
        fail(403, "FORBIDDEN", "Forbidden");
      }

      const existing = await findExisting({
        authorUserId: actorId,
        idempotencyKey,
        transaction,
      });
      if (existing) return replayOrConflict(existing);

      try {
        const created = await database.transaction({ transaction }, async (savepoint) => (
          models.PlatformFeedbackSubmission.create({
            authorUserId: actorId,
            message,
            idempotencyKey,
          }, { transaction: savepoint })
        ));
        return { changed: true, feedback: serializeFeedback(created) };
      } catch (error) {
        if (!isAuthorKeyUniqueError(error)) throw error;
        const concurrent = await findExisting({
          authorUserId: actorId,
          idempotencyKey,
          transaction,
        });
        if (!concurrent) throw error;
        return replayOrConflict(concurrent);
      }
    });
  };

  return { submitPlatformFeedback };
};

const service = createPlatformFeedbackService();

module.exports = {
  PlatformFeedbackError,
  createPlatformFeedbackService,
  submitPlatformFeedback: service.submitPlatformFeedback,
};
