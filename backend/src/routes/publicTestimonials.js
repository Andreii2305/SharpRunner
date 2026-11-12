const express = require("express");
const publicTestimonialReadService = require("../services/publicTestimonialReadService");

const setNoStore = (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};

const invalidRequest = (res) => res.status(400).json({
  code: "INVALID_REQUEST",
  message: "Invalid request",
});

const parsePagination = (query) => {
  if (Object.keys(query).some((key) => !["page", "limit"].includes(key))) return null;
  const parseValue = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
  };
  const page = parseValue(query.page, 1);
  const limit = parseValue(query.limit, 20, 50);
  if (!page || !limit) return null;
  const offset = (page - 1) * limit;
  return Number.isSafeInteger(offset) ? { page, limit, offset } : null;
};

const serializeTestimonial = (testimonial) => ({
  id: testimonial.id,
  message: testimonial.message,
  displayName: testimonial.displayName,
  approvedAt: testimonial.approvedAt,
});

const createPublicTestimonialRouter = ({ service = publicTestimonialReadService } = {}) => {
  const router = express.Router();
  router.use(setNoStore);

  router.get("/testimonials", async (req, res) => {
    const pagination = parsePagination(req.query);
    if (!pagination) return invalidRequest(res);

    try {
      const result = await service.listTestimonials(pagination);
      return res.json({
        testimonials: result.testimonials.map(serializeTestimonial),
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      });
    } catch (error) {
      if (error instanceof publicTestimonialReadService.PublicTestimonialReadError
        && error.status < 500) {
        return res.status(error.status).json({ code: error.code, message: error.message });
      }
      // Public rows contain author-written content, so failures intentionally omit error details.
      console.error("Public testimonial listing failed");
      return res.status(500).json({
        code: "SERVER_ERROR",
        message: "Unable to load testimonials",
      });
    }
  });

  return router;
};

module.exports = { createPublicTestimonialRouter };
