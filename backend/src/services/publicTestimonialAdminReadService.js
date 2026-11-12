const defaultModels = require("../models");

class PublicTestimonialAdminReadError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "PublicTestimonialAdminReadError";
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => {
  throw new PublicTestimonialAdminReadError(status, code, message);
};

const FILTERS = new Set(["pending", "approved", "rejected", "revoked", "all"]);
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
  if (String(actorRole || "").toLowerCase() !== "admin") {
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

const createPublicTestimonialAdminReadService = ({ models = defaultModels } = {}) => {
  const requireActiveAdmin = async ({ actorId, actorRole }) => {
    validateActor({ actorId, actorRole });
    const administrator = await models.User.findByPk(actorId, {
      attributes: ["id", "role", "status"],
    });
    const plain = toPlain(administrator);
    if (!plain || plain.role !== "admin" || plain.status !== "active") {
      fail(403, "FORBIDDEN", "Forbidden");
    }
  };

  const authorAttributes = ["id", "firstName", "lastName", "username", "role", "status"];
  const revisionAttributes = [
    "id", "submissionId", "authorUserId", "revisionNumber", "isCurrent",
    "message", "attributionMode", "publicDisplayNameSnapshot", "consentVersion",
    "consentedAt", "moderationStatus", "moderationExplanation",
    "approvedByUserId", "approvedAt", "rejectedByUserId", "rejectedAt",
    "revokedByUserId", "revokedAt", "createdAt",
  ];
  const submissionAttributes = [
    "id", "authorUserId", "withdrawnAt", "publicationSuspendedAt",
    "publicationSuspensionReason", "createdAt",
  ];

  const listTestimonials = async ({ actorId, actorRole, status, page, limit, offset }) => {
    validatePagination({ page, limit, offset });
    if (!FILTERS.has(status)) fail(400, "INVALID_REQUEST", "Invalid request");
    await requireActiveAdmin({ actorId, actorRole });
    const actionable = status === "pending";
    const result = await models.PublicTestimonialRevision.findAndCountAll({
      where: {
        isCurrent: true,
        ...(status !== "all" ? { moderationStatus: status } : {}),
      },
      attributes: revisionAttributes,
      include: [{
        model: models.PublicTestimonialSubmission,
        as: "submission",
        attributes: submissionAttributes,
        required: true,
        ...(actionable ? { where: { withdrawnAt: null, publicationSuspendedAt: null } } : {}),
      }, {
        model: models.User,
        as: "author",
        attributes: authorAttributes,
        required: true,
        ...(actionable ? {
          where: { status: "active", role: ["student", "teacher"] },
        } : {}),
      }],
      distinct: true,
      order: [["createdAt", "DESC"], ["id", "DESC"]],
      limit,
      offset,
    });
    const total = normalizeCount(result.count);
    return {
      testimonials: result.rows.map((rowInput) => {
        const row = toPlain(rowInput);
        return serializeSubmission({
          submission: row.submission,
          author: row.author,
          currentRevision: row,
        });
      }),
      status,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  };

  const getTestimonial = async ({
    actorId,
    actorRole,
    submissionId,
    revisionPage,
    revisionLimit,
    revisionOffset,
  }) => {
    validatePagination({
      page: revisionPage,
      limit: revisionLimit,
      offset: revisionOffset,
    });
    validateActor({ actorId, actorRole });
    if (!Number.isSafeInteger(submissionId) || submissionId <= 0) {
      fail(400, "INVALID_REQUEST", "Invalid request");
    }
    await requireActiveAdmin({ actorId, actorRole });
    const submission = await models.PublicTestimonialSubmission.findOne({
      where: { id: submissionId },
      attributes: submissionAttributes,
      include: [{
        model: models.User,
        as: "author",
        attributes: authorAttributes,
        required: true,
      }, {
        model: models.PublicTestimonialRevision,
        as: "revisions",
        where: { isCurrent: true },
        attributes: revisionAttributes,
        required: true,
      }],
    });
    if (!submission) fail(404, "NOT_FOUND", "Testimonial not found");
    const plainSubmission = toPlain(submission);
    const history = await models.PublicTestimonialRevision.findAndCountAll({
      where: { submissionId, authorUserId: plainSubmission.authorUserId },
      attributes: revisionAttributes,
      order: [["revisionNumber", "DESC"], ["id", "DESC"]],
      limit: revisionLimit,
      offset: revisionOffset,
    });
    const revisionTotal = normalizeCount(history.count);
    return {
      testimonial: serializeSubmission({
        submission: plainSubmission,
        author: plainSubmission.author,
        currentRevision: plainSubmission.revisions?.[0] ?? null,
      }),
      revisions: history.rows.map(serializeRevision),
      revisionPage,
      revisionLimit,
      revisionTotal,
      revisionTotalPages: Math.max(1, Math.ceil(revisionTotal / revisionLimit)),
    };
  };

  return { listTestimonials, getTestimonial };
};

const service = createPublicTestimonialAdminReadService();

module.exports = {
  PublicTestimonialAdminReadError,
  createPublicTestimonialAdminReadService,
  ...service,
};
