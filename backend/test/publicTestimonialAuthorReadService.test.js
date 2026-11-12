const assert = require("node:assert/strict");
const { test } = require("node:test");

let createPublicTestimonialAuthorReadService;
try {
  ({ createPublicTestimonialAuthorReadService } = require(
    "../src/services/publicTestimonialAuthorReadService"
  ));
} catch {
  // The first TDD run intentionally reaches the availability assertion.
}

test("public testimonial author read service is available", () => {
  assert.equal(typeof createPublicTestimonialAuthorReadService, "function");
});

const revision = (overrides = {}) => ({
  id: 301,
  submissionId: 201,
  authorUserId: 71,
  revisionNumber: 2,
  isCurrent: true,
  message: "Current testimonial",
  attributionMode: "anonymous",
  publicDisplayNameSnapshot: null,
  publicNamePreviewVersion: null,
  consentVersion: "synthetic-v1",
  consentedAt: new Date("2026-11-03T08:00:00.000Z"),
  moderationStatus: "rejected",
  moderationExplanation: "Remove a private detail.",
  approvedByUserId: 999,
  approvedAt: null,
  revokedAt: null,
  idempotencyKey: "private_operation_key",
  createdAt: new Date("2026-11-03T08:00:00.000Z"),
  updatedAt: new Date("2026-11-03T08:00:00.000Z"),
  ...overrides,
});

const submission = (overrides = {}) => ({
  id: 201,
  authorUserId: 71,
  idempotencyKey: "private_creation_key",
  withdrawnAt: null,
  publicationSuspendedAt: null,
  publicationSuspensionReason: null,
  createdAt: new Date("2026-11-03T07:00:00.000Z"),
  updatedAt: new Date("2026-11-03T07:00:00.000Z"),
  revisions: [revision()],
  ...overrides,
});

const createReadHarness = ({ actorStatus = "active" } = {}) => {
  const calls = [];
  const models = {
    User: {
      findByPk: async (id, options) => {
        calls.push({ type: "user", id, options });
        return { id, role: "student", status: actorStatus };
      },
    },
    PublicTestimonialRevision: {
      findAndCountAll: async (options) => {
        calls.push({ type: "revisions", options });
        return {
          count: "2",
          rows: [revision(), revision({
            id: 300,
            revisionNumber: 1,
            isCurrent: false,
            message: "Earlier testimonial",
            moderationStatus: "approved",
            moderationExplanation: null,
            approvedAt: new Date("2026-11-02T08:00:00.000Z"),
          })],
        };
      },
    },
    PublicTestimonialSubmission: {
      findAndCountAll: async (options) => {
        calls.push({ type: "submissions", options });
        return { count: "1", rows: [submission()] };
      },
      findOne: async (options) => {
        calls.push({ type: "submission", options });
        return options.where.id === 201 && options.where.authorUserId === 71
          ? submission()
          : null;
      },
    },
  };
  return {
    calls,
    service: createPublicTestimonialAuthorReadService?.({ models }),
  };
};

test("author listing is isolated, deterministic, paginated, and allowlisted", async () => {
  const h = createReadHarness();
  const result = await h.service.listOwnTestimonials({
    actorId: 71,
    actorRole: "student",
    page: 2,
    limit: 20,
    offset: 20,
  });
  assert.equal(result.total, 1);
  assert.equal(result.totalPages, 1);
  assert.deepEqual(result.testimonials[0], {
    id: 201,
    withdrawnAt: null,
    publicationSuspendedAt: null,
    createdAt: new Date("2026-11-03T07:00:00.000Z"),
    currentRevision: {
      id: 301,
      revisionNumber: 2,
      message: "Current testimonial",
      attributionMode: "anonymous",
      publicDisplayName: null,
      consentVersion: "synthetic-v1",
      consentedAt: new Date("2026-11-03T08:00:00.000Z"),
      moderationStatus: "rejected",
      moderationExplanation: "Remove a private detail.",
      approvedAt: null,
      revokedAt: null,
      createdAt: new Date("2026-11-03T08:00:00.000Z"),
    },
  });
  const query = h.calls.find(({ type }) => type === "submissions").options;
  assert.deepEqual(query.where, { authorUserId: 71 });
  assert.deepEqual(query.order, [["createdAt", "DESC"], ["id", "DESC"]]);
  assert.equal(query.limit, 20);
  assert.equal(query.offset, 20);
  assert.equal("idempotencyKey" in result.testimonials[0], false);
  assert.equal("approvedByUserId" in result.testimonials[0].currentRevision, false);
});

test("author detail checks ownership and paginates revision history independently", async () => {
  const h = createReadHarness();
  const result = await h.service.getOwnTestimonial({
    actorId: 71,
    actorRole: "student",
    submissionId: 201,
    revisionPage: 1,
    revisionLimit: 20,
    revisionOffset: 0,
  });
  assert.equal(result.testimonial.id, 201);
  assert.deepEqual(result.revisions.map(({ id }) => id), [301, 300]);
  assert.equal(result.revisionTotal, 2);
  assert.equal(result.revisionTotalPages, 1);
  const submissionQuery = h.calls.find(({ type }) => type === "submission").options;
  assert.deepEqual(submissionQuery.where, { id: 201, authorUserId: 71 });
  const revisionQuery = h.calls.find(({ type }) => type === "revisions").options;
  assert.deepEqual(revisionQuery.where, { submissionId: 201, authorUserId: 71 });
  assert.deepEqual(revisionQuery.order, [["revisionNumber", "DESC"], ["id", "DESC"]]);
});

test("inactive, unauthorized, cross-user, and unsafe pagination requests are denied", async () => {
  const inactive = createReadHarness({ actorStatus: "inactive" });
  await assert.rejects(
    inactive.service.listOwnTestimonials({
      actorId: 71, actorRole: "student", page: 1, limit: 20, offset: 0,
    }),
    (error) => error.status === 403 && error.code === "FORBIDDEN",
  );
  const h = createReadHarness();
  await assert.rejects(
    h.service.listOwnTestimonials({
      actorId: 71, actorRole: "admin", page: 1, limit: 20, offset: 0,
    }),
    (error) => error.status === 403 && error.code === "FORBIDDEN",
  );
  await assert.rejects(
    h.service.listOwnTestimonials({
      actorId: 71, actorRole: "student", page: Number.MAX_SAFE_INTEGER, limit: 100, offset: 0,
    }),
    (error) => error.status === 400 && error.code === "INVALID_REQUEST",
  );
  h.calls.length = 0;
  await assert.rejects(
    h.service.getOwnTestimonial({
      actorId: 71,
      actorRole: "student",
      submissionId: 999,
      revisionPage: 1,
      revisionLimit: 20,
      revisionOffset: 0,
    }),
    (error) => error.status === 404 && error.code === "NOT_FOUND",
  );
  const foreignLookup = h.calls.find(({ type }) => type === "submission").options;
  assert.deepEqual(foreignLookup.where, { id: 999, authorUserId: 71 });
  assert.equal(h.calls.some(({ type }) => type === "revisions"), false);
});
