const defaultModels = require("../models");

class PlatformFeedbackReadError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "PlatformFeedbackReadError";
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => {
  throw new PlatformFeedbackReadError(status, code, message);
};

const toPlain = (record) => (
  typeof record?.get === "function" ? record.get({ plain: true }) : record
);

const normalizeCount = (value) => {
  const numeric = typeof value === "bigint" ? value : BigInt(String(value ?? "0"));
  if (numeric < 0n || numeric > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Platform feedback count exceeds the supported range");
  }
  return Number(numeric);
};

const validatePagination = ({ actorId, page, limit, offset }) => {
  if (![actorId, page, limit].every(Number.isSafeInteger)
    || actorId <= 0
    || page <= 0
    || limit <= 0
    || limit > 100
    || !Number.isSafeInteger(offset)
    || offset < 0
    || offset !== (page - 1) * limit) {
    fail(400, "INVALID_REQUEST", "Invalid request");
  }
};

const serializeAuthorFeedback = (recordInput) => {
  const record = toPlain(recordInput);
  return {
    id: record.id,
    message: record.message,
    createdAt: record.createdAt,
  };
};

const serializeAdminFeedback = (recordInput) => {
  const record = toPlain(recordInput);
  return {
    id: record.id,
    message: record.message,
    createdAt: record.createdAt,
    author: record.author ? {
      id: record.author.id,
      firstName: record.author.firstName,
      lastName: record.author.lastName,
      username: record.author.username,
      role: record.author.role,
      status: record.author.status,
    } : null,
  };
};

const paginatedResult = ({ result, page, limit, serialize }) => {
  const total = normalizeCount(result.count);
  return {
    feedback: result.rows.map(serialize),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};

const createPlatformFeedbackReadService = ({ models = defaultModels } = {}) => {
  const listOwnPlatformFeedback = async ({ actorId, actorRole, page, limit, offset }) => {
    validatePagination({ actorId, page, limit, offset });
    if (!["student", "teacher"].includes(String(actorRole || "").toLowerCase())) {
      fail(403, "FORBIDDEN", "Forbidden");
    }
    const result = await models.PlatformFeedbackSubmission.findAndCountAll({
      where: { authorUserId: actorId },
      attributes: ["id", "message", "createdAt"],
      order: [["createdAt", "DESC"], ["id", "DESC"]],
      limit,
      offset,
    });
    return paginatedResult({ result, page, limit, serialize: serializeAuthorFeedback });
  };

  const listAdminPlatformFeedback = async ({ actorId, actorRole, page, limit, offset }) => {
    validatePagination({ actorId, page, limit, offset });
    if (String(actorRole || "").toLowerCase() !== "admin") {
      fail(403, "FORBIDDEN", "Forbidden");
    }
    const result = await models.PlatformFeedbackSubmission.findAndCountAll({
      attributes: ["id", "message", "createdAt"],
      include: [{
        model: models.User,
        as: "author",
        attributes: ["id", "firstName", "lastName", "username", "role", "status"],
        required: true,
      }],
      distinct: true,
      order: [["createdAt", "DESC"], ["id", "DESC"]],
      limit,
      offset,
    });
    return paginatedResult({ result, page, limit, serialize: serializeAdminFeedback });
  };

  return { listOwnPlatformFeedback, listAdminPlatformFeedback };
};

module.exports = {
  PlatformFeedbackReadError,
  createPlatformFeedbackReadService,
  ...createPlatformFeedbackReadService(),
};
