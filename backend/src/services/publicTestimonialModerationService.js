const { Op } = require("sequelize");
const sequelize = require("../config/database");
const defaultModels = require("../models");
const { logAdminActivity } = require("./adminActivityLogService");
const {
  FEEDBACK_TESTIMONIAL_LIMITS,
  normalizeFeedbackTestimonialText,
} = require("../constants/feedbackTestimonialConfig");

class PublicTestimonialModerationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "PublicTestimonialModerationError";
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => {
  throw new PublicTestimonialModerationError(status, code, message);
};

const toPlain = (record) => (
  typeof record?.get === "function" ? record.get({ plain: true }) : record
);
const isPositiveId = (value) => Number.isSafeInteger(value) && value > 0;

const serializeAuthor = (recordInput) => {
  const record = toPlain(recordInput);
  return {
    id: record.id,
    firstName: record.firstName,
    lastName: record.lastName,
    username: record.username,
    role: record.role,
    status: record.status,
  };
};

const serializeRevision = (recordInput) => {
  const record = toPlain(recordInput);
  return {
    id: record.id,
    revisionNumber: record.revisionNumber,
    message: record.message,
    attributionMode: record.attributionMode,
    publicDisplayName: record.publicDisplayNameSnapshot ?? null,
    consentVersion: record.consentVersion,
    consentedAt: record.consentedAt,
    moderationStatus: record.moderationStatus,
    moderationExplanation: record.moderationExplanation ?? null,
    approvedByUserId: record.approvedByUserId ?? null,
    approvedAt: record.approvedAt ?? null,
    rejectedByUserId: record.rejectedByUserId ?? null,
    rejectedAt: record.rejectedAt ?? null,
    revokedByUserId: record.revokedByUserId ?? null,
    revokedAt: record.revokedAt ?? null,
    createdAt: record.createdAt,
  };
};

const serializeSubmission = ({ submission, author, currentRevision }) => {
  const record = toPlain(submission);
  return {
    id: record.id,
    withdrawnAt: record.withdrawnAt ?? null,
    publicationSuspendedAt: record.publicationSuspendedAt ?? null,
    publicationSuspensionReason: record.publicationSuspensionReason ?? null,
    createdAt: record.createdAt,
    author: serializeAuthor(author),
    currentRevision: currentRevision ? serializeRevision(currentRevision) : null,
  };
};

