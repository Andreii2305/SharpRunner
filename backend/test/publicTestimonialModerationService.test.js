const assert = require("node:assert/strict");
const { test } = require("node:test");

let createPublicTestimonialModerationService;
let PublicTestimonialModerationError;
try {
  ({
    createPublicTestimonialModerationService,
    PublicTestimonialModerationError,
  } = require("../src/services/publicTestimonialModerationService"));
} catch {
  // The first TDD run intentionally reaches the availability assertion.
}

test("public testimonial moderation service is available", () => {
  assert.equal(typeof createPublicTestimonialModerationService, "function");
  assert.equal(typeof PublicTestimonialModerationError, "function");
});

const baseRevision = (overrides = {}) => ({
  id: 301,
  submissionId: 201,
  authorUserId: 71,
  revisionNumber: 1,
  isCurrent: true,
  message: "An anonymous testimonial",
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
  idempotencyKey: "private-operation-key",
  createdAt: new Date("2026-11-03T08:00:00.000Z"),
  updatedAt: new Date("2026-11-03T08:00:00.000Z"),
  ...overrides,
});

const createHarness = ({
  admin = {},
  author = {},
  submission = {},
  revision = {},
  failUpdate = false,
} = {}) => {
  const store = {
    users: [
      { id: 9, firstName: "Admin", lastName: "User", username: "admin", role: "admin", status: "active", ...admin },
      { id: 71, firstName: "Ada", lastName: "Lovelace", username: "ada", role: "student", status: "active", ...author },
    ],
    submission: {
      id: 201,
      authorUserId: 71,
      withdrawnAt: null,
      publicationSuspendedAt: null,
      publicationSuspensionReason: null,
      createdAt: new Date("2026-11-03T07:00:00.000Z"),
      updatedAt: new Date("2026-11-03T07:00:00.000Z"),
      ...submission,
    },
    revision: baseRevision(revision),
    calls: [],
    audits: [],
    transactions: 0,
    failUpdate,
  };
  const clone = () => structuredClone({
    users: store.users,
    submission: store.submission,
    revision: store.revision,
  });
  const restore = (snapshot) => {
    store.users = snapshot.users;
    store.submission = snapshot.submission;
    store.revision = snapshot.revision;
  };
  const wrap = (row, kind) => row && ({
    get: () => structuredClone(row),
    update: async (values, options) => {
      store.calls.push({ type: `${kind}-update`, values: structuredClone(values), options });
      if (store.failUpdate) throw new Error("synthetic persistence failure");
      Object.assign(row, values, { updatedAt: new Date("2026-11-03T10:00:00.000Z") });
      return wrap(row, kind);
    },
  });
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const database = {
    transaction: async (callback) => {
      store.transactions += 1;
      const snapshot = clone();
      try {
        return await callback(transaction);
      } catch (error) {
        restore(snapshot);
        throw error;
      }
    },
  };
  const models = {
    User: {
      findAll: async (options) => {
        store.calls.push({ type: "users", options });
        return options.where.id
          .map((id) => store.users.find((user) => user.id === id))
          .filter(Boolean)
          .map((user) => wrap(user, "user"));
      },
    },
    PublicTestimonialSubmission: {
      findByPk: async (id, options) => {
        store.calls.push({ type: "submission-scope", id, options });
        return id === store.submission.id ? wrap(store.submission, "submission") : null;
      },
      findOne: async (options) => {
        store.calls.push({ type: "submission-lock", options });
        return options.where.id === store.submission.id
          && options.where.authorUserId === store.submission.authorUserId
          ? wrap(store.submission, "submission")
          : null;
      },
    },
    PublicTestimonialRevision: {
      findAll: async (options) => {
        store.calls.push({ type: "revision-lock", options });
        return options.where.submissionId === store.revision.submissionId
          && options.where.authorUserId === store.revision.authorUserId
          ? [wrap(store.revision, "revision")]
          : [];
      },
    },
  };
  const auditLogger = async (entry) => {
    store.audits.push(entry);
    return entry;
  };
  return {
    store,
    service: createPublicTestimonialModerationService?.({
      sequelize: database,
      models,
      auditLogger,
      now: () => new Date("2026-11-03T09:00:00.000Z"),
    }),
  };
};

