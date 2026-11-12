const assert = require("node:assert/strict");
const { test } = require("node:test");

let createPublicTestimonialAuthorService;
let PublicTestimonialAuthorError;
let createTestimonialConsentConfiguration;
try {
  ({
    createPublicTestimonialAuthorService,
    PublicTestimonialAuthorError,
    createTestimonialConsentConfiguration,
  } = require("../src/services/publicTestimonialAuthorService"));
} catch {
  // The first TDD run intentionally reaches the availability assertion.
}

test("public testimonial author service is available", () => {
  assert.equal(typeof createPublicTestimonialAuthorService, "function");
  assert.equal(typeof PublicTestimonialAuthorError, "function");
  assert.equal(typeof createTestimonialConsentConfiguration, "function");
});

test("synthetic consent configuration derives a stable server-owned named preview", () => {
  const configuration = createTestimonialConsentConfiguration?.({
    consentVersion: "synthetic-consent-v1",
    consentText: "I agree that this synthetic testimonial may be displayed publicly.",
    previewSecret: "synthetic-preview-secret-for-tests-only",
  });
  const first = configuration?.getOptions({
    userId: 71,
    firstName: "  Ada ",
    lastName: " lovelace ",
  });
  const second = configuration?.getOptions({
    userId: 71,
    firstName: "Ada",
    lastName: "lovelace",
  });
  assert.deepEqual(first, second);
  assert.equal(first.namedDisplayPreview, "Ada L.");
  assert.equal(first.consentVersion, "synthetic-consent-v1");
  assert.equal(
    first.consentText,
    "I agree that this synthetic testimonial may be displayed publicly.",
  );
  assert.match(first.consentBinding, /^[A-Za-z0-9_-]{43}$/);
  assert.match(first.publicNamePreviewVersion, /^[A-Za-z0-9_-]{43}$/);
  assert.equal("previewSecret" in first, false);
});

test("consent configuration rejects missing malformed and oversized disclosure text", () => {
  const base = {
    consentVersion: "synthetic-consent-v1",
    previewSecret: "synthetic-preview-secret-for-tests-only",
  };
  for (const consentText of [
    undefined, null, "", "   ", " leading text", "text\n", "malformed\ud800text", 42,
  ]) {
    assert.equal(createTestimonialConsentConfiguration({ ...base, consentText }), null);
  }
  assert.equal(createTestimonialConsentConfiguration({
    ...base,
    consentText: "x".repeat(2001),
  }), null);
});

const consentConfiguration = createTestimonialConsentConfiguration?.({
  consentVersion: "synthetic-consent-v1",
  consentText: "I agree that this synthetic testimonial may be displayed publicly.",
  previewSecret: "synthetic-preview-secret-for-tests-only",
});

