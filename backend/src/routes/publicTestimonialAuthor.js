const express = require("express");
const { createRateLimit } = require("../middleware/rateLimit");
const authorService = require("../services/publicTestimonialAuthorService");
const readService = require("../services/publicTestimonialAuthorReadService");
const {
  FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN,
} = require("../constants/feedbackTestimonialConfig");

const invalidRequest = () => new authorService.PublicTestimonialAuthorError(
  400,
  "INVALID_REQUEST",
  "Invalid request",
);

const setPrivateNoStore = (_req, res, next) => {
  res.set("Cache-Control", "private, no-store, max-age=0");
  next();
};

const exactObject = (value, allowed, required = allowed) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key))
    && required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
};

const validateBodyPresence = (req) => {
  if (req.body === undefined
    && (Number(req.headers["content-length"] || 0) > 0 || req.headers["transfer-encoding"])) {
    throw invalidRequest();
  }
};

const validateOperationBody = (req, { revision = false } = {}) => {
  validateBodyPresence(req);
  const common = [
    "message", "attributionMode", "consent", "consentVersion", "consentBinding",
  ];
  const required = revision ? ["baseRevisionId", ...common] : common;
  const allowed = [...required, "publicNamePreviewVersion"];
  if (!exactObject(req.body, allowed, required) || Object.keys(req.query).length !== 0) {
    throw invalidRequest();
  }
  if (req.body.attributionMode === "named"
    && !Object.prototype.hasOwnProperty.call(req.body, "publicNamePreviewVersion")) {
    throw invalidRequest();
  }
  if (req.body.attributionMode === "anonymous"
    && Object.prototype.hasOwnProperty.call(req.body, "publicNamePreviewVersion")) {
    throw invalidRequest();
  }
  return req.body;
};

const readIdempotencyKey = (req) => {
  let count = 0;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index].toLowerCase() === "idempotency-key") count += 1;
  }
  const key = req.headers["idempotency-key"];
  if (count !== 1
    || typeof key !== "string"
    || !FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw invalidRequest();
  }
  return key;
};

const parsePositive = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
};