const assertError = (promise, status, code) => assert.rejects(
  promise,
  (error) => error instanceof PublicTestimonialModerationError
    && error.status === status
    && error.code === code,
);

test("approve locks users in order and applies only the exact current pending revision", async () => {
  const h = createHarness();
  const result = await h.service.approve({
    actorId: 9, actorRole: "admin", submissionId: 201, revisionId: 301,
  });

  assert.equal(result.changed, true);
  assert.equal(result.revision.moderationStatus, "approved");
  assert.equal(result.revision.approvedByUserId, 9);
  assert.equal(result.revision.approvedAt.toISOString(), "2026-11-03T09:00:00.000Z");
  const users = h.store.calls.find(({ type }) => type === "users");
  assert.deepEqual(users.options.where.id, [9, 71]);
  assert.deepEqual(users.options.order, [["id", "ASC"]]);
  assert.equal(users.options.lock, "UPDATE");
  assert.equal(h.store.calls.findIndex(({ type }) => type === "users")
    < h.store.calls.findIndex(({ type }) => type === "submission-lock"), true);
  assert.equal(h.store.calls.findIndex(({ type }) => type === "submission-lock")
    < h.store.calls.findIndex(({ type }) => type === "revision-lock"), true);
  assert.deepEqual(h.store.audits, [{
    actorUserId: 9,
    role: "admin",
    targetUserId: 71,
    activity: "TESTIMONIAL_APPROVED",
    details: "submissionId=201; revisionId=301",
  }]);
});

test("reject and revoke normalize explanations and preserve approval evidence", async () => {
  const rejected = createHarness();
  const rejection = await rejected.service.reject({
    actorId: 9,
    actorRole: "admin",
    submissionId: 201,
    revisionId: 301,
    explanation: "\u00a0 Remove a private detail. \r\n",
  });
  assert.equal(rejection.revision.moderationStatus, "rejected");
  assert.equal(rejection.revision.moderationExplanation, "Remove a private detail.");
  assert.equal(rejection.revision.rejectedByUserId, 9);

  const approvedAt = new Date("2026-11-03T08:30:00.000Z");
  const revoked = createHarness({
    revision: {
      moderationStatus: "approved",
      approvedByUserId: 8,
      approvedAt,
    },
  });
  const revocation = await revoked.service.revoke({
    actorId: 9,
    actorRole: "admin",
    submissionId: 201,
    revisionId: 301,
    explanation: " No longer suitable. ",
  });
  assert.equal(revocation.revision.moderationStatus, "revoked");
  assert.equal(revocation.revision.approvedByUserId, 8);
  assert.equal(revocation.revision.approvedAt.toISOString(), approvedAt.toISOString());
  assert.equal(revocation.revision.revokedByUserId, 9);
  assert.equal(revocation.revision.moderationExplanation, "No longer suitable.");
});