const createHarness = ({
  userOverrides = {},
  failRevisionCreate = false,
  revisionCreateError = null,
  concurrentSubmission = null,
  concurrentRevision = null,
  configuration = consentConfiguration,
} = {}) => {
  const store = {
    users: [{
      id: 71,
      firstName: "Ada",
      lastName: "Lovelace",
      role: "student",
      status: "active",
      ...userOverrides,
    }],
    submissions: [],
    revisions: [],
    nextSubmissionId: 10,
    nextRevisionId: 20,
    transactions: 0,
    savepoints: 0,
    failRevisionCreate,
    revisionCreateError,
    concurrentSubmission,
    concurrentRevision,
    revisionCreateFailed: false,
    savepointActive: false,
    recoveryReadDuringSavepoint: false,
  };
  const cloneState = () => structuredClone({
    submissions: store.submissions,
    revisions: store.revisions,
    nextSubmissionId: store.nextSubmissionId,
    nextRevisionId: store.nextRevisionId,
  });
  const restore = (snapshot) => {
    store.submissions = snapshot.submissions;
    store.revisions = snapshot.revisions;
    store.nextSubmissionId = snapshot.nextSubmissionId;
    store.nextRevisionId = snapshot.nextRevisionId;
  };
  const wrap = (row, collection) => row && ({
    get: () => structuredClone(row),
    update: async (values) => {
      Object.assign(row, values, { updatedAt: new Date("2026-11-03T11:00:00.000Z") });
      const index = collection.findIndex((candidate) => candidate.id === row.id);
      if (index >= 0) collection[index] = row;
      return wrap(row, collection);
    },
  });
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const database = {
    transaction: async (optionsOrCallback, maybeCallback) => {
      const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
      const snapshot = cloneState();
      const isSavepoint = typeof optionsOrCallback !== "function";
      if (!isSavepoint) store.transactions += 1;
      else {
        store.savepoints += 1;
        store.savepointActive = true;
      }
      try {
        return await callback(transaction);
      } catch (error) {
        restore(snapshot);
        throw error;
      } finally {
        if (isSavepoint) store.savepointActive = false;
      }
    },
  };
  const models = {
    User: {
      findByPk: async (id) => store.users.find((row) => row.id === id) ?? null,
    },
    PublicTestimonialSubmission: {
      findOne: async ({ where }) => {
        if (store.revisionCreateFailed && store.savepointActive) {
          store.recoveryReadDuringSavepoint = true;
        }
        const row = store.submissions.find((candidate) => matches(candidate, where))
          ?? (store.revisionCreateFailed
            && store.concurrentSubmission
            && matches(store.concurrentSubmission, where)
            ? store.concurrentSubmission
            : null);
        return wrap(row, store.submissions);
      },
      create: async (values) => {
        const timestamp = new Date("2026-11-03T10:00:00.000Z");
        const row = {
          id: store.nextSubmissionId++,
          withdrawnAt: null,
          publicationSuspendedAt: null,
          publicationSuspensionReason: null,
          ...values,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        store.submissions.push(row);
        return wrap(row, store.submissions);
      },
    },
    PublicTestimonialRevision: {
      findOne: async ({ where }) => {
        if (store.revisionCreateFailed && store.savepointActive) {
          store.recoveryReadDuringSavepoint = true;
        }
        const row = store.revisions.find((candidate) => matches(candidate, where))
          ?? (store.revisionCreateFailed
            && store.concurrentRevision
            && matches(store.concurrentRevision, where)
            ? store.concurrentRevision
            : null);
        return wrap(row, store.revisions);
      },
      create: async (values) => {
        if (store.failRevisionCreate || store.revisionCreateError) {
          store.revisionCreateFailed = true;
          throw store.revisionCreateError ?? new Error("synthetic revision failure");
        }
        const timestamp = new Date("2026-11-03T10:00:00.000Z");
        const row = {
          id: store.nextRevisionId++,
          moderationExplanation: null,
          approvedAt: null,
          revokedAt: null,
          ...values,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        store.revisions.push(row);
        return wrap(row, store.revisions);
      },
    },
  };
  return {
    store,
    database,
    models,
    service: createPublicTestimonialAuthorService?.({
      sequelize: database,
      models,
      consentConfiguration: configuration,
      now: () => new Date("2026-11-03T10:30:00.000Z"),
    }),
  };
};

const namedInput = (service, overrides = {}) => {
  const options = consentConfiguration.getOptions({
    userId: 71,
    firstName: "Ada",
    lastName: "Lovelace",
  });
  return service.createTestimonial({
    actorId: 71,
    actorRole: "student",
    message: "  Learning feels more approachable.\r\n",
    attributionMode: "named",
    consent: true,
    consentVersion: options.consentVersion,
    consentBinding: options.consentBinding,
    publicNamePreviewVersion: options.publicNamePreviewVersion,
    idempotencyKey: "testimonial_create_key_1",
    ...overrides,
  });
};

const assertError = (promise, status, code) => assert.rejects(
  promise,
  (error) => error instanceof PublicTestimonialAuthorError
    && error.status === status
    && error.code === code,
);

test("active authors create named and anonymous pending revisions atomically", async () => {
  const named = createHarness();
  const namedResult = await namedInput(named.service);
  assert.equal(namedResult.changed, true);
  assert.equal(namedResult.testimonial.currentRevision.publicDisplayName, "Ada L.");
  assert.equal(namedResult.revision.message, "Learning feels more approachable.");
  assert.equal(namedResult.revision.moderationStatus, "pending");
  assert.equal("idempotencyKey" in namedResult.revision, false);
  assert.equal("authorUserId" in namedResult.testimonial, false);
  assert.equal(named.store.submissions.length, 1);
  assert.equal(named.store.revisions.length, 1);

  const anonymous = createHarness();
  const anonymousResult = await anonymous.service.createTestimonial({
    actorId: 71,
    actorRole: "student",
    message: "Anonymous testimonial",
    attributionMode: "anonymous",
    consent: true,
    consentVersion: "synthetic-consent-v1",
    consentBinding: consentConfiguration.getOptions({
      userId: 71,
      firstName: "Ada",
      lastName: "Lovelace",
    }).consentBinding,
    idempotencyKey: "testimonial_create_key_2",
  });
  assert.equal(anonymousResult.revision.publicDisplayName, null);
  assert.equal(anonymous.store.revisions[0].publicNamePreviewVersion, null);
});

test("roles, account state, consent, preview, and atomic creation fail closed", async () => {
  await assertError(namedInput(createHarness().service, { actorRole: "admin" }), 403, "FORBIDDEN");
  await assertError(namedInput(createHarness({ userOverrides: { status: "inactive" } }).service), 403, "FORBIDDEN");
  await assertError(namedInput(createHarness().service, {
    publicNamePreviewVersion: "wrong_preview_version_12345678901234567890",
  }), 409, "PUBLIC_NAME_PREVIEW_STALE");
  await assertError(namedInput(createHarness({
    userOverrides: { firstName: "Grace", lastName: "Hopper" },
  }).service), 409, "PUBLIC_NAME_PREVIEW_STALE");
  await assertError(namedInput(createHarness().service, {
    consentVersion: "stale-consent",
  }), 409, "CONSENT_VERSION_STALE");
  await assertError(namedInput(createHarness().service, {
    consentBinding: "A".repeat(43),
  }), 409, "CONSENT_VERSION_STALE");
  await assertError(createHarness().service.createTestimonial({
    actorId: 71,
    actorRole: "student",
    message: "Anonymous stale disclosure",
    attributionMode: "anonymous",
    consent: true,
    consentVersion: "synthetic-consent-v1",
    consentBinding: "A".repeat(43),
    idempotencyKey: "testimonial_stale_anonymous_key",
  }), 409, "CONSENT_VERSION_STALE");
  const noConfiguration = createHarness();
  noConfiguration.service = createPublicTestimonialAuthorService({
    sequelize: {
      transaction: async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } }),
    },
    models: {
      User: { findByPk: async () => noConfiguration.store.users[0] },
      PublicTestimonialRevision: { findOne: async () => null },
    },
    consentConfiguration: null,
  });
  await assertError(noConfiguration.service.getOptions({
    actorId: 71,
    actorRole: "student",
  }), 503, "TESTIMONIAL_CONSENT_UNAVAILABLE");
  await assertError(namedInput(noConfiguration.service), 503, "TESTIMONIAL_CONSENT_UNAVAILABLE");

  const rollback = createHarness({ failRevisionCreate: true });
  await assert.rejects(namedInput(rollback.service), /synthetic revision failure/);
  assert.equal(rollback.store.submissions.length, 0);
  assert.equal(rollback.store.revisions.length, 0);
});

