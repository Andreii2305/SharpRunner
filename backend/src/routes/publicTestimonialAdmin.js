const express = require("express");
const { createRateLimit } = require("../middleware/rateLimit");
const moderationService = require("../services/publicTestimonialModerationService");
const readService = require("../services/publicTestimonialAdminReadService");

const FILTERS = new Set(["pending", "approved", "rejected", "revoked", "all"]);

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

const parsePositive = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
};

const parseId = (value) => parsePositive(value, null);

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

const serializeAuthor = (author) => ({
  id: author.id,
  firstName: author.firstName,
  lastName: author.lastName,
  username: author.username,
  role: author.role,
  status: author.status,
});

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
  approvedByUserId: revision.approvedByUserId ?? null,
  approvedAt: revision.approvedAt ?? null,
  rejectedByUserId: revision.rejectedByUserId ?? null,
  rejectedAt: revision.rejectedAt ?? null,
  revokedByUserId: revision.revokedByUserId ?? null,
  revokedAt: revision.revokedAt ?? null,
  createdAt: revision.createdAt,
});

const serializeTestimonial = (testimonial) => ({
  id: testimonial.id,
  withdrawnAt: testimonial.withdrawnAt ?? null,
  publicationSuspendedAt: testimonial.publicationSuspendedAt ?? null,
  publicationSuspensionReason: testimonial.publicationSuspensionReason ?? null,
  createdAt: testimonial.createdAt,
  author: serializeAuthor(testimonial.author),
  currentRevision: testimonial.currentRevision
    ? serializeRevision(testimonial.currentRevision)
    : null,
});

const handleKnownError = (error, res) => {
  if (error instanceof moderationService.PublicTestimonialModerationError
    || error instanceof readService.PublicTestimonialAdminReadError) {
    res.status(error.status).json({ code: error.code, message: error.message });
    return true;
  }
  return false;
};

const createPublicTestimonialAdminRouter = ({
  service = moderationService,
  readService: administratorReadService = readService,
} = {}) => {
  const router = express.Router();
  router.use(setPrivateNoStore);
  const mutationRateLimit = createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    keyGenerator: (req) => `testimonial-moderation:${req.userId}`,
    code: "TESTIMONIAL_MODERATION_RATE_LIMITED",
    message: "Testimonial moderation is temporarily rate limited. Please try again shortly.",
  });

  router.get("/testimonials", async (req, res) => {
    const allowed = ["status", "page", "limit"];
    const pagination = parsePagination(req.query, { allowed });
    const status = req.query.status ?? "pending";
    if (!pagination || typeof status !== "string" || !FILTERS.has(status)) {
      return res.status(400).json({ code: "INVALID_REQUEST", message: "Invalid request" });
    }
    try {
      const result = await administratorReadService.listTestimonials({
        actorId: req.userId,
        actorRole: req.userRole,
        status,
        ...pagination,
      });
      return res.json({
        testimonials: result.testimonials.map(serializeTestimonial),
        status: result.status,
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      });
    } catch (error) {
      if (handleKnownError(error, res)) return undefined;
      console.error("Testimonial administrator listing failed");
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
      const result = await administratorReadService.getTestimonial({
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
      console.error("Testimonial administrator detail failed");
      return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
    }
  });

  const mutation = (action) => async (req, res) => {
    const submissionId = parseId(req.params.submissionId);
    const revisionId = parseId(req.params.revisionId);
    const approve = action === "approve";
    const validBody = approve
      ? exactObject(req.body, [], [])
      : exactObject(req.body, ["explanation"]);
    if (!submissionId
      || !revisionId
      || Object.keys(req.query).length !== 0
      || !validBody) {
      return res.status(400).json({ code: "INVALID_REQUEST", message: "Invalid request" });
    }
    try {
      const result = await service[action]({
        actorId: req.userId,
        actorRole: req.userRole,
        submissionId,
        revisionId,
        ...(!approve ? { explanation: req.body.explanation } : {}),
      });
      return res.json({
        changed: result.changed,
        testimonial: serializeTestimonial(result.testimonial),
        revision: serializeRevision(result.revision),
      });
    } catch (error) {
      if (handleKnownError(error, res)) return undefined;
      console.error(`Testimonial ${action} failed`);
      return res.status(500).json({ code: "SERVER_ERROR", message: "Server error" });
    }
  };

  router.post(
    "/testimonials/:submissionId/revisions/:revisionId/approve",
    mutationRateLimit,
    mutation("approve"),
  );
  router.post(
    "/testimonials/:submissionId/revisions/:revisionId/reject",
    mutationRateLimit,
    mutation("reject"),
  );
  router.post(
    "/testimonials/:submissionId/revisions/:revisionId/revoke",
    mutationRateLimit,
    mutation("revoke"),
  );

  return router;
};

module.exports = { createPublicTestimonialAdminRouter };