const createPublicTestimonialModerationService = ({
  sequelize: database = sequelize,
  models = defaultModels,
  auditLogger = logAdminActivity,
  now = () => new Date(),
} = {}) => {
  const validateInput = ({ actorId, actorRole, submissionId, revisionId }) => {
    if (![actorId, submissionId, revisionId].every(isPositiveId)) {
      fail(400, "INVALID_REQUEST", "Invalid request");
    }
    if (String(actorRole || "").toLowerCase() !== "admin") {
      fail(403, "FORBIDDEN", "Forbidden");
    }
  };

  const normalizeExplanation = (value) => {
    const explanation = normalizeFeedbackTestimonialText(value);
    if (typeof explanation !== "string"
      || [...explanation].length < 1
      || [...explanation].length > FEEDBACK_TESTIMONIAL_LIMITS.moderationExplanationLength) {
      fail(400, "INVALID_REQUEST", "Invalid request");
    }
    return explanation;
  };

  const decisionMatches = ({ action, revision, actorId, explanation }) => {
    const record = toPlain(revision);
    if (action === "approve") {
      return ["approved", "revoked"].includes(record.moderationStatus)
        && record.approvedByUserId === actorId
        && record.approvedAt != null;
    }
    if (action === "reject") {
      return record.moderationStatus === "rejected"
        && record.rejectedByUserId === actorId
        && record.moderationExplanation === explanation;
    }
    return record.moderationStatus === "revoked"
      && record.revokedByUserId === actorId
      && record.moderationExplanation === explanation;
  };

  const decisionValues = ({ action, actorId, explanation, timestamp }) => {
    if (action === "approve") {
      return {
        moderationStatus: "approved",
        approvedByUserId: actorId,
        approvedAt: timestamp,
      };
    }
    if (action === "reject") {
      return {
        moderationStatus: "rejected",
        moderationExplanation: explanation,
        rejectedByUserId: actorId,
        rejectedAt: timestamp,
      };
    }
    return {
      moderationStatus: "revoked",
      moderationExplanation: explanation,
      revokedByUserId: actorId,
      revokedAt: timestamp,
    };
  };

  const moderate = async ({
    action,
    actorId,
    actorRole,
    submissionId,
    revisionId,
    explanation: explanationInput,
  }) => {
    validateInput({ actorId, actorRole, submissionId, revisionId });
    const explanation = action === "approve"
      ? null
      : normalizeExplanation(explanationInput);

    const operation = await database.transaction(async (transaction) => {
      const scope = await models.PublicTestimonialSubmission.findByPk(submissionId, {
        attributes: ["id", "authorUserId"],
        transaction,
      });
      const scopePlain = toPlain(scope);
      if (!scopePlain) fail(404, "NOT_FOUND", "Testimonial not found");

      const userIds = [...new Set([actorId, scopePlain.authorUserId])].sort((a, b) => a - b);
      const lockedUsers = await models.User.findAll({
        where: { id: userIds },
        attributes: ["id", "firstName", "lastName", "username", "role", "status"],
        order: [["id", "ASC"]],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const usersById = new Map(lockedUsers.map((user) => [toPlain(user).id, user]));
      const administrator = usersById.get(actorId);
      const author = usersById.get(scopePlain.authorUserId);
      const adminPlain = toPlain(administrator);
      if (!adminPlain || adminPlain.role !== "admin" || adminPlain.status !== "active") {
        fail(403, "FORBIDDEN", "Forbidden");
      }
      if (!author) fail(409, "TESTIMONIAL_NOT_MODERATABLE", "Testimonial is unavailable");

      const submission = await models.PublicTestimonialSubmission.findOne({
        where: { id: submissionId, authorUserId: scopePlain.authorUserId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!submission) fail(404, "NOT_FOUND", "Testimonial not found");

      const lockedRevisions = await models.PublicTestimonialRevision.findAll({
        where: {
          submissionId,
          authorUserId: scopePlain.authorUserId,
          [Op.or]: [{ id: revisionId }, { isCurrent: true }],
        },
        order: [["id", "ASC"]],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const requested = lockedRevisions.find((row) => toPlain(row).id === revisionId);
      const current = lockedRevisions.find((row) => toPlain(row).isCurrent);
      if (!requested) fail(404, "NOT_FOUND", "Testimonial revision not found");

      if (decisionMatches({ action, revision: requested, actorId, explanation })) {
        return {
          changed: false,
          author,
          submission,
          currentRevision: current,
          revision: requested,
        };
      }

      const requestedPlain = toPlain(requested);
      if (requestedPlain.moderationStatus !== "pending"
        && !(action === "revoke" && requestedPlain.moderationStatus === "approved")) {
        fail(409, "MODERATION_CONFLICT", "Moderation decision conflict");
      }
      if (!requestedPlain.isCurrent || toPlain(current)?.id !== revisionId) {
        fail(409, "REVISION_CHANGED", "Testimonial revision has changed");
      }
      const submissionPlain = toPlain(submission);
      const authorPlain = toPlain(author);
      if (submissionPlain.withdrawnAt
        || submissionPlain.publicationSuspendedAt
        || authorPlain.status !== "active"
        || !["student", "teacher"].includes(authorPlain.role)) {
        fail(409, "TESTIMONIAL_NOT_MODERATABLE", "Testimonial is unavailable");
      }
      if ((action === "approve" || action === "reject")
        && requestedPlain.moderationStatus !== "pending") {
        fail(409, "MODERATION_CONFLICT", "Moderation decision conflict");
      }
      if (action === "revoke" && requestedPlain.moderationStatus !== "approved") {
        fail(409, "MODERATION_CONFLICT", "Moderation decision conflict");
      }

      const updated = await requested.update(decisionValues({
        action,
        actorId,
        explanation,
        timestamp: now(),
      }), { transaction });
      return {
        changed: true,
        author,
        submission,
        currentRevision: updated,
        revision: updated,
      };
    });

    const result = {
      changed: operation.changed,
      testimonial: serializeSubmission(operation),
      revision: serializeRevision(operation.revision),
    };
    if (operation.changed) {
      try {
        await auditLogger({
          actorUserId: actorId,
          role: "admin",
          targetUserId: toPlain(operation.author).id,
          activity: `TESTIMONIAL_${action.toUpperCase()}${action === "approve" ? "D" : action === "reject" ? "ED" : "D"}`,
          details: `submissionId=${submissionId}; revisionId=${revisionId}`,
        });
      } catch {
        console.error("Failed to write testimonial moderation audit");
      }
    }
    return result;
  };

  return {
    approve: (input) => moderate({ ...input, action: "approve" }),
    reject: (input) => moderate({ ...input, action: "reject" }),
    revoke: (input) => moderate({ ...input, action: "revoke" }),
  };
};

const service = createPublicTestimonialModerationService();

module.exports = {
  PublicTestimonialModerationError,
  createPublicTestimonialModerationService,
  ...service,
};
