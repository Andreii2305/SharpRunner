const assert = require("node:assert/strict");
const { test } = require("node:test");

let createPublicTestimonialAdminReadService;
let PublicTestimonialAdminReadError;
try {
  ({
    createPublicTestimonialAdminReadService,
    PublicTestimonialAdminReadError,
  } = require("../src/services/publicTestimonialAdminReadService"));
} catch {
  // The first TDD run intentionally reaches the availability assertion.
}

test("public testimonial administrator read service is available", () => {
  assert.equal(typeof createPublicTestimonialAdminReadService, "function");
  assert.equal(typeof PublicTestimonialAdminReadError, "function");
});

const author = {
  id: 71,
  firstName: "Ada",
  lastName: "Lovelace",
  username: "ada",
  email: "private@example.test",
  role: "student",
  status: "active",
  tokenVersion: 4,
};
const submission = {
  id: 201,
  authorUserId: 71,
  withdrawnAt: null,
  publicationSuspendedAt: null,
  publicationSuspensionReason: null,
  idempotencyKey: "private-submission-key",
  createdAt: new Date("2026-11-03T07:00:00.000Z"),
  author,
};
const revision = (overrides = {}) => ({
  id: 301,
  submissionId: 201,
  authorUserId: 71,
  revisionNumber: 2,
  isCurrent: true,
  message: "Anonymous but administrator-identifiable",
  attributionMode: "anonymous",
  publicDisplayNameSnapshot: null,
  publicNamePreviewVersion: null,
  consentVersion: "synthetic-v1",
  consentedAt: new Date("2026-11-03T08:00:00.000Z"),
  moderationStatus: "pending",
  moderationExplanation: null,
  approvedByUserId: null,
  approvedAt: null,
  rejectedByUserId: null,
  rejectedAt: null,
  revokedByUserId: null,
  revokedAt: null,
  idempotencyKey: "private-revision-key",
  createdAt: new Date("2026-11-03T08:00:00.000Z"),
  submission,
  author,
  ...overrides,
});

const createHarness = ({ adminStatus = "active" } = {}) => {
  const calls = [];
  const models = {
    User: {
      findByPk: async (id, options) => {
        calls.push({ type: "admin", id, options });
        return { id, role: "admin", status: adminStatus };
      },
    },
    PublicTestimonialRevision: {
      findAndCountAll: async (options) => {
        calls.push({ type: "revisions", options });
        if (options.where.isCurrent) return { count: "1", rows: [revision()] };
        return {
          count: "2",
          rows: [revision(), revision({
            id: 300,
            revisionNumber: 1,
            isCurrent: false,
            message: "Earlier version",
            moderationStatus: "rejected",
            moderationExplanation: "Remove a private detail.",
            rejectedByUserId: 9,
            rejectedAt: new Date("2026-11-02T09:00:00.000Z"),
          })],
        };
      },
    },
    PublicTestimonialSubmission: {
      findOne: async (options) => {
        calls.push({ type: "submission", options });
        return options.where.id === 201
          ? { ...submission, revisions: [revision()] }
          : null;
      },
    },
  };
  return {
    calls,
    service: createPublicTestimonialAdminReadService?.({ models }),
  };
};

test("pending queue is actionable, bounded, deterministic, and administrator-allowlisted", async () => {
  const h = createHarness();
  const result = await h.service.listTestimonials({
    actorId: 9,
    actorRole: "admin",
    status: "pending",
    page: 2,
    limit: 20,
    offset: 20,
  });
  assert.equal(result.total, 1);
  assert.equal(result.status, "pending");
  assert.equal(result.testimonials[0].author.id, 71);
  assert.equal(result.testimonials[0].author.username, "ada");
  assert.equal(result.testimonials[0].currentRevision.publicDisplayName, null);
  assert.equal("email" in result.testimonials[0].author, false);
  assert.equal("tokenVersion" in result.testimonials[0].author, false);
  assert.equal("idempotencyKey" in result.testimonials[0], false);
  assert.equal("idempotencyKey" in result.testimonials[0].currentRevision, false);

  const query = h.calls.find(({ type }) => type === "revisions").options;
  assert.deepEqual(query.where, { isCurrent: true, moderationStatus: "pending" });
  assert.deepEqual(query.order, [["createdAt", "DESC"], ["id", "DESC"]]);
  assert.equal(query.limit, 20);
  assert.equal(query.offset, 20);
  const submissionInclude = query.include.find(({ as }) => as === "submission");
  const authorInclude = query.include.find(({ as }) => as === "author");
  assert.deepEqual(submissionInclude.where, {
    withdrawnAt: null,
    publicationSuspendedAt: null,
  });
  assert.deepEqual(authorInclude.where, {
    status: "active",
    role: ["student", "teacher"],
  });
});