const parseId = (value) => {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const parsePagination = (query, {
  pageName = "page",
  limitName = "limit",
  allowed = [pageName, limitName],
} = {}) => {
  if (Object.keys(query).some((key) => !allowed.includes(key))) return null;
  const page = parsePositive(query[pageName], 1);
  const limit = parsePositive(query[limitName], 20, 100);
  if (!page || !limit) return null;
  const offset = (page - 1) * limit;
  return Number.isSafeInteger(offset) ? { page, limit, offset } : null;
};

const handleKnownError = (error, res) => {
  if (error instanceof authorService.PublicTestimonialAuthorError
    || error instanceof readService.PublicTestimonialAuthorReadError) {
    res.status(error.status).json({ code: error.code, message: error.message });
    return true;
  }
  return false;
};

const serializeRevision = (revision) => ({
  id: revision.id,
  revisionNumber: revision.revisionNumber,
  message: revision.message,
  attributionMode: revision.attributionMode,
  publicDisplayName: revision.publicDisplayName ?? null,
  consentVersion: revision.consentVersion,
  consentedAt: revision.consentedAt,
  moderationStatus: revision.moderationStatus,
  moderationExplanation: revision.moderationExplanation ?? null,
  approvedAt: revision.approvedAt ?? null,
  revokedAt: revision.revokedAt ?? null,
  createdAt: revision.createdAt,
});

const serializeTestimonial = (testimonial) => ({
  id: testimonial.id,
  withdrawnAt: testimonial.withdrawnAt ?? null,
  publicationSuspendedAt: testimonial.publicationSuspendedAt ?? null,
  createdAt: testimonial.createdAt,
  currentRevision: testimonial.currentRevision
    ? serializeRevision(testimonial.currentRevision)
    : null,
});

const serializeOperation = (result) => ({
  changed: result.changed,
  testimonial: serializeTestimonial(result.testimonial),
  revision: serializeRevision(result.revision),
});

const createPublicTestimonialAuthorRouter = ({
  service = authorService,
  historyService = readService,
} = {}) => {
  const router = express.Router();
  router.use(setPrivateNoStore);
  const mutationRateLimit = createRateLimit({
    windowMs: 60_000,
    max: 10,
    keyGenerator: (req) => `public-testimonial:${req.userId}`,
    code: "TESTIMONIAL_RATE_LIMITED",
    message: "Testimonial submission is temporarily rate limited. Please try again shortly.",
  });

  router.get("/testimonials/options", async (req, res) => {
    if (Object.keys(req.query).length !== 0) {
      return res.status(400).json({ code: "INVALID_REQUEST", message: "Invalid request" });
    }
    try {
      const result = await service.getOptions({ actorId: req.userId, actorRole: req.userRole });
      return res.json({
        consentVersion: result.consentVersion,
        consentText: result.consentText,
        consentBinding: result.consentBinding,
        namedDisplayPreview: result.namedDisplayPreview,
        publicNamePreviewVersion: result.publicNamePreviewVersion,
      });
    } catch (error) {
      if (handleKnownError(error, res)) return undefined;
      console.error("Testimonial options request failed");
      return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
    }
  });

  router.post("/testimonials", mutationRateLimit, async (req, res) => {
    try {
      const body = validateOperationBody(req);
      const result = await service.createTestimonial({
        actorId: req.userId,
        actorRole: req.userRole,
        ...body,
        idempotencyKey: readIdempotencyKey(req),
      });
      return res.status(result.changed ? 201 : 200).json(serializeOperation(result));
    } catch (error) {
      if (handleKnownError(error, res)) return undefined;
      console.error("Testimonial creation failed");
      return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
    }
  });

  router.get("/testimonials/me", async (req, res) => {
    const pagination = parsePagination(req.query);
    if (!pagination) {
      return res.status(400).json({ code: "INVALID_REQUEST", message: "Invalid request" });
    }
    try {
      const result = await historyService.listOwnTestimonials({
        actorId: req.userId,
        actorRole: req.userRole,
        ...pagination,
      });
      return res.json({
        testimonials: result.testimonials.map(serializeTestimonial),
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      });
    } catch (error) {
      if (handleKnownError(error, res)) return undefined;
      console.error("Testimonial author listing failed");
      return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
    }
  });

  router.get("/testimonials/:submissionId", async (req, res) => {
    const submissionId = parseId(req.params.submissionId);
    const pagination = parsePagination(req.query, {
      pageName: "revisionPage",
      limitName: "revisionLimit",
    });
    if (!submissionId || !pagination) {
      return res.status(400).json({ code: "INVALID_REQUEST", message: "Invalid request" });
    }
    try {
      const result = await historyService.getOwnTestimonial({
        actorId: req.userId,
        actorRole: req.userRole,
        submissionId,
        revisionPage: pagination.page,
        revisionLimit: pagination.limit,
        revisionOffset: pagination.offset,
      });
      return res.json({
        testimonial: serializeTestimonial(result.testimonial),
        revisions: result.revisions.map(serializeRevision),
        revisionPage: result.revisionPage,
        revisionLimit: result.revisionLimit,
        revisionTotal: result.revisionTotal,
        revisionTotalPages: result.revisionTotalPages,
      });
    } catch (error) {
      if (handleKnownError(error, res)) return undefined;
      console.error("Testimonial author detail failed");
      return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
    }
  });

  router.post("/testimonials/:submissionId/revisions", mutationRateLimit, async (req, res) => {
    const submissionId = parseId(req.params.submissionId);
    if (!submissionId) {
      return res.status(400).json({ code: "INVALID_REQUEST", message: "Invalid request" });
    }
    try {
      const body = validateOperationBody(req, { revision: true });
      const result = await service.createRevision({
        actorId: req.userId,
        actorRole: req.userRole,
        submissionId,
        ...body,
        idempotencyKey: readIdempotencyKey(req),
      });
      return res.status(result.changed ? 201 : 200).json(serializeOperation(result));
    } catch (error) {
      if (handleKnownError(error, res)) return undefined;
      console.error("Testimonial revision creation failed");
      return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
    }
  });

  router.post("/testimonials/:submissionId/withdraw", mutationRateLimit, async (req, res) => {
    const submissionId = parseId(req.params.submissionId);
    try {
      validateBodyPresence(req);
      if (!submissionId
        || !exactObject(req.body, [], [])
        || Object.keys(req.query).length !== 0) {
        throw invalidRequest();
      }
      const result = await service.withdrawTestimonial({
        actorId: req.userId,
        actorRole: req.userRole,
        submissionId,
      });
      return res.json({
        changed: result.changed,
        testimonial: serializeTestimonial(result.testimonial),
      });
    } catch (error) {
      if (handleKnownError(error, res)) return undefined;
      console.error("Testimonial withdrawal failed");
      return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
    }
  });

  return router;
};

module.exports = { createPublicTestimonialAuthorRouter };
