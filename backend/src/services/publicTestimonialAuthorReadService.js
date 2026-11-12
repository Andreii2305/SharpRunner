const defaultModels = require("../models");

class PublicTestimonialAuthorReadError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "PublicTestimonialAuthorReadError";
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => {
  throw new PublicTestimonialAuthorReadError(status, code, message);
};

const toPlain = (record) => (
  typeof record?.get === "function" ? record.get({ plain: true }) : record
);

const normalizeCount = (value) => {
  const numeric = typeof value === "bigint" ? value : BigInt(String(value ?? "0"));
  if (numeric < 0n || numeric > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Testimonial count exceeds the supported range");
  }
  return Number(numeric);
};

const validateActor = ({ actorId, actorRole }) => {
  if (!Number.isSafeInteger(actorId) || actorId <= 0) {
    fail(400, "INVALID_REQUEST", "Invalid request");
  }
  if (!["student", "teacher"].includes(String(actorRole || "").toLowerCase())) {
    fail(403, "FORBIDDEN", "Forbidden");
  }
};

const validatePagination = ({ page, limit, offset }) => {
  if (![page, limit, offset].every(Number.isSafeInteger)
    || page <= 0
    || limit <= 0
    || limit > 100
    || offset < 0
    || offset !== (page - 1) * limit) {
    fail(400, "INVALID_REQUEST", "Invalid request");
  }
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
    approvedAt: record.approvedAt ?? null,
    revokedAt: record.revokedAt ?? null,
    createdAt: record.createdAt,
  };
};

const currentFrom = (record) => {
  const revisions = record.revisions || [];
  return revisions[0] || null;
};

const serializeSubmission = (recordInput) => {
  const record = toPlain(recordInput);
  const current = currentFrom(record);
  return {
    id: record.id,
    withdrawnAt: record.withdrawnAt ?? null,
    publicationSuspendedAt: record.publicationSuspendedAt ?? null,
    createdAt: record.createdAt,
    currentRevision: current ? serializeRevision(current) : null,
  };
};

const createPublicTestimonialAuthorReadService = ({ models = defaultModels } = {}) => {
  const requireActiveAuthor = async ({ actorId, actorRole }) => {
    validateActor({ actorId, actorRole });
    const author = await models.User.findByPk(actorId, {
      attributes: ["id", "role", "status"],
    });
    const plain = toPlain(author);
    if (!plain
      || plain.status !== "active"
      || !["student", "teacher"].includes(String(plain.role).toLowerCase())) {
      fail(403, "FORBIDDEN", "Forbidden");
    }
  };

  const revisionAttributes = [
    "id", "revisionNumber", "message", "attributionMode",
    "publicDisplayNameSnapshot", "consentVersion", "consentedAt",
    "moderationStatus", "moderationExplanation", "approvedAt", "revokedAt", "createdAt",
  ];

  const currentRevisionInclude = () => ({
    model: models.PublicTestimonialRevision,
    as: "revisions",
    where: { isCurrent: true },
    attributes: revisionAttributes,
    required: true,
  });

  const listOwnTestimonials = async ({ actorId, actorRole, page, limit, offset }) => {
    validatePagination({ page, limit, offset });
    await requireActiveAuthor({ actorId, actorRole });
    const result = await models.PublicTestimonialSubmission.findAndCountAll({
      where: { authorUserId: actorId },
      attributes: ["id", "withdrawnAt", "publicationSuspendedAt", "createdAt"],
      include: [currentRevisionInclude()],
      distinct: true,
      order: [["createdAt", "DESC"], ["id", "DESC"]],
      limit,
      offset,
    });
    const total = normalizeCount(result.count);
    return {
      testimonials: result.rows.map(serializeSubmission),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  };

  const getOwnTestimonial = async ({
    actorId,
    actorRole,
    submissionId,
    revisionPage,
    revisionLimit,
    revisionOffset,
  }) => {
    validatePagination({ page: revisionPage, limit: revisionLimit, offset: revisionOffset });
    validateActor({ actorId, actorRole });
    if (!Number.isSafeInteger(submissionId) || submissionId <= 0) {
      fail(400, "INVALID_REQUEST", "Invalid request");
    }
    await requireActiveAuthor({ actorId, actorRole });
    const submission = await models.PublicTestimonialSubmission.findOne({
      where: { id: submissionId, authorUserId: actorId },
      attributes: ["id", "withdrawnAt", "publicationSuspendedAt", "createdAt"],
      include: [currentRevisionInclude()],
    });
    if (!submission) fail(404, "NOT_FOUND", "Testimonial not found");
    const history = await models.PublicTestimonialRevision.findAndCountAll({
      where: { submissionId, authorUserId: actorId },
      attributes: revisionAttributes,
      order: [["revisionNumber", "DESC"], ["id", "DESC"]],
      limit: revisionLimit,
      offset: revisionOffset,
    });
    const revisionTotal = normalizeCount(history.count);
    return {
      testimonial: serializeSubmission(submission),
      revisions: history.rows.map(serializeRevision),
      revisionPage,
      revisionLimit,
      revisionTotal,
      revisionTotalPages: Math.max(1, Math.ceil(revisionTotal / revisionLimit)),
    };
  };

  return { listOwnTestimonials, getOwnTestimonial };
};

module.exports = {
  PublicTestimonialAuthorReadError,
  createPublicTestimonialAuthorReadService,
  ...createPublicTestimonialAuthorReadService(),
};