test("matching retries preserve original decisions and later lifecycle state", async () => {
  const approvedAt = new Date("2026-11-03T08:30:00.000Z");
  const h = createHarness({
    submission: {
      withdrawnAt: new Date("2026-11-03T10:00:00.000Z"),
      publicationSuspendedAt: new Date("2026-11-03T10:01:00.000Z"),
      publicationSuspensionReason: "account_deactivated",
    },
    revision: {
      isCurrent: false,
      moderationStatus: "revoked",
      approvedByUserId: 9,
      approvedAt,
      revokedByUserId: 9,
      revokedAt: new Date("2026-11-03T09:30:00.000Z"),
      moderationExplanation: "No longer suitable.",
    },
  });

  const approveRetry = await h.service.approve({
    actorId: 9, actorRole: "admin", submissionId: 201, revisionId: 301,
  });
  assert.equal(approveRetry.changed, false);
  assert.equal(approveRetry.revision.moderationStatus, "revoked");
  assert.equal(approveRetry.revision.approvedAt.toISOString(), approvedAt.toISOString());
  assert.ok(approveRetry.testimonial.withdrawnAt);

  const revokeRetry = await h.service.revoke({
    actorId: 9,
    actorRole: "admin",
    submissionId: 201,
    revisionId: 301,
    explanation: "No longer suitable.",
  });
  assert.equal(revokeRetry.changed, false);
  assert.equal(h.store.revision.revokedAt.toISOString(), "2026-11-03T09:30:00.000Z");
  assert.equal(h.store.audits.length, 0);

  const rejected = createHarness({
    submission: { withdrawnAt: new Date("2026-11-03T11:00:00.000Z") },
    revision: {
      isCurrent: false,
      moderationStatus: "rejected",
      moderationExplanation: "Remove a private detail.",
      rejectedByUserId: 9,
      rejectedAt: new Date("2026-11-03T09:15:00.000Z"),
    },
  });
  const rejectRetry = await rejected.service.reject({
    actorId: 9,
    actorRole: "admin",
    submissionId: 201,
    revisionId: 301,
    explanation: " Remove a private detail. ",
  });
  assert.equal(rejectRetry.changed, false);
  assert.equal(rejectRetry.revision.rejectedAt.toISOString(), "2026-11-03T09:15:00.000Z");
  await assertError(rejected.service.reject({
    actorId: 9,
    actorRole: "admin",
    submissionId: 201,
    revisionId: 301,
    explanation: "A different explanation.",
  }), 409, "MODERATION_CONFLICT");
});

test("conflicting decisions, stale revisions, unavailable submissions, and invalid actors fail safely", async () => {
  await assertError(createHarness().service.reject({
    actorId: 9,
    actorRole: "admin",
    submissionId: 201,
    revisionId: 301,
    explanation: "   ",
  }), 400, "INVALID_REQUEST");
  await assertError(createHarness().service.approve({
    actorId: 9, actorRole: "teacher", submissionId: 201, revisionId: 301,
  }), 403, "FORBIDDEN");
  await assertError(createHarness({ admin: { status: "inactive" } }).service.approve({
    actorId: 9, actorRole: "admin", submissionId: 201, revisionId: 301,
  }), 403, "FORBIDDEN");
  await assertError(createHarness({ revision: { isCurrent: false } }).service.approve({
    actorId: 9, actorRole: "admin", submissionId: 201, revisionId: 301,
  }), 409, "REVISION_CHANGED");
  await assertError(createHarness({ submission: { withdrawnAt: new Date() } }).service.approve({
    actorId: 9, actorRole: "admin", submissionId: 201, revisionId: 301,
  }), 409, "TESTIMONIAL_NOT_MODERATABLE");
  await assertError(createHarness({ submission: {
    publicationSuspendedAt: new Date(), publicationSuspensionReason: "account_deactivated",
  } }).service.approve({
    actorId: 9, actorRole: "admin", submissionId: 201, revisionId: 301,
  }), 409, "TESTIMONIAL_NOT_MODERATABLE");
  await assertError(createHarness({ author: { status: "inactive" } }).service.approve({
    actorId: 9, actorRole: "admin", submissionId: 201, revisionId: 301,
  }), 409, "TESTIMONIAL_NOT_MODERATABLE");
  await assertError(createHarness({ author: { role: "admin" } }).service.approve({
    actorId: 9, actorRole: "admin", submissionId: 201, revisionId: 301,
  }), 409, "TESTIMONIAL_NOT_MODERATABLE");
  await assertError(createHarness({ revision: {
    moderationStatus: "approved", approvedByUserId: 9, approvedAt: new Date(),
  } }).service.reject({
    actorId: 9,
    actorRole: "admin",
    submissionId: 201,
    revisionId: 301,
    explanation: "Different decision",
  }), 409, "MODERATION_CONFLICT");
});

test("decision persistence failure rolls back and writes no audit entry", async () => {
  const h = createHarness({ failUpdate: true });
  await assert.rejects(h.service.approve({
    actorId: 9, actorRole: "admin", submissionId: 201, revisionId: 301,
  }), /synthetic persistence failure/);
  assert.equal(h.store.revision.moderationStatus, "pending");
  assert.equal(h.store.revision.approvedAt, null);
  assert.equal(h.store.audits.length, 0);
});