test("changed disclosure text invalidates stale named and anonymous options bindings", async () => {
  const changedConfiguration = createTestimonialConsentConfiguration({
    consentVersion: "synthetic-consent-v1",
    consentText: "I agree to a different synthetic public disclosure.",
    previewSecret: "synthetic-preview-secret-for-tests-only",
  });
  const staleOptions = consentConfiguration.getOptions({
    userId: 71,
    firstName: "Ada",
    lastName: "Lovelace",
  });
  const changedOptions = changedConfiguration.getOptions({
    userId: 71,
    firstName: "Ada",
    lastName: "Lovelace",
  });
  assert.notEqual(changedOptions.consentBinding, staleOptions.consentBinding);
  assert.notEqual(changedOptions.publicNamePreviewVersion, staleOptions.publicNamePreviewVersion);

  const named = createHarness({ configuration: changedConfiguration });
  await assertError(namedInput(named.service, {
    consentBinding: staleOptions.consentBinding,
    publicNamePreviewVersion: staleOptions.publicNamePreviewVersion,
  }), 409, "CONSENT_VERSION_STALE");
  await assertError(named.service.createTestimonial({
    actorId: 71,
    actorRole: "student",
    message: "Anonymous stale options",
    attributionMode: "anonymous",
    consent: true,
    consentVersion: staleOptions.consentVersion,
    consentBinding: staleOptions.consentBinding,
    idempotencyKey: "testimonial_stale_disclosure_key",
  }), 409, "CONSENT_VERSION_STALE");
});

