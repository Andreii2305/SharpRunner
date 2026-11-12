const crypto = require("node:crypto");
const sequelize = require("../config/database");
const defaultModels = require("../models");
const {
  FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN,
  FEEDBACK_TESTIMONIAL_CONSENT_BINDING_PATTERN,
  FEEDBACK_TESTIMONIAL_LIMITS,
  normalizeFeedbackTestimonialText,
  TESTIMONIAL_ATTRIBUTION_MODES,
} = require("../constants/feedbackTestimonialConfig");

const AUTHOR_ROLES = new Set(["student", "teacher"]);
const PREVIEW_DERIVATION_VERSION = "public-name-v1";
const CONSENT_BINDING_DERIVATION_VERSION = "testimonial-consent-v1";

class PublicTestimonialAuthorError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "PublicTestimonialAuthorError";
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => {
  throw new PublicTestimonialAuthorError(status, code, message);
};

const toPlain = (record) => (
  typeof record?.get === "function" ? record.get({ plain: true }) : record
);

const normalizedRole = (value) => String(value || "").trim().toLowerCase();
const isPositiveId = (value) => Number.isSafeInteger(value) && value > 0;
const codePointLength = (value) => [...value].length;

const derivePublicName = ({ firstName, lastName }) => {
  const normalizedFirstName = typeof firstName === "string" ? firstName.trim() : "";
  const normalizedLastName = typeof lastName === "string" ? lastName.trim() : "";
  if (!normalizedFirstName) return null;
  const initial = Array.from(normalizedLastName)[0]?.toLocaleUpperCase("en-US") || "";
  const displayName = initial ? `${normalizedFirstName} ${initial}.` : normalizedFirstName;
  if (codePointLength(displayName) > FEEDBACK_TESTIMONIAL_LIMITS.publicDisplayNameLength) {
    return null;
  }
  return { normalizedFirstName, normalizedLastName, displayName };
};