test("all and decided filters retain unavailable lifecycle history without presenting it as pending", async () => {
  const h = createHarness();
  await h.service.listTestimonials({
    actorId: 9, actorRole: "admin", status: "all", page: 1, limit: 20, offset: 0,
  });
  let query = h.calls.find(({ type }) => type === "revisions").options;
  assert.deepEqual(query.where, { isCurrent: true });
  assert.equal(query.include.find(({ as }) => as === "submission").where, undefined);
  assert.equal(query.include.find(({ as }) => as === "author").where, undefined);

  h.calls.length = 0;
  await h.service.listTestimonials({
    actorId: 9, actorRole: "admin", status: "approved", page: 1, limit: 20, offset: 0,
  });
  query = h.calls.find(({ type }) => type === "revisions").options;
  assert.deepEqual(query.where, { isCurrent: true, moderationStatus: "approved" });
});

test("detail retains withdrawn and suspended history with independently paginated revisions", async () => {
  const h = createHarness();
  const result = await h.service.getTestimonial({
    actorId: 9,
    actorRole: "admin",
    submissionId: 201,
    revisionPage: 3,
    revisionLimit: 10,
    revisionOffset: 20,
  });
  assert.equal(result.testimonial.id, 201);
  assert.equal(result.testimonial.author.id, 71);
  assert.deepEqual(result.revisions.map(({ id }) => id), [301, 300]);
  assert.equal(result.revisionTotal, 2);
  const history = h.calls.find(({ type }) => type === "revisions").options;
  assert.deepEqual(history.where, { submissionId: 201, authorUserId: 71 });
  assert.deepEqual(history.order, [["revisionNumber", "DESC"], ["id", "DESC"]]);
  assert.equal(history.limit, 10);
  assert.equal(history.offset, 20);
});

test("inactive administrators, non-admins, unsafe pagination, status, and missing detail fail closed", async () => {
  const h = createHarness();
  await assert.rejects(h.service.listTestimonials({
    actorId: 9, actorRole: "teacher", status: "pending", page: 1, limit: 20, offset: 0,
  }), (error) => error.status === 403 && error.code === "FORBIDDEN");
  await assert.rejects(createHarness({ adminStatus: "inactive" }).service.listTestimonials({
    actorId: 9, actorRole: "admin", status: "pending", page: 1, limit: 20, offset: 0,
  }), (error) => error.status === 403 && error.code === "FORBIDDEN");
  await assert.rejects(h.service.listTestimonials({
    actorId: 9, actorRole: "admin", status: "unknown", page: 1, limit: 20, offset: 0,
  }), (error) => error.status === 400 && error.code === "INVALID_REQUEST");
  await assert.rejects(h.service.listTestimonials({
    actorId: 9,
    actorRole: "admin",
    status: "pending",
    page: Number.MAX_SAFE_INTEGER,
    limit: 100,
    offset: 0,
  }), (error) => error.status === 400 && error.code === "INVALID_REQUEST");
  await assert.rejects(h.service.getTestimonial({
    actorId: 9,
    actorRole: "admin",
    submissionId: 999,
    revisionPage: 1,
    revisionLimit: 20,
    revisionOffset: 0,
  }), (error) => error.status === 404 && error.code === "NOT_FOUND");
});