test("matching create retries acknowledge immutable evidence without reversing later state", async () => {
  const h = createHarness();
  const created = await namedInput(h.service);
  h.store.submissions[0].withdrawnAt = new Date("2026-11-03T12:00:00.000Z");
  h.store.submissions[0].publicationSuspendedAt = new Date("2026-11-03T12:01:00.000Z");
  h.store.submissions[0].publicationSuspensionReason = "account_deactivated";
  const retry = await namedInput(h.service);
  assert.equal(retry.changed, false);
  assert.equal(retry.revision.id, created.revision.id);
  assert.equal(retry.testimonial.withdrawnAt.toISOString(), "2026-11-03T12:00:00.000Z");
  assert.equal(retry.testimonial.publicationSuspendedAt.toISOString(), "2026-11-03T12:01:00.000Z");
  await assertError(namedInput(h.service, { message: "Different payload" }), 409, "IDEMPOTENCY_KEY_CONFLICT");
});

test("committed retries survive moderation, withdrawal, and unavailable consent configuration", async () => {
  const h = createHarness();
  const created = await namedInput(h.service);
  h.store.revisions[0].moderationStatus = "approved";
  h.store.revisions[0].approvedByUserId = 9;
  h.store.revisions[0].approvedAt = new Date("2026-11-03T11:30:00.000Z");
  h.store.submissions[0].withdrawnAt = new Date("2026-11-03T12:00:00.000Z");

  const serviceWithoutConsent = createPublicTestimonialAuthorService({
    sequelize: h.database,
    models: h.models,
    consentConfiguration: null,
    now: () => new Date("2026-11-03T13:00:00.000Z"),
  });
  const retry = await namedInput(serviceWithoutConsent);

  assert.equal(retry.changed, false);
  assert.equal(retry.revision.id, created.revision.id);
  assert.equal(retry.revision.message, created.revision.message);
  assert.equal(retry.revision.publicDisplayName, created.revision.publicDisplayName);
  assert.equal(retry.revision.moderationStatus, "approved");
  assert.equal(retry.testimonial.withdrawnAt.toISOString(), "2026-11-03T12:00:00.000Z");
  assert.equal(h.store.revisions.length, 1);
  assert.equal(h.store.submissions.length, 1);
});

test("a new edit remains unavailable without complete consent configuration", async () => {
  const h = createHarness();
  const created = await namedInput(h.service);
  const serviceWithoutConsent = createPublicTestimonialAuthorService({
    sequelize: h.database,
    models: h.models,
    consentConfiguration: null,
  });
  const options = consentConfiguration.getOptions({
    userId: 71,
    firstName: "Ada",
    lastName: "Lovelace",
  });
  await assertError(serviceWithoutConsent.createRevision({
    actorId: 71,
    actorRole: "student",
    submissionId: created.testimonial.id,
    baseRevisionId: created.revision.id,
    message: "A new edit",
    attributionMode: "anonymous",
    consent: true,
    consentVersion: options.consentVersion,
    consentBinding: options.consentBinding,
    idempotencyKey: "testimonial_no_config_edit_key",
  }), 503, "TESTIMONIAL_CONSENT_UNAVAILABLE");
  assert.equal(h.store.revisions.length, 1);
});