const safeEqual = (provided, expected) => {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  const left = Buffer.from(provided, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const createTestimonialConsentConfiguration = ({
  consentVersion,
  consentText,
  previewSecret,
} = {}) => {
  const version = typeof consentVersion === "string" ? consentVersion.trim() : "";
  const disclosure = typeof consentText === "string" ? consentText : "";
  const secret = typeof previewSecret === "string" ? previewSecret : "";
  if (!version
    || codePointLength(version) > FEEDBACK_TESTIMONIAL_LIMITS.consentVersionLength
    || !disclosure
    || disclosure !== normalizeFeedbackTestimonialText(disclosure)
    || disclosure.includes("\u0000")
    || Buffer.from(disclosure, "utf8").toString("utf8") !== disclosure
    || codePointLength(disclosure) > FEEDBACK_TESTIMONIAL_LIMITS.consentTextLength
    || secret.length < 16) {
    return null;
  }

  // A consent version identifies exactly one disclosure. Changing the text
  // requires a new version; the binding additionally rejects stale options if
  // an operator accidentally reuses a version for different text.
  const consentBinding = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify([
      CONSENT_BINDING_DERIVATION_VERSION,
      version,
      disclosure,
    ]), "utf8")
    .digest("base64url");

  const getOptions = ({ userId, firstName, lastName }) => {
    if (!isPositiveId(userId)) fail(400, "INVALID_REQUEST", "Invalid request");
    const name = derivePublicName({ firstName, lastName });
    if (!name) {
      fail(409, "PUBLIC_NAME_UNAVAILABLE", "A public name preview is unavailable");
    }
    const material = JSON.stringify([
      PREVIEW_DERIVATION_VERSION,
      userId,
      name.normalizedFirstName,
      name.normalizedLastName,
      name.displayName,
      version,
      consentBinding,
    ]);
    const publicNamePreviewVersion = crypto
      .createHmac("sha256", secret)
      .update(material, "utf8")
      .digest("base64url");
    return {
      consentVersion: version,
      consentText: disclosure,
      consentBinding,
      namedDisplayPreview: name.displayName,
      publicNamePreviewVersion,
    };
  };

  const matchesPreview = safeEqual;
  const matchesConsentBinding = (provided) => safeEqual(provided, consentBinding);

  return {
    consentVersion: version,
    consentText: disclosure,
    consentBinding,
    getOptions,
    matchesPreview,
    matchesConsentBinding,
  };
};

const defaultConsentConfiguration = () => createTestimonialConsentConfiguration({
  consentVersion: process.env.PUBLIC_TESTIMONIAL_CONSENT_VERSION,
  consentText: process.env.PUBLIC_TESTIMONIAL_CONSENT_TEXT,
  previewSecret: process.env.PUBLIC_TESTIMONIAL_NAME_PREVIEW_SECRET,
});

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

const serializeSubmission = (submissionInput, currentRevisionInput) => {
  const submission = toPlain(submissionInput);
  return {
    id: submission.id,
    withdrawnAt: submission.withdrawnAt ?? null,
    publicationSuspendedAt: submission.publicationSuspendedAt ?? null,
    createdAt: submission.createdAt,
    currentRevision: currentRevisionInput ? serializeRevision(currentRevisionInput) : null,
  };
};

const isRevisionKeyUniqueError = (error) => {
  if (error?.name !== "SequelizeUniqueConstraintError") return false;
  const namedEvidence = [
    error.constraint,
    error.parent?.constraint,
    error.original?.constraint,
    error.index,
    ...(error.errors || []).map((item) => item.constraint),
  ].filter(Boolean).join(" ").toLowerCase();
  if (namedEvidence) {
    return namedEvidence.includes("public_testimonial_revisions_author_key")
      || namedEvidence.includes("public_testimonial_submissions_author_key");
  }
  const fieldEvidence = [
    ...Object.keys(error.fields || {}),
    ...(error.errors || []).map((item) => item.path),
  ].filter(Boolean).join(" ").toLowerCase();
  return fieldEvidence.includes("authoruserid")
    && fieldEvidence.includes("idempotencykey");
};

const createPublicTestimonialAuthorService = ({
  sequelize: database = sequelize,
  models = defaultModels,
  consentConfiguration,
  now = () => new Date(),
} = {}) => {
  const resolveConsentConfiguration = () => (
    consentConfiguration === undefined ? defaultConsentConfiguration() : consentConfiguration
  );

  const requireConsentConfiguration = () => {
    const configuration = resolveConsentConfiguration();
    if (!configuration) {
      fail(503, "TESTIMONIAL_CONSENT_UNAVAILABLE", "Testimonial consent is unavailable");
    }
    return configuration;
  };

  const validateActorInput = ({ actorId, actorRole }) => {
    if (!isPositiveId(actorId)) fail(400, "INVALID_REQUEST", "Invalid request");
    if (!AUTHOR_ROLES.has(normalizedRole(actorRole))) fail(403, "FORBIDDEN", "Forbidden");
  };

  const lockActiveAuthor = async ({ actorId, transaction }) => {
    const author = await models.User.findByPk(actorId, {
      attributes: ["id", "firstName", "lastName", "role", "status"],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const plain = toPlain(author);
    if (!plain || plain.status !== "active" || !AUTHOR_ROLES.has(normalizedRole(plain.role))) {
      fail(403, "FORBIDDEN", "Forbidden");
    }
    return author;
  };

  const normalizeOperation = ({
    message: messageInput,
    attributionMode,
    consent,
    consentVersion,
    consentBinding,
    publicNamePreviewVersion,
    idempotencyKey,
    baseRevisionId,
    requireBase,
  }) => {
    const message = normalizeFeedbackTestimonialText(messageInput);
    const named = attributionMode === "named";
    const anonymous = attributionMode === "anonymous";
    if (typeof message !== "string"
      || codePointLength(message) < 1
      || codePointLength(message) > FEEDBACK_TESTIMONIAL_LIMITS.messageLength
      || !TESTIMONIAL_ATTRIBUTION_MODES.includes(attributionMode)
      || consent !== true
      || typeof consentVersion !== "string"
      || !consentVersion
      || codePointLength(consentVersion) > FEEDBACK_TESTIMONIAL_LIMITS.consentVersionLength
      || typeof consentBinding !== "string"
      || !FEEDBACK_TESTIMONIAL_CONSENT_BINDING_PATTERN.test(consentBinding)
      || !FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey || "")
      || (named && (typeof publicNamePreviewVersion !== "string"
        || !publicNamePreviewVersion
        || codePointLength(publicNamePreviewVersion)
          > FEEDBACK_TESTIMONIAL_LIMITS.publicNamePreviewVersionLength))
      || (anonymous && publicNamePreviewVersion !== undefined)
      || (requireBase && !isPositiveId(baseRevisionId))) {
      fail(400, "INVALID_REQUEST", "Invalid request");
    }
    return {
      message,
      attributionMode,
      consentVersion,
      consentBinding,
      publicNamePreviewVersion: named ? publicNamePreviewVersion : null,
      idempotencyKey,
      ...(requireBase ? { baseRevisionId } : {}),
    };
  };

  const validateConsent = ({ operation, author, configuration }) => {
    if (operation.consentVersion !== configuration.consentVersion
      || !configuration.matchesConsentBinding(operation.consentBinding)) {
      fail(409, "CONSENT_VERSION_STALE", "Testimonial consent has changed");
    }
    if (operation.attributionMode === "anonymous") {
      return { publicDisplayNameSnapshot: null, publicNamePreviewVersion: null };
    }
    const plainAuthor = toPlain(author);
    const options = configuration.getOptions({
      userId: plainAuthor.id,
      firstName: plainAuthor.firstName,
      lastName: plainAuthor.lastName,
    });
    if (!configuration.matchesPreview(
      operation.publicNamePreviewVersion,
      options.publicNamePreviewVersion,
    )) {
      fail(409, "PUBLIC_NAME_PREVIEW_STALE", "Public name preview has changed");
    }
    return {
      publicDisplayNameSnapshot: options.namedDisplayPreview,
      publicNamePreviewVersion: options.publicNamePreviewVersion,
    };
  };

  const findOperation = ({ actorId, idempotencyKey, transaction, lock = true }) => (
    models.PublicTestimonialRevision.findOne({
      where: { authorUserId: actorId, idempotencyKey },
      transaction,
      ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    })
  );

  const lockSubmission = ({ submissionId, actorId, transaction }) => (
    models.PublicTestimonialSubmission.findOne({
      where: { id: submissionId, authorUserId: actorId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    })
  );

  const lockCurrentRevision = ({ submissionId, transaction }) => (
    models.PublicTestimonialRevision.findOne({
      where: { submissionId, isCurrent: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    })
  );

  const originalBaseId = async ({ revision, transaction }) => {
    const plain = toPlain(revision);
    if (plain.revisionNumber <= 1) return null;
    const base = await models.PublicTestimonialRevision.findOne({
      where: { submissionId: plain.submissionId, revisionNumber: plain.revisionNumber - 1 },
      attributes: ["id"],
      transaction,
    });
    return toPlain(base)?.id ?? null;
  };

  const operationMatches = async ({ revision, operation, submissionId, transaction }) => {
    const stored = toPlain(revision);
    if (stored.submissionId !== submissionId
      || stored.message !== operation.message
      || stored.attributionMode !== operation.attributionMode
      || stored.consentVersion !== operation.consentVersion
      || (stored.publicNamePreviewVersion ?? null) !== operation.publicNamePreviewVersion) {
      return false;
    }
    if (operation.baseRevisionId !== undefined) {
      return (await originalBaseId({ revision, transaction })) === operation.baseRevisionId;
    }
    return stored.revisionNumber === 1;
  };

  const resultForOperation = async ({ changed, revision, submission, transaction }) => {
    const current = await lockCurrentRevision({ submissionId: toPlain(submission).id, transaction });
    return {
      changed,
      testimonial: serializeSubmission(submission, current),
      revision: serializeRevision(revision),
    };
  };

  const getOptions = async ({ actorId, actorRole }) => {
    validateActorInput({ actorId, actorRole });
    const configuration = requireConsentConfiguration();
    const author = await models.User.findByPk(actorId, {
      attributes: ["id", "firstName", "lastName", "role", "status"],
    });
    const plain = toPlain(author);
    if (!plain || plain.status !== "active" || !AUTHOR_ROLES.has(normalizedRole(plain.role))) {
      fail(403, "FORBIDDEN", "Forbidden");
    }
    return configuration.getOptions({
      userId: plain.id,
      firstName: plain.firstName,
      lastName: plain.lastName,
    });
  };

  const createTestimonial = async (input) => {
    validateActorInput(input);
    const operation = normalizeOperation({ ...input, requireBase: false });
    return database.transaction(async (transaction) => {
      const author = await lockActiveAuthor({ actorId: input.actorId, transaction });
      const existingCandidate = await findOperation({
        actorId: input.actorId,
        idempotencyKey: operation.idempotencyKey,
        transaction,
        lock: false,
      });
      if (existingCandidate) {
        const stored = toPlain(existingCandidate);
        const submission = await lockSubmission({
          submissionId: stored.submissionId,
          actorId: input.actorId,
          transaction,
        });
        const existing = await findOperation({
          actorId: input.actorId,
          idempotencyKey: operation.idempotencyKey,
          transaction,
        });
        if (!submission || !existing
          || !(await operationMatches({
            revision: existing,
            operation,
            submissionId: stored.submissionId,
            transaction,
          }))) {
          fail(409, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency key conflict");
        }
        return resultForOperation({ changed: false, revision: existing, submission, transaction });
      }

      const configuration = requireConsentConfiguration();
      const attribution = validateConsent({ operation, author, configuration });
      try {
        const created = await database.transaction({ transaction }, async (savepoint) => {
          const submission = await models.PublicTestimonialSubmission.create({
            authorUserId: input.actorId,
            idempotencyKey: operation.idempotencyKey,
          }, { transaction: savepoint });
          const submissionId = toPlain(submission).id;
          const revision = await models.PublicTestimonialRevision.create({
            submissionId,
            authorUserId: input.actorId,
            revisionNumber: 1,
            isCurrent: true,
            message: operation.message,
            attributionMode: operation.attributionMode,
            ...attribution,
            consentVersion: operation.consentVersion,
            consentedAt: now(),
            idempotencyKey: operation.idempotencyKey,
            moderationStatus: "pending",
          }, { transaction: savepoint });
          return { submission, revision };
        });
        return {
          changed: true,
          testimonial: serializeSubmission(created.submission, created.revision),
          revision: serializeRevision(created.revision),
        };
      } catch (error) {
        if (!isRevisionKeyUniqueError(error)) throw error;
        const concurrentCandidate = await findOperation({
          actorId: input.actorId,
          idempotencyKey: operation.idempotencyKey,
          transaction,
          lock: false,
        });
        if (!concurrentCandidate) throw error;
        const stored = toPlain(concurrentCandidate);
        const submission = await lockSubmission({
          submissionId: stored.submissionId,
          actorId: input.actorId,
          transaction,
        });
        const concurrent = await findOperation({
          actorId: input.actorId,
          idempotencyKey: operation.idempotencyKey,
          transaction,
        });
        if (!submission || !concurrent || !(await operationMatches({
          revision: concurrent,
          operation,
          submissionId: stored.submissionId,
          transaction,
        }))) {
          fail(409, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency key conflict");
        }
        return resultForOperation({
          changed: false,
          revision: concurrent,
          submission,
          transaction,
        });
      }
    });
  };

  const createRevision = async (input) => {
    validateActorInput(input);
    if (!isPositiveId(input.submissionId)) fail(400, "INVALID_REQUEST", "Invalid request");
    const operation = normalizeOperation({ ...input, requireBase: true });
    return database.transaction(async (transaction) => {
      const author = await lockActiveAuthor({ actorId: input.actorId, transaction });
      const submission = await lockSubmission({
        submissionId: input.submissionId,
        actorId: input.actorId,
        transaction,
      });
      if (!submission) fail(404, "NOT_FOUND", "Testimonial not found");

      const existing = await findOperation({
        actorId: input.actorId,
        idempotencyKey: operation.idempotencyKey,
        transaction,
      });
      if (existing) {
        if (!(await operationMatches({
          revision: existing,
          operation,
          submissionId: input.submissionId,
          transaction,
        }))) {
          fail(409, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency key conflict");
        }
        return resultForOperation({ changed: false, revision: existing, submission, transaction });
      }

      const submissionPlain = toPlain(submission);
      if (submissionPlain.withdrawnAt) {
        fail(409, "TESTIMONIAL_WITHDRAWN", "Testimonial has been withdrawn");
      }
      if (submissionPlain.publicationSuspendedAt
        && submissionPlain.publicationSuspensionReason !== "account_deactivated") {
        fail(409, "TESTIMONIAL_NOT_MODERATABLE", "Testimonial is unavailable");
      }
      const current = await lockCurrentRevision({
        submissionId: input.submissionId,
        transaction,
      });
      const currentPlain = toPlain(current);
      if (!currentPlain || currentPlain.id !== operation.baseRevisionId) {
        fail(409, "REVISION_CHANGED", "Testimonial revision has changed");
      }
      const configuration = requireConsentConfiguration();
      const attribution = validateConsent({ operation, author, configuration });

      try {
        const revision = await database.transaction({ transaction }, async (savepoint) => {
          await current.update({ isCurrent: false }, { transaction: savepoint });
          const created = await models.PublicTestimonialRevision.create({
            submissionId: input.submissionId,
            authorUserId: input.actorId,
            revisionNumber: currentPlain.revisionNumber + 1,
            isCurrent: true,
            message: operation.message,
            attributionMode: operation.attributionMode,
            ...attribution,
            consentVersion: operation.consentVersion,
            consentedAt: now(),
            idempotencyKey: operation.idempotencyKey,
            moderationStatus: "pending",
          }, { transaction: savepoint });
          if (submissionPlain.publicationSuspendedAt) {
            await submission.update({
              publicationSuspendedAt: null,
              publicationSuspensionReason: null,
            }, { transaction: savepoint });
          }
          return created;
        });
        return {
          changed: true,
          testimonial: serializeSubmission(submission, revision),
          revision: serializeRevision(revision),
        };
      } catch (error) {
        if (!isRevisionKeyUniqueError(error)) throw error;
        const concurrent = await findOperation({
          actorId: input.actorId,
          idempotencyKey: operation.idempotencyKey,
          transaction,
        });
        if (!concurrent || !(await operationMatches({
          revision: concurrent,
          operation,
          submissionId: input.submissionId,
          transaction,
        }))) {
          fail(409, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency key conflict");
        }
        return resultForOperation({
          changed: false,
          revision: concurrent,
          submission,
          transaction,
        });
      }
    });
  };

  const withdrawTestimonial = async ({ actorId, actorRole, submissionId }) => {
    validateActorInput({ actorId, actorRole });
    if (!isPositiveId(submissionId)) fail(400, "INVALID_REQUEST", "Invalid request");
    return database.transaction(async (transaction) => {
      await lockActiveAuthor({ actorId, transaction });
      const submission = await lockSubmission({ submissionId, actorId, transaction });
      if (!submission) fail(404, "NOT_FOUND", "Testimonial not found");
      const current = await lockCurrentRevision({ submissionId, transaction });
      if (!current) fail(409, "TESTIMONIAL_NOT_MODERATABLE", "Testimonial is unavailable");
      if (toPlain(submission).withdrawnAt) {
        return {
          changed: false,
          testimonial: serializeSubmission(submission, current),
        };
      }
      await submission.update({ withdrawnAt: now() }, { transaction });
      return {
        changed: true,
        testimonial: serializeSubmission(submission, current),
      };
    });
  };

  return { getOptions, createTestimonial, createRevision, withdrawTestimonial };
};

const service = createPublicTestimonialAuthorService();

module.exports = {
  PublicTestimonialAuthorError,
  createPublicTestimonialAuthorService,
  createTestimonialConsentConfiguration,
  ...service,
};
