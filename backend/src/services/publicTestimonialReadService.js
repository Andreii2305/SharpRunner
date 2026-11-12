const { QueryTypes } = require("sequelize");
const sequelize = require("../config/database");

class PublicTestimonialReadError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "PublicTestimonialReadError";
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => {
  throw new PublicTestimonialReadError(status, code, message);
};

const PUBLIC_TESTIMONIAL_QUERY = `
  WITH eligible AS (
    SELECT
      revision."id" AS "id",
      revision."message" AS "message",
      CASE
        WHEN revision."attributionMode" = 'anonymous' THEN 'Anonymous user'
        ELSE revision."publicDisplayNameSnapshot"
      END AS "displayName",
      revision."approvedAt" AS "approvedAt"
    FROM "PublicTestimonialRevisions" AS revision
    INNER JOIN "PublicTestimonialSubmissions" AS submission
      ON submission."id" = revision."submissionId"
      AND submission."authorUserId" = revision."authorUserId"
    INNER JOIN "Users" AS author
      ON author."id" = revision."authorUserId"
    WHERE revision."isCurrent" = TRUE
      AND revision."moderationStatus" = 'approved'
      AND revision."approvedAt" IS NOT NULL
      AND revision."approvedByUserId" IS NOT NULL
      AND revision."consentVersion" IS NOT NULL
      AND revision."consentedAt" IS NOT NULL
      AND (
        (
          revision."attributionMode" = 'anonymous'
          AND revision."publicDisplayNameSnapshot" IS NULL
          AND revision."publicNamePreviewVersion" IS NULL
        )
        OR (
          revision."attributionMode" = 'named'
          AND revision."publicDisplayNameSnapshot" IS NOT NULL
          AND revision."publicNamePreviewVersion" IS NOT NULL
        )
      )
      AND submission."withdrawnAt" IS NULL
      AND submission."publicationSuspendedAt" IS NULL
      AND submission."publicationSuspensionReason" IS NULL
      AND author."status" = 'active'
      AND author."role" IN ('student', 'teacher')
  ),
  eligible_total AS (
    SELECT COUNT(*)::text AS "total"
    FROM eligible
  ),
  page_rows AS (
    SELECT "id", "message", "displayName", "approvedAt"
    FROM eligible
    ORDER BY "approvedAt" DESC, "id" DESC
    LIMIT :limit OFFSET :offset
  )
  SELECT
    eligible_total."total",
    page_rows."id",
    page_rows."message",
    page_rows."displayName",
    page_rows."approvedAt"
  FROM eligible_total
  LEFT JOIN page_rows ON TRUE
  ORDER BY page_rows."approvedAt" DESC NULLS LAST, page_rows."id" DESC NULLS LAST
`;

const parseCount = (value) => {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    fail(500, "PUBLIC_TESTIMONIAL_INTEGRITY_ERROR", "Unable to load testimonials");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    fail(500, "PUBLIC_TESTIMONIAL_INTEGRITY_ERROR", "Unable to load testimonials");
  }
  return parsed;
};

const serializeRow = (row) => {
  if (!Number.isSafeInteger(row.id) || row.id <= 0
    || typeof row.message !== "string"
    || typeof row.displayName !== "string"
    || row.displayName.length === 0
    || row.approvedAt == null) {
    fail(500, "PUBLIC_TESTIMONIAL_INTEGRITY_ERROR", "Unable to load testimonials");
  }
  return {
    id: row.id,
    message: row.message,
    displayName: row.displayName,
    approvedAt: row.approvedAt,
  };
};

const validatePagination = ({ page, limit, offset }) => {
  if (!Number.isSafeInteger(page) || page < 1
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 50
    || !Number.isSafeInteger(offset) || offset < 0
    || offset !== (page - 1) * limit) {
    fail(400, "INVALID_REQUEST", "Invalid request");
  }
};

const createPublicTestimonialReadService = ({ database = sequelize } = {}) => ({
  async listTestimonials(input) {
    validatePagination(input);
    const rows = await database.query(PUBLIC_TESTIMONIAL_QUERY, {
      replacements: { limit: input.limit, offset: input.offset },
      type: QueryTypes.SELECT,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      fail(500, "PUBLIC_TESTIMONIAL_INTEGRITY_ERROR", "Unable to load testimonials");
    }
    const total = parseCount(rows[0].total);
    if (rows.some((row) => row.total !== rows[0].total)) {
      fail(500, "PUBLIC_TESTIMONIAL_INTEGRITY_ERROR", "Unable to load testimonials");
    }
    const testimonials = rows
      .filter((row) => row.id != null)
      .map(serializeRow);
    return {
      testimonials,
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limit)),
    };
  },
});

module.exports = {
  PUBLIC_TESTIMONIAL_QUERY,
  PublicTestimonialReadError,
  createPublicTestimonialReadService,
  ...createPublicTestimonialReadService(),
};