test("intended uniqueness recovery reads only after savepoint rollback", async () => {
  const uniqueError = Object.assign(new Error("synthetic intended uniqueness conflict"), {
    name: "SequelizeUniqueConstraintError",
    constraint: "public_testimonial_revisions_author_key",
  });
  const concurrentSubmission = {
    id: 900,
    authorUserId: 71,
    idempotencyKey: "testimonial_create_key_1",
    withdrawnAt: null,
    publicationSuspendedAt: null,
    publicationSuspensionReason: null,
    createdAt: new Date("2026-11-03T10:00:00.000Z"),
    updatedAt: new Date("2026-11-03T10:00:00.000Z"),
  };
  const concurrentRevision = {
    id: 901,
    submissionId: 900,
    authorUserId: 71,
    revisionNumber: 1,
    isCurrent: true,
    message: "Learning feels more approachable.",
    attributionMode: "named",
    publicDisplayNameSnapshot: "Ada L.",
    publicNamePreviewVersion: consentConfiguration.getOptions({
      userId: 71,
      firstName: "Ada",
      lastName: "Lovelace",
    }).publicNamePreviewVersion,
    consentVersion: "synthetic-consent-v1",
    consentedAt: new Date("2026-11-03T10:00:00.000Z"),
    idempotencyKey: "testimonial_create_key_1",
    moderationStatus: "pending",
    moderationExplanation: null,
    approvedAt: null,
    revokedAt: null,
    createdAt: new Date("2026-11-03T10:00:00.000Z"),
    updatedAt: new Date("2026-11-03T10:00:00.000Z"),
  };
  const h = createHarness({
    revisionCreateError: uniqueError,
    concurrentSubmission,
    concurrentRevision,
  });

  const retry = await namedInput(h.service);
  assert.equal(retry.changed, false);
  assert.equal(retry.testimonial.id, 900);
  assert.equal(retry.revision.id, 901);
  assert.equal(h.store.savepoints, 1);
  assert.equal(h.store.recoveryReadDuringSavepoint, false);
  assert.equal(h.store.submissions.length, 0);
  assert.equal(h.store.revisions.length, 0);
});

test("unrelated uniqueness errors propagate even when a matching operation is visible", async () => {
  const unrelatedError = Object.assign(new Error("synthetic unrelated uniqueness conflict"), {
    name: "SequelizeUniqueConstraintError",
    constraint: "unrelated_author_key",
    fields: { authorUserId: 71, idempotencyKey: "testimonial_create_key_1" },
  });
  const h = createHarness({
    revisionCreateError: unrelatedError,
    concurrentSubmission: {
      id: 900,
      authorUserId: 71,
      idempotencyKey: "testimonial_create_key_1",
      withdrawnAt: null,
      publicationSuspendedAt: null,
      publicationSuspensionReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    concurrentRevision: {
      id: 901,
      submissionId: 900,
      authorUserId: 71,
      revisionNumber: 1,
      isCurrent: true,
      message: "Learning feels more approachable.",
      attributionMode: "named",
      publicDisplayNameSnapshot: "Ada L.",
      publicNamePreviewVersion: consentConfiguration.getOptions({
        userId: 71,
        firstName: "Ada",
        lastName: "Lovelace",
      }).publicNamePreviewVersion,
      consentVersion: "synthetic-consent-v1",
      consentedAt: new Date(),
      idempotencyKey: "testimonial_create_key_1",
      moderationStatus: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await assert.rejects(namedInput(h.service), (error) => error === unrelatedError);
  assert.equal(h.store.recoveryReadDuringSavepoint, false);
});

test("editing creates sequential pending revisions, fences stale bases, and recovers suspension", async () => {
  const h = createHarness();
  const created = await namedInput(h.service);
  const editOptions = consentConfiguration.getOptions({
    userId: 71,
    firstName: "Ada",
    lastName: "Lovelace",
  });
  h.store.submissions[0].publicationSuspendedAt = new Date("2026-11-03T12:00:00.000Z");
  h.store.submissions[0].publicationSuspensionReason = "account_deactivated";
  const editInput = {
    actorId: 71,
    actorRole: "student",
    submissionId: created.testimonial.id,
    baseRevisionId: created.revision.id,
    message: "A freshly consented revision",
    attributionMode: "named",
    consent: true,
    consentVersion: editOptions.consentVersion,
    consentBinding: editOptions.consentBinding,
    publicNamePreviewVersion: editOptions.publicNamePreviewVersion,
    idempotencyKey: "testimonial_revision_key_2",
  };
  const edited = await h.service.createRevision(editInput);
  assert.equal(edited.changed, true);
  assert.equal(edited.revision.revisionNumber, 2);
  assert.equal(h.store.revisions[0].isCurrent, false);
  assert.equal(h.store.revisions[1].isCurrent, true);
  assert.equal(h.store.revisions[1].moderationStatus, "pending");
  assert.equal(h.store.submissions[0].publicationSuspendedAt, null);
  assert.equal(h.store.submissions[0].publicationSuspensionReason, null);

  const retry = await h.service.createRevision(editInput);
  assert.equal(retry.changed, false);
  assert.equal(retry.revision.id, edited.revision.id);
  const createRetry = await namedInput(h.service);
  assert.equal(createRetry.changed, false);
  assert.equal(createRetry.revision.id, created.revision.id);
  assert.equal(createRetry.testimonial.currentRevision.id, edited.revision.id);
  h.store.submissions[0].publicationSuspendedAt = new Date("2026-11-03T13:00:00.000Z");
  h.store.submissions[0].publicationSuspensionReason = "account_deactivated";
  const suspendedRetry = await h.service.createRevision(editInput);
  assert.equal(suspendedRetry.changed, false);
  assert.equal(
    h.store.submissions[0].publicationSuspendedAt.toISOString(),
    "2026-11-03T13:00:00.000Z",
  );
  await assertError(h.service.createRevision({
    ...editInput,
    idempotencyKey: "testimonial_revision_key_3",
  }), 409, "REVISION_CHANGED");
});

test("a failed revision insert rolls back current-revision and suspension changes", async () => {
  const h = createHarness();
  const created = await namedInput(h.service);
  h.store.submissions[0].publicationSuspendedAt = new Date("2026-11-03T12:00:00.000Z");
  h.store.submissions[0].publicationSuspensionReason = "account_deactivated";
  h.store.failRevisionCreate = true;
  await assert.rejects(h.service.createRevision({
    actorId: 71,
    actorRole: "student",
    submissionId: created.testimonial.id,
    baseRevisionId: created.revision.id,
    message: "Will roll back",
    attributionMode: "anonymous",
    consent: true,
    consentVersion: "synthetic-consent-v1",
    consentBinding: consentConfiguration.getOptions({
      userId: 71,
      firstName: "Ada",
      lastName: "Lovelace",
    }).consentBinding,
    idempotencyKey: "testimonial_revision_key_rollback",
  }), /synthetic revision failure/);
  assert.equal(h.store.revisions.length, 1);
  assert.equal(h.store.revisions[0].isCurrent, true);
  assert.equal(
    h.store.submissions[0].publicationSuspendedAt.toISOString(),
    "2026-11-03T12:00:00.000Z",
  );
  assert.equal(h.store.submissions[0].publicationSuspensionReason, "account_deactivated");
});

test("withdrawal is terminal and idempotent while prior revisions remain retained", async () => {
  const h = createHarness();
  const created = await namedInput(h.service);
  const withdrawn = await h.service.withdrawTestimonial({
    actorId: 71,
    actorRole: "student",
    submissionId: created.testimonial.id,
  });
  assert.equal(withdrawn.changed, true);
  assert.ok(withdrawn.testimonial.withdrawnAt);
  const retry = await h.service.withdrawTestimonial({
    actorId: 71,
    actorRole: "student",
    submissionId: created.testimonial.id,
  });
  assert.equal(retry.changed, false);
  assert.equal(h.store.revisions.length, 1);
  await assertError(h.service.createRevision({
    actorId: 71,
    actorRole: "student",
    submissionId: created.testimonial.id,
    baseRevisionId: created.revision.id,
    message: "Cannot restore",
    attributionMode: "anonymous",
    consent: true,
    consentVersion: "synthetic-consent-v1",
    consentBinding: consentConfiguration.getOptions({
      userId: 71,
      firstName: "Ada",
      lastName: "Lovelace",
    }).consentBinding,
    idempotencyKey: "testimonial_revision_key_4",
  }), 409, "TESTIMONIAL_WITHDRAWN");
});

test("detail mutations enforce exact ownership before operation-key disclosure", async () => {
  const h = createHarness();
  h.store.submissions.push({
    id: 99,
    authorUserId: 72,
    idempotencyKey: "other_author_create_key",
    withdrawnAt: null,
    publicationSuspendedAt: null,
    publicationSuspensionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await assertError(h.service.createRevision({
    actorId: 71,
    actorRole: "student",
    submissionId: 99,
    baseRevisionId: 100,
    message: "Scope substitution",
    attributionMode: "anonymous",
    consent: true,
    consentVersion: "synthetic-consent-v1",
    consentBinding: consentConfiguration.getOptions({
      userId: 71,
      firstName: "Ada",
      lastName: "Lovelace",
    }).consentBinding,
    idempotencyKey: "other_author_revision_key",
  }), 404, "NOT_FOUND");
  await assertError(h.service.withdrawTestimonial({
    actorId: 71,
    actorRole: "student",
    submissionId: 99,
  }), 404, "NOT_FOUND");
});
