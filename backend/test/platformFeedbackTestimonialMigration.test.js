const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { Client } = require("pg");
const {
  emitWorkerCompletionAcknowledgement,
  runPostgresWorker,
} = require("./support/postgresWorkerHarness");

const models = require("../src/models");
const appSequelize = require("../src/config/database");
const {
  FEEDBACK_TESTIMONIAL_CONSENT_BINDING_PATTERN,
  FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN,
  FEEDBACK_TESTIMONIAL_LIMITS,
  normalizeFeedbackTestimonialText,
  TESTIMONIAL_ATTRIBUTION_MODES,
  TESTIMONIAL_MODERATION_STATUSES,
  TESTIMONIAL_SUSPENSION_REASONS,
} = require("../src/constants/feedbackTestimonialConfig");
const { migrations, runMigrations } = require("../src/services/migrationService");

const migrationName = "20261103000000_platform_feedback_testimonials";
const migrationPath = path.resolve(
  __dirname,
  `../../supabase/migrations/${migrationName}.sql`,
);

const STORAGE_POSTGRES_ROLE = "sharprunner_phase8_feedback_rehearsal_app";
const STORAGE_POSTGRES_MARKER =
  "SharpRunner disposable Phase 8 feedback testimonial storage rehearsal";
const STORAGE_POSTGRES_WORKER_ENV = "FEEDBACK_TESTIMONIAL_STORAGE_POSTGRES_WORKER";
const STORAGE_POSTGRES_SELECTOR_ENV = "FEEDBACK_TESTIMONIAL_STORAGE_PATH";
const STORAGE_POSTGRES_INCOMPATIBLE_RERUN1_OPT_IN_ENV =
  "RUN_FEEDBACK_TESTIMONIAL_STORAGE_INCOMPATIBLE_RERUN1_POSTGRES";
const STORAGE_POSTGRES_INCOMPATIBLE_RERUN2_OPT_IN_ENV =
  "RUN_FEEDBACK_TESTIMONIAL_STORAGE_INCOMPATIBLE_RERUN2_POSTGRES";
const STORAGE_POSTGRES_URL_CONTRACT_ENV = "FEEDBACK_TESTIMONIAL_STORAGE_URL_CONTRACT";
const STORAGE_POSTGRES_URL_CONTRACT_PASSWORD_ENV =
  "FEEDBACK_TESTIMONIAL_STORAGE_URL_CONTRACT_PASSWORD";
const STORAGE_POSTGRES_WORKER_SUITE = "feedback-testimonial-storage";
const STORAGE_POSTGRES_SCENARIOS = Object.freeze([
  "fresh-schema-migration",
  "sync-created-schema-migration",
  "incompatible-schema-rollback",
]);
const SYNC_SCHEMA_WORKER_ENV = "FEEDBACK_TESTIMONIAL_SYNC_SCHEMA_WORKER";
const SYNC_SCHEMA_WORKER_SUITE = "feedback-testimonial-sync-schema";
const STORAGE_POSTGRES_TARGETS = Object.freeze({
  fresh: Object.freeze({
    environmentName: "FEEDBACK_TESTIMONIAL_STORAGE_FRESH_DATABASE_URL",
    databaseName: "sharprunner_feedback_testimonial_storage_fresh_rehearsal",
  }),
  sync: Object.freeze({
    environmentName: "FEEDBACK_TESTIMONIAL_STORAGE_SYNC_DATABASE_URL",
    databaseName: "sharprunner_feedback_testimonial_storage_sync_rehearsal",
  }),
  incompatible: Object.freeze({
    environmentName: "FEEDBACK_TESTIMONIAL_STORAGE_INCOMPATIBLE_DATABASE_URL",
    databaseName: "sharprunner_feedback_testimonial_storage_incompatible_rehearsal",
  }),
});
const STORAGE_POSTGRES_INCOMPATIBLE_RERUN1_TARGET = Object.freeze({
  environmentName: "FEEDBACK_TESTIMONIAL_STORAGE_INCOMPATIBLE_RERUN1_DATABASE_URL",
  databaseName: "sharprunner_feedback_testimonial_storage_incompatible_rerun1",
});
const STORAGE_POSTGRES_INCOMPATIBLE_RERUN2_TARGET = Object.freeze({
  environmentName: "FEEDBACK_TESTIMONIAL_STORAGE_INCOMPATIBLE_RERUN2_DATABASE_URL",
  databaseName: "sharprunner_feedback_testimonial_storage_incompatible_rerun2",
});
const STORAGE_POSTGRES_INCOMPATIBLE_RERUNS = Object.freeze([
  Object.freeze({
    optInEnvironmentName: STORAGE_POSTGRES_INCOMPATIBLE_RERUN1_OPT_IN_ENV,
    target: STORAGE_POSTGRES_INCOMPATIBLE_RERUN1_TARGET,
  }),
  Object.freeze({
    optInEnvironmentName: STORAGE_POSTGRES_INCOMPATIBLE_RERUN2_OPT_IN_ENV,
    target: STORAGE_POSTGRES_INCOMPATIBLE_RERUN2_TARGET,
  }),
]);
const STORAGE_POSTGRES_SCENARIO_BY_SELECTOR = Object.freeze({
  fresh: STORAGE_POSTGRES_SCENARIOS[0],
  sync: STORAGE_POSTGRES_SCENARIOS[1],
  incompatible: STORAGE_POSTGRES_SCENARIOS[2],
});

const parseStoragePostgresUrl = (value, target) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${target.environmentName} must be a valid PostgreSQL URL`);
  }
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) {
    throw new Error(`${target.environmentName} must use PostgreSQL`);
  }
  if (!["127.0.0.1", "[::1]"].includes(parsed.hostname)) {
    throw new Error(`${target.environmentName} must use a literal loopback host`);
  }
  const hasSupportedSearch = parsed.search === "" || parsed.search === "?connect_timeout=5";
  if (parsed.pathname !== `/${target.databaseName}` || !hasSupportedSearch || parsed.hash) {
    throw new Error(`${target.environmentName} must target the exact dedicated database`);
  }
  return value;
};

const resolveStoragePostgresConfiguration = (environment) => {
  const optIn = environment.RUN_FEEDBACK_TESTIMONIAL_STORAGE_POSTGRES;
  const selector = environment[STORAGE_POSTGRES_SELECTOR_ENV];
  const suppliedTargets = Object.values(STORAGE_POSTGRES_TARGETS)
    .filter(({ environmentName }) => environment[environmentName] !== undefined);
  const suppliedReruns = STORAGE_POSTGRES_INCOMPATIBLE_RERUNS.filter((rerun) => (
    environment[rerun.optInEnvironmentName] !== undefined
      || environment[rerun.target.environmentName] !== undefined
  ));
  const hasNormalConfiguration = optIn !== undefined
    || selector !== undefined
    || suppliedTargets.length > 0
    || environment.FEEDBACK_TESTIMONIAL_STORAGE_DATABASE_URL !== undefined;
  const hasRerunConfiguration = suppliedReruns.length > 0;
  if (hasNormalConfiguration && hasRerunConfiguration) {
    throw new Error("normal and incompatible rerun PostgreSQL configurations are exclusive");
  }
  if (hasRerunConfiguration) {
    if (suppliedReruns.length !== 1) {
      throw new Error("incompatible rerun PostgreSQL configuration must select one fixed target");
    }
    const rerun = suppliedReruns[0];
    const rerunOptIn = environment[rerun.optInEnvironmentName];
    const rerunUrl = environment[rerun.target.environmentName];
    if (rerunOptIn !== "1" || rerunUrl === undefined) {
      throw new Error("incompatible rerun PostgreSQL configuration is partial");
    }
    return {
      selector: "incompatible",
      target: {
        ...rerun.target,
        databaseUrl: parseStoragePostgresUrl(
          rerunUrl,
          rerun.target,
        ),
        roleName: STORAGE_POSTGRES_ROLE,
        marker: STORAGE_POSTGRES_MARKER,
      },
      rerun: true,
      optInEnvironmentName: rerun.optInEnvironmentName,
    };
  }
  if (environment.FEEDBACK_TESTIMONIAL_STORAGE_DATABASE_URL !== undefined) {
    throw new Error("the legacy feedback/testimonial PostgreSQL target is not accepted");
  }
  if (optIn === undefined && selector === undefined && suppliedTargets.length === 0) return null;
  if (optIn !== "1") {
    throw new Error("feedback/testimonial PostgreSQL configuration is partial");
  }
  if (!Object.prototype.hasOwnProperty.call(STORAGE_POSTGRES_TARGETS, selector)) {
    throw new Error("feedback/testimonial PostgreSQL selector must be fresh, sync, or incompatible");
  }
  const selectedTarget = STORAGE_POSTGRES_TARGETS[selector];
  if (suppliedTargets.length !== 1 || suppliedTargets[0] !== selectedTarget) {
    throw new Error("feedback/testimonial PostgreSQL configuration must include only the selected URL");
  }
  return {
    selector,
    target: {
      ...selectedTarget,
      databaseUrl: parseStoragePostgresUrl(
        environment[selectedTarget.environmentName],
        selectedTarget,
      ),
      roleName: STORAGE_POSTGRES_ROLE,
      marker: STORAGE_POSTGRES_MARKER,
    },
  };
};

const assertStoragePostgresIdentity = (identity, expected) => {
  assert.ok(identity && typeof identity === "object", "database identity is required");
  assert.ok(
    ["127.0.0.1", "::1"].includes(identity.server_address),
    "database identity must report an exact loopback address",
  );
  assert.equal(identity.database_name, expected.databaseName, "database identity mismatch");
  assert.equal(identity.current_role, expected.roleName, "database role identity mismatch");
  assert.equal(identity.database_owner, expected.roleName, "database owner identity mismatch");
  assert.equal(identity.database_marker, expected.marker, "database marker identity mismatch");
  assert.equal(identity.role_superuser, false, "rehearsal role must not be superuser");
  assert.equal(identity.role_create_db, false, "rehearsal role must not create databases");
  assert.equal(identity.role_create_role, false, "rehearsal role must not create roles");
  assert.equal(identity.role_bypass_rls, false, "rehearsal role must not bypass RLS");
  assert.equal(identity.role_inherit, false, "rehearsal role must not inherit privileges");
  assert.equal(identity.role_membership_count, 0, "rehearsal role must have no memberships");
};

const validPlatformFeedback = {
  authorUserId: 11,
  message: "The platform helped me practice consistently.",
  idempotencyKey: "platform_feedback_001",
};

const validSubmission = {
  authorUserId: 11,
  idempotencyKey: "testimonial_submission_001",
};

const validRevision = {
  submissionId: 21,
  authorUserId: 11,
  revisionNumber: 1,
  isCurrent: true,
  message: "I learned how to solve problems step by step.",
  attributionMode: "named",
  publicDisplayNameSnapshot: "Ada L.",
  publicNamePreviewVersion: "preview_version_001",
  consentVersion: "consent_version_001",
  consentedAt: new Date("2026-11-03T00:00:00.000Z"),
  idempotencyKey: "testimonial_revision_001",
  moderationStatus: "pending",
};

const rejectField = async (Model, values, field) => {
  await assert.rejects(
    Model.build(values).validate(),
    (error) => error?.errors?.some((item) => item.path === field),
    `${field} must fail validation`,
  );
};

test("feedback/testimonial constants retain established message and key boundaries", () => {
  assert.deepEqual(FEEDBACK_TESTIMONIAL_LIMITS, {
    messageLength: 1000,
    idempotencyKeyLength: 96,
    moderationExplanationLength: 500,
    consentVersionLength: 64,
    publicNamePreviewVersionLength: 96,
    publicDisplayNameLength: 300,
    suspensionReasonLength: 40,
    consentTextLength: 2000,
  });
  assert.equal(FEEDBACK_TESTIMONIAL_CONSENT_BINDING_PATTERN.source, "^[A-Za-z0-9_-]{43}$");
  assert.equal(FEEDBACK_TESTIMONIAL_IDEMPOTENCY_KEY_PATTERN.source, "^[A-Za-z0-9_-]{8,96}$");
  assert.deepEqual(TESTIMONIAL_ATTRIBUTION_MODES, ["named", "anonymous"]);
  assert.deepEqual(TESTIMONIAL_MODERATION_STATUSES, ["pending", "approved", "rejected", "revoked"]);
  assert.deepEqual(TESTIMONIAL_SUSPENSION_REASONS, ["account_deactivated"]);
  assert.equal(Object.isFrozen(FEEDBACK_TESTIMONIAL_LIMITS), true);
  assert.equal(Object.prototype.hasOwnProperty.call(
    require("../src/constants/feedbackTestimonialConfig"),
    "CURRENT_TESTIMONIAL_CONSENT_VERSION",
  ), false);
});

test("private platform feedback trims and validates required Unicode-aware fields", async () => {
  const { PlatformFeedbackSubmission } = models;
  assert.ok(PlatformFeedbackSubmission);

  const record = PlatformFeedbackSubmission.build({
    ...validPlatformFeedback,
    message: "  Useful private feedback.  ",
  });
  await record.validate();
  assert.equal(record.message, "Useful private feedback.");

  for (const field of ["authorUserId", "message", "idempotencyKey"]) {
    const values = { ...validPlatformFeedback };
    delete values[field];
    await rejectField(PlatformFeedbackSubmission, values, field);
  }
  await assert.rejects(
    PlatformFeedbackSubmission.build({ ...validPlatformFeedback, message: "   " }).validate(),
    /message/i,
  );
  await assert.doesNotReject(
    PlatformFeedbackSubmission.build({ ...validPlatformFeedback, message: "🙂".repeat(1000) }).validate(),
  );
  await assert.rejects(
    PlatformFeedbackSubmission.build({ ...validPlatformFeedback, message: "🙂".repeat(1001) }).validate(),
    /message/i,
  );
  for (const idempotencyKey of ["short", "invalid key", "x".repeat(97)]) {
    await assert.rejects(
      PlatformFeedbackSubmission.build({ ...validPlatformFeedback, idempotencyKey }).validate(),
      /idempotencyKey/i,
    );
  }
});

test("feedback/testimonial text normalization matches JavaScript boundary whitespace", async () => {
  const boundaryWhitespace = [
    " ",
    "\t",
    "\r\n",
    "\u00a0",
    "\u1680",
    "\u2003",
    "\u2028",
    "\u2029",
    "\u202f",
    "\u205f",
    "\u3000",
    "\ufeff",
  ].join("");
  const internal = "First line\n\tSecond\u00a0line";
  assert.equal(
    normalizeFeedbackTestimonialText(`${boundaryWhitespace}${internal}${boundaryWhitespace}`),
    internal,
  );
  assert.equal(normalizeFeedbackTestimonialText(null), null);

  const platformRecord = models.PlatformFeedbackSubmission.build({
    ...validPlatformFeedback,
    message: `${boundaryWhitespace}${internal}${boundaryWhitespace}`,
  });
  await platformRecord.validate();
  assert.equal(platformRecord.message, internal);

  const rejectedRevision = models.PublicTestimonialRevision.build({
    ...validRevision,
    moderationStatus: "rejected",
    rejectedByUserId: 3,
    rejectedAt: new Date("2026-11-03T01:00:00.000Z"),
    moderationExplanation: `${boundaryWhitespace}Keep\nthis internal break.${boundaryWhitespace}`,
  });
  await rejectedRevision.validate();
  assert.equal(rejectedRevision.moderationExplanation, "Keep\nthis internal break.");

  for (const whitespace of ["\t\r\n", "\u00a0\u2003\ufeff"]) {
    await assert.rejects(
      models.PlatformFeedbackSubmission.build({
        ...validPlatformFeedback,
        message: whitespace,
      }).validate(),
      /message/i,
    );
    await assert.rejects(
      models.PublicTestimonialRevision.build({
        ...validRevision,
        moderationStatus: "rejected",
        rejectedByUserId: 3,
        rejectedAt: new Date("2026-11-03T01:00:00.000Z"),
        moderationExplanation: whitespace,
      }).validate(),
      /moderation|explanation/i,
    );
  }

  const unicodeCharacter = "\u{1f642}";
  await assert.doesNotReject(models.PlatformFeedbackSubmission.build({
    ...validPlatformFeedback,
    message: `${boundaryWhitespace}${unicodeCharacter.repeat(1000)}${boundaryWhitespace}`,
  }).validate());
  await assert.rejects(models.PlatformFeedbackSubmission.build({
    ...validPlatformFeedback,
    message: `${boundaryWhitespace}${unicodeCharacter.repeat(1001)}${boundaryWhitespace}`,
  }).validate(), /message/i);
});

test("testimonial submission validates keys and suspension field pairing", async () => {
  const { PublicTestimonialSubmission } = models;
  assert.ok(PublicTestimonialSubmission);
  await assert.doesNotReject(PublicTestimonialSubmission.build(validSubmission).validate());

  for (const field of ["authorUserId", "idempotencyKey"]) {
    const values = { ...validSubmission };
    delete values[field];
    await rejectField(PublicTestimonialSubmission, values, field);
  }
  await assert.doesNotReject(PublicTestimonialSubmission.build({
    ...validSubmission,
    publicationSuspendedAt: new Date(),
    publicationSuspensionReason: "account_deactivated",
  }).validate());
  for (const values of [
    { publicationSuspendedAt: new Date(), publicationSuspensionReason: null },
    { publicationSuspendedAt: null, publicationSuspensionReason: "account_deactivated" },
    { publicationSuspendedAt: new Date(), publicationSuspensionReason: "other" },
  ]) {
    await assert.rejects(
      PublicTestimonialSubmission.build({ ...validSubmission, ...values }).validate(),
      /suspension/i,
    );
  }

});

test("testimonial revision validates named/anonymous evidence and moderation metadata states", async () => {
  const { PublicTestimonialRevision } = models;
  assert.ok(PublicTestimonialRevision);
  await assert.doesNotReject(PublicTestimonialRevision.build(validRevision).validate());
  await assert.doesNotReject(PublicTestimonialRevision.build({
    ...validRevision,
    attributionMode: "anonymous",
    publicDisplayNameSnapshot: null,
    publicNamePreviewVersion: null,
  }).validate());
  await assert.doesNotReject(PublicTestimonialRevision.build({
    ...validRevision,
    message: "🙂".repeat(1000),
    publicDisplayNameSnapshot: "N".repeat(300),
    publicNamePreviewVersion: "p".repeat(96),
    consentVersion: "c".repeat(64),
  }).validate());
  for (const values of [
    { message: "🙂".repeat(1001) },
    { publicDisplayNameSnapshot: "N".repeat(301) },
    { publicNamePreviewVersion: "p".repeat(97) },
    { consentVersion: "c".repeat(65) },
  ]) {
    await assert.rejects(
      PublicTestimonialRevision.build({ ...validRevision, ...values }).validate(),
      /message|publicDisplayNameSnapshot|publicNamePreviewVersion|consentVersion/i,
    );
  }

  for (const field of [
    "submissionId",
    "authorUserId",
    "revisionNumber",
    "isCurrent",
    "message",
    "attributionMode",
    "consentVersion",
    "consentedAt",
    "idempotencyKey",
  ]) {
    const values = { ...validRevision };
    delete values[field];
    await rejectField(PublicTestimonialRevision, values, field);
  }

  for (const values of [
    { revisionNumber: 0 },
    { revisionNumber: 1.5 },
    { attributionMode: "public" },
    { attributionMode: "named", publicDisplayNameSnapshot: null },
    { attributionMode: "named", publicNamePreviewVersion: null },
    { attributionMode: "anonymous", publicDisplayNameSnapshot: "Ada L.", publicNamePreviewVersion: null },
    { attributionMode: "anonymous", publicDisplayNameSnapshot: null, publicNamePreviewVersion: "preview" },
    { consentVersion: "   " },
    { moderationStatus: "pending", approvedByUserId: 3, approvedAt: new Date() },
    { moderationStatus: "approved" },
    { moderationStatus: "approved", approvedByUserId: 3, approvedAt: new Date(), moderationExplanation: "No" },
    { moderationStatus: "rejected", rejectedByUserId: 3, rejectedAt: new Date(), moderationExplanation: null },
    { moderationStatus: "revoked", approvedByUserId: 3, approvedAt: new Date(), revokedByUserId: 4, revokedAt: new Date(), moderationExplanation: null },
  ]) {
    await assert.rejects(
      PublicTestimonialRevision.build({ ...validRevision, ...values }).validate(),
      /revision|attribution|consent|moderation|explanation/i,
    );
  }

  const approvedAt = new Date("2026-11-03T00:00:00.000Z");
  await assert.doesNotReject(PublicTestimonialRevision.build({
    ...validRevision,
    moderationStatus: "approved",
    approvedByUserId: 3,
    approvedAt,
  }).validate());
  await assert.doesNotReject(PublicTestimonialRevision.build({
    ...validRevision,
    moderationStatus: "rejected",
    rejectedByUserId: 3,
    rejectedAt: new Date(),
    moderationExplanation: "Please remove the private detail.",
  }).validate());
  await assert.doesNotReject(PublicTestimonialRevision.build({
    ...validRevision,
    moderationStatus: "revoked",
    approvedByUserId: 3,
    approvedAt,
    revokedByUserId: 4,
    revokedAt: new Date("2026-11-03T01:00:00.000Z"),
    moderationExplanation: "No longer suitable for public display.",
  }).validate());
});

test("feedback/testimonial models expose retained-history associations and exact indexes", () => {
  const {
    PlatformFeedbackSubmission,
    PublicTestimonialRevision,
    PublicTestimonialSubmission,
    StudentClassroomFeedback,
    User,
  } = models;

  assert.equal(User.associations.platformFeedbackSubmissions.target, PlatformFeedbackSubmission);
  assert.equal(User.associations.platformFeedbackSubmissions.options.onDelete, "RESTRICT");
  assert.equal(PlatformFeedbackSubmission.associations.author.as, "author");
  assert.equal(User.associations.publicTestimonialSubmissions.target, PublicTestimonialSubmission);
  assert.equal(PublicTestimonialSubmission.associations.author.options.onDelete, "RESTRICT");
  assert.equal(PublicTestimonialSubmission.associations.revisions.target, PublicTestimonialRevision);
  assert.equal(PublicTestimonialSubmission.associations.revisions.options.onDelete, "RESTRICT");
  assert.equal(PublicTestimonialRevision.associations.submission.options.onDelete, "RESTRICT");
  for (const association of ["author", "approvedBy", "rejectedBy", "revokedBy"]) {
    assert.equal(PublicTestimonialRevision.associations[association].options.onDelete, "RESTRICT");
  }

  assert.ok(PlatformFeedbackSubmission.options.indexes.some((index) => (
    index.name === "platform_feedback_submissions_author_key"
      && index.unique === true
      && index.fields.join(",") === "authorUserId,idempotencyKey"
  )));
  assert.ok(PublicTestimonialSubmission.options.indexes.some((index) => (
    index.name === "public_testimonial_submissions_id_author"
      && index.unique === true
      && index.fields.join(",") === "id,authorUserId"
  )));
  assert.ok(PublicTestimonialRevision.options.indexes.some((index) => (
    index.name === "public_testimonial_revisions_one_current"
      && index.unique === true
      && index.where?.isCurrent === true
  )));
  assert.equal(StudentClassroomFeedback.rawAttributes.studentId.allowNull, false);
  assert.equal(StudentClassroomFeedback.rawAttributes.classroomId.allowNull, false);
  assert.equal(StudentClassroomFeedback.rawAttributes.authorUserId, undefined);
});

test("feedback/testimonial migration is forward-only, registered last, and privacy-safe", async () => {
  assert.equal(fs.existsSync(migrationPath), true, "storage migration SQL must exist");
  const sql = fs.readFileSync(migrationPath, "utf8");
  const names = migrations.map(([name]) => name);
  const migrationIndex = names.indexOf(migrationName);

  assert.equal(names.filter((name) => name === migrationName).length, 1);
  assert.equal(migrationIndex, names.length - 1);
  assert.equal(names[migrationIndex - 1], "20261031120000_game_interruption_report_index");
  assert.match(sql, /^\s*(?:--[^\n]*\n)*\s*BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  for (const table of [
    "PlatformFeedbackSubmissions",
    "PublicTestimonialSubmissions",
    "PublicTestimonialRevisions",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
    assert.match(sql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`REVOKE ALL PRIVILEGES ON TABLE "${table}" FROM PUBLIC`));
  }
  for (const index of [
    "platform_feedback_submissions_author_key",
    "platform_feedback_submissions_author_created_id",
    "platform_feedback_submissions_admin_created_id",
    "public_testimonial_submissions_author_key",
    "public_testimonial_submissions_id_author",
    "public_testimonial_submissions_author_created_id",
    "public_testimonial_revisions_submission_revision",
    "public_testimonial_revisions_author_key",
    "public_testimonial_revisions_one_current",
    "public_testimonial_revisions_submission_history",
    "public_testimonial_revisions_moderation_queue",
    "public_testimonial_revisions_public_order",
  ]) assert.match(sql, new RegExp(`"${index}"`));
  assert.match(sql, /FOREIGN KEY \("submissionId", "authorUserId"\)[\s\S]*ON DELETE RESTRICT/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION enforce_public_testimonial_submission_transitions\(\)/);
  assert.match(sql, /CREATE TRIGGER public_testimonial_submissions_enforce_transitions/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION enforce_public_testimonial_revision_transitions\(\)/);
  assert.match(sql, /CREATE TRIGGER public_testimonial_revisions_enforce_transitions/);
  assert.match(sql, /ARRAY\['anon', 'authenticated'\]/);
  assert.match(sql, /feedback_testimonial_column_types/);
  assert.match(sql, /feedback_testimonial_preexisting_column_shape/);
  assert.match(sql, /feedback_testimonial_constraint_definitions/);
  assert.match(sql, /feedback_testimonial_index_definitions/);
  assert.match(sql, /pg_constraint[\s\S]*convalidated/);
  assert.match(sql, /pg_index[\s\S]*indisunique[\s\S]*indpred/);
  assert.match(sql, /regexp_replace\("message",\s*U&'/);
  assert.match(sql, /"message"\s*=\s*regexp_replace\("message"/);
  assert.match(sql, /"moderationExplanation"\s*=\s*regexp_replace\("moderationExplanation"/);
  assert.match(sql, /public_testimonial_revisions_moderation_valid/);
  assert.doesNotMatch(sql, /StudentClassroomFeedbacks|SECURITY\s+DEFINER/i);
  assert.doesNotMatch(sql, /ON DELETE CASCADE|ON DELETE SET NULL/i);
  assert.doesNotMatch(sql, /TRUNCATE|DELETE\s+FROM|DROP\s+TABLE|DROP\s+COLUMN/i);

  const testRunner = fs.readFileSync(path.resolve(__dirname, "runTests.js"), "utf8");
  assert.equal(
    (testRunner.match(/require\("\.\/platformFeedbackTestimonialMigration\.test"\);/g) || []).length,
    1,
    "the normal backend runner must register this test exactly once",
  );

  const originalQuery = appSequelize.query;
  const queries = [];
  appSequelize.query = async (statement) => { queries.push(statement); };
  try {
    await migrations[migrationIndex][1]();
  } finally {
    appSequelize.query = originalQuery;
  }
  assert.deepEqual(queries, [sql]);
});

test("feedback/testimonial PostgreSQL guards fail closed for partial or ambiguous targets", () => {
  assert.equal(resolveStoragePostgresConfiguration({}), null);

  for (const environment of [
    { RUN_FEEDBACK_TESTIMONIAL_STORAGE_POSTGRES: "1" },
    { FEEDBACK_TESTIMONIAL_STORAGE_PATH: "fresh" },
    { FEEDBACK_TESTIMONIAL_STORAGE_FRESH_DATABASE_URL: "postgresql://127.0.0.1/unused" },
    { FEEDBACK_TESTIMONIAL_STORAGE_DATABASE_URL: "postgresql://127.0.0.1/unused" },
    {
      RUN_FEEDBACK_TESTIMONIAL_STORAGE_POSTGRES: "1",
      FEEDBACK_TESTIMONIAL_STORAGE_PATH: "fresh",
    },
    {
      RUN_FEEDBACK_TESTIMONIAL_STORAGE_POSTGRES: "1",
      FEEDBACK_TESTIMONIAL_STORAGE_PATH: "unknown",
      FEEDBACK_TESTIMONIAL_STORAGE_FRESH_DATABASE_URL:
        "postgresql://127.0.0.1/sharprunner_feedback_testimonial_storage_fresh_rehearsal",
    },
    {
      RUN_FEEDBACK_TESTIMONIAL_STORAGE_POSTGRES: "1",
      FEEDBACK_TESTIMONIAL_STORAGE_PATH: "fresh",
      FEEDBACK_TESTIMONIAL_STORAGE_SYNC_DATABASE_URL:
        "postgresql://127.0.0.1/sharprunner_feedback_testimonial_storage_sync_rehearsal",
    },
    {
      RUN_FEEDBACK_TESTIMONIAL_STORAGE_POSTGRES: "1",
      FEEDBACK_TESTIMONIAL_STORAGE_PATH: "fresh",
      FEEDBACK_TESTIMONIAL_STORAGE_FRESH_DATABASE_URL:
        "postgresql://127.0.0.1/sharprunner_feedback_testimonial_storage_fresh_rehearsal",
      FEEDBACK_TESTIMONIAL_STORAGE_SYNC_DATABASE_URL:
        "postgresql://127.0.0.1/sharprunner_feedback_testimonial_storage_sync_rehearsal",
    },
  ]) {
    assert.throws(() => resolveStoragePostgresConfiguration(environment), /configuration|URL|legacy|selector/i);
  }

  for (const [selector, hostname] of [
    ["fresh", "127.0.0.1"],
    ["sync", "[::1]"],
    ["incompatible", "127.0.0.1"],
  ]) {
    const target = STORAGE_POSTGRES_TARGETS[selector];
    const configuration = resolveStoragePostgresConfiguration({
      RUN_FEEDBACK_TESTIMONIAL_STORAGE_POSTGRES: "1",
      FEEDBACK_TESTIMONIAL_STORAGE_PATH: selector,
      [target.environmentName]:
        `postgresql://synthetic:reserved%3A%40%2F%3F%23@${hostname}:5432/`
        + `${target.databaseName}?connect_timeout=5`,
    });
    assert.equal(configuration.selector, selector);
    assert.equal(configuration.target.databaseName, target.databaseName);
    assert.deepEqual(Object.keys(configuration), ["selector", "target"]);
  }

  for (const invalidUrl of [
    "postgresql://localhost/sharprunner_feedback_testimonial_storage_fresh_rehearsal",
    "postgresql://192.0.2.10/sharprunner_feedback_testimonial_storage_fresh_rehearsal",
    "postgresql://127.0.0.1/sharprunner_browser_test",
    "postgresql://127.0.0.1/sharprunner_feedback_testimonial_storage_fresh_rehearsal?connect_timeout=4",
    "postgresql://127.0.0.1/sharprunner_feedback_testimonial_storage_fresh_rehearsal?connect_timeout=5&extra=1",
  ]) {
    assert.throws(() => resolveStoragePostgresConfiguration({
      RUN_FEEDBACK_TESTIMONIAL_STORAGE_POSTGRES: "1",
      FEEDBACK_TESTIMONIAL_STORAGE_PATH: "fresh",
      FEEDBACK_TESTIMONIAL_STORAGE_FRESH_DATABASE_URL: invalidUrl,
    }), /literal loopback|database/i);
  }
});

test("incompatible rerun configuration accepts only the fixed rerun1 target", () => {
  const target = STORAGE_POSTGRES_INCOMPATIBLE_RERUN1_TARGET;
  const configuration = resolveStoragePostgresConfiguration({
    [STORAGE_POSTGRES_INCOMPATIBLE_RERUN1_OPT_IN_ENV]: "1",
    [target.environmentName]:
      `postgresql://synthetic:reserved%3A%40%2F%3F%23@127.0.0.1:5432/`
      + `${target.databaseName}?connect_timeout=5`,
  });
  assert.equal(configuration.selector, "incompatible");
  assert.equal(configuration.rerun, true);
  assert.equal(configuration.target.databaseName, target.databaseName);

  for (const databaseName of [
    "sharprunner_feedback_testimonial_storage_incompatible_rehearsal",
    "sharprunner_feedback_testimonial_storage_incompatible_arbitrary",
  ]) {
    assert.throws(() => resolveStoragePostgresConfiguration({
      [STORAGE_POSTGRES_INCOMPATIBLE_RERUN1_OPT_IN_ENV]: "1",
      [target.environmentName]:
        `postgresql://synthetic:reserved@127.0.0.1:5432/${databaseName}?connect_timeout=5`,
    }), /exact dedicated database/i);
  }

  for (const environment of [
    { [STORAGE_POSTGRES_INCOMPATIBLE_RERUN1_OPT_IN_ENV]: "1" },
    { [target.environmentName]: `postgresql://127.0.0.1/${target.databaseName}` },
    {
      [STORAGE_POSTGRES_INCOMPATIBLE_RERUN1_OPT_IN_ENV]: "1",
      [target.environmentName]: `postgresql://127.0.0.1/${target.databaseName}`,
      RUN_FEEDBACK_TESTIMONIAL_STORAGE_POSTGRES: "1",
      FEEDBACK_TESTIMONIAL_STORAGE_PATH: "incompatible",
      FEEDBACK_TESTIMONIAL_STORAGE_INCOMPATIBLE_DATABASE_URL:
        "postgresql://127.0.0.1/sharprunner_feedback_testimonial_storage_incompatible_rehearsal",
    },
  ]) {
    assert.throws(
      () => resolveStoragePostgresConfiguration(environment),
      /partial|exclusive|configuration/i,
    );
  }
});

test("incompatible rerun2 configuration selects only incompatible and rejects every other target", () => {
  const target = STORAGE_POSTGRES_INCOMPATIBLE_RERUN2_TARGET;
  const configuration = resolveStoragePostgresConfiguration({
    [STORAGE_POSTGRES_INCOMPATIBLE_RERUN2_OPT_IN_ENV]: "1",
    [target.environmentName]:
      `postgresql://synthetic:reserved%3A%40%2F%3F%23@127.0.0.1:5432/`
      + `${target.databaseName}?connect_timeout=5`,
  });
  assert.equal(configuration.selector, "incompatible");
  assert.equal(configuration.rerun, true);
  assert.equal(configuration.target.databaseName, target.databaseName);

  for (const databaseName of [
    "sharprunner_feedback_testimonial_storage_incompatible_rehearsal",
    "sharprunner_feedback_testimonial_storage_incompatible_rerun1",
    "sharprunner_feedback_testimonial_storage_incompatible_arbitrary",
  ]) {
    assert.throws(() => resolveStoragePostgresConfiguration({
      [STORAGE_POSTGRES_INCOMPATIBLE_RERUN2_OPT_IN_ENV]: "1",
      [target.environmentName]:
        `postgresql://synthetic:reserved@127.0.0.1:5432/${databaseName}?connect_timeout=5`,
    }), /exact dedicated database/i);
  }
});

test("PowerShell helper URLs satisfy the selected storage parser contract", {
  skip: process.env[STORAGE_POSTGRES_URL_CONTRACT_ENV] === undefined,
}, () => {
  const contracts = JSON.parse(process.env[STORAGE_POSTGRES_URL_CONTRACT_ENV]);
  const expectedPassword = process.env[STORAGE_POSTGRES_URL_CONTRACT_PASSWORD_ENV];
  assert.equal(typeof expectedPassword, "string");
  assert.deepEqual(contracts.map(({ selector }) => selector), [
    "fresh",
    "sync",
    "incompatible",
  ]);

  for (const { selector, databaseUrl } of contracts) {
    const target = STORAGE_POSTGRES_TARGETS[selector];
    const configuration = resolveStoragePostgresConfiguration({
      RUN_FEEDBACK_TESTIMONIAL_STORAGE_POSTGRES: "1",
      FEEDBACK_TESTIMONIAL_STORAGE_PATH: selector,
      [target.environmentName]: databaseUrl,
    });
    const parsed = new URL(configuration.target.databaseUrl);
    assert.equal(parsed.pathname, `/${target.databaseName}`);
    assert.equal(parsed.search, "?connect_timeout=5");
    assert.equal(decodeURIComponent(parsed.username), STORAGE_POSTGRES_ROLE);
    assert.equal(decodeURIComponent(parsed.password) === expectedPassword, true);
  }
});

test("feedback/testimonial PostgreSQL identity guards require exact role owner marker and address", () => {
  const expected = {
    databaseName: "sharprunner_feedback_testimonial_storage_fresh_rehearsal",
    roleName: "sharprunner_phase8_feedback_rehearsal_app",
    marker: "SharpRunner disposable Phase 8 feedback testimonial storage rehearsal",
  };
  const validIdentity = {
    database_name: expected.databaseName,
    server_address: "127.0.0.1",
    current_role: expected.roleName,
    database_owner: expected.roleName,
    database_marker: expected.marker,
    role_superuser: false,
    role_create_db: false,
    role_create_role: false,
    role_bypass_rls: false,
    role_inherit: false,
    role_membership_count: 0,
  };
  assert.doesNotThrow(() => assertStoragePostgresIdentity(validIdentity, expected));
  assert.doesNotThrow(() => assertStoragePostgresIdentity({
    ...validIdentity,
    server_address: "::1",
  }, expected));

  for (const identity of [
    { ...validIdentity, server_address: null },
    { ...validIdentity, server_address: "127.0.0.1/32" },
    { ...validIdentity, server_address: "192.0.2.10" },
    { ...validIdentity, database_name: "sharprunner_browser_test" },
    { ...validIdentity, current_role: "postgres" },
    { ...validIdentity, database_owner: "postgres" },
    { ...validIdentity, database_marker: null },
    { ...validIdentity, database_marker: "wrong marker" },
    { ...validIdentity, role_superuser: true },
    { ...validIdentity, role_create_db: true },
    { ...validIdentity, role_create_role: true },
    { ...validIdentity, role_bypass_rls: true },
    { ...validIdentity, role_inherit: true },
    { ...validIdentity, role_membership_count: 1 },
  ]) {
    assert.throws(
      () => assertStoragePostgresIdentity(identity, expected),
      /identity|loopback|role|membership|privilege|RLS/i,
    );
  }
});

test("storage PostgreSQL preflight uses the shared database marker before mutation", () => {
  const source = fs.readFileSync(__filename, "utf8");
  const queryBlock = source.match(
    /const readStoragePostgresIdentity = async \(client\) => \{[\s\S]*?^\};/mu,
  );
  const connectionBlock = source.match(
    /const connectToVerifiedStorageTarget = async[\s\S]*?^\};/mu,
  );
  assert.ok(queryBlock, "storage identity query must remain inspectable");
  assert.match(
    queryBlock[0],
    /shobj_description\(database\.oid, 'pg_database'::name\) AS database_marker/u,
  );
  assert.doesNotMatch(queryBlock[0], /(?<!sh)obj_description\(/u);
  assert.ok(connectionBlock, "storage verified connection must remain inspectable");
  assert.ok(
    connectionBlock[0].indexOf("assertStoragePostgresIdentity")
      < connectionBlock[0].indexOf("assertEmptyStorageSchema"),
    "marker identity must be verified before schema mutation can continue",
  );
});

test("migration runner records feedback/testimonial storage once and skips reruns", async () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const names = migrations.map(([name]) => name);
  const previousNames = names.filter((name) => name !== migrationName);
  const originalQuery = appSequelize.query;
  const firstRun = [];

  appSequelize.query = async (statement, options = {}) => {
    firstRun.push({ statement, options });
    if (/SELECT "name" FROM "SharpRunnerMigrations"/.test(statement)) {
      return [previousNames.map((name) => ({ name }))];
    }
    return [[], undefined];
  };
  try {
    await runMigrations();
  } finally {
    appSequelize.query = originalQuery;
  }
  assert.equal(firstRun.filter(({ statement }) => statement === sql).length, 1);
  assert.equal(
    firstRun.find(({ statement }) => /INSERT INTO "SharpRunnerMigrations"/.test(statement))
      ?.options?.replacements?.name,
    migrationName,
  );

  const secondRun = [];
  appSequelize.query = async (statement) => {
    secondRun.push(statement);
    if (/SELECT "name" FROM "SharpRunnerMigrations"/.test(statement)) {
      return [names.map((name) => ({ name }))];
    }
    return [[], undefined];
  };
  try {
    await runMigrations();
  } finally {
    appSequelize.query = originalQuery;
  }
  assert.equal(secondRun.includes(sql), false);
  assert.equal(secondRun.some((statement) => /INSERT INTO "SharpRunnerMigrations"/.test(statement)), false);
});

const storagePostgresConfiguration = resolveStoragePostgresConfiguration(process.env);
const isStoragePostgresWorker = process.env[STORAGE_POSTGRES_WORKER_ENV] === "1";
const selectedStorageScenario = storagePostgresConfiguration
  ? STORAGE_POSTGRES_SCENARIO_BY_SELECTOR[storagePostgresConfiguration.selector]
  : null;
const postgresTestFor = (selector) => (
  storagePostgresConfiguration
  && isStoragePostgresWorker
  && storagePostgresConfiguration.selector === selector
    ? test
    : test.skip
);
const completedStorageScenarios = [];

const readStoragePostgresIdentity = async (client) => {
  const { rows } = await client.query(`
    SELECT current_database() AS database_name,
           host(inet_server_addr()) AS server_address,
           current_user AS current_role,
           pg_get_userbyid(database.datdba) AS database_owner,
           shobj_description(database.oid, 'pg_database'::name) AS database_marker,
           role.rolsuper AS role_superuser,
           role.rolcreatedb AS role_create_db,
           role.rolcreaterole AS role_create_role,
           role.rolbypassrls AS role_bypass_rls,
           role.rolinherit AS role_inherit,
           (
             SELECT COUNT(*)::integer
             FROM pg_auth_members membership
             WHERE membership.member = role.oid
           ) AS role_membership_count
    FROM pg_database database
    JOIN pg_roles role ON role.rolname = current_user
    WHERE database.datname = current_database()
  `);
  assert.equal(rows.length, 1, "database identity query must return one row");
  return rows[0];
};

const assertEmptyStorageSchema = async (client) => {
  const { rows } = await client.query(`
    SELECT object_type, object_name
    FROM (
      SELECT 'relation' AS object_type, relation.relname AS object_name
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
      UNION ALL
      SELECT 'function' AS object_type, procedure.proname AS object_name
      FROM pg_proc procedure
      JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
    ) objects
    ORDER BY object_type, object_name
  `);
  assert.deepEqual(rows, [], "dedicated rehearsal schema must not contain pre-existing objects");
};

const connectToVerifiedStorageTarget = async (target, { requireEmpty = false } = {}) => {
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    const identity = await readStoragePostgresIdentity(client);
    assertStoragePostgresIdentity(identity, target);
    if (requireEmpty) await assertEmptyStorageSchema(client);
    return client;
  } catch (error) {
    await client.end();
    const sanitized = redactStorageDiagnostics(error?.stack || error?.message || error, [target]);
    const safeError = new Error(sanitized || "feedback/testimonial PostgreSQL preflight failed");
    safeError.code = error?.code;
    throw safeError;
  }
};

const redactStorageDiagnostics = (value, targets) => {
  let sanitized = String(value || "");
  for (const target of targets) {
    const parsed = new URL(target.databaseUrl);
    for (const secret of [target.databaseUrl, parsed.password, decodeURIComponent(parsed.password)]) {
      if (secret) sanitized = sanitized.split(secret).join("[REDACTED]");
    }
  }
  return sanitized;
};

const createSyncSchema = async (target) => {
  await runPostgresWorker({
    scriptPath: path.resolve(__dirname, "feedbackTestimonialFullStack.postgres.test.js"),
    suiteId: SYNC_SCHEMA_WORKER_SUITE,
    expectedScenarioIds: ["sequelize-sync-schema-created"],
    environment: {
      [SYNC_SCHEMA_WORKER_ENV]: "1",
      DATABASE_URL: target.databaseUrl,
      DB_SSL: "0",
    },
    redactDiagnostics: (value) => redactStorageDiagnostics(value, [target]),
  });
};

const createMinimalUsers = async (client) => {
  await client.query(`
    CREATE TABLE "Users" ("id" SERIAL PRIMARY KEY);
    INSERT INTO "Users" DEFAULT VALUES;
    INSERT INTO "Users" DEFAULT VALUES;
    INSERT INTO "Users" DEFAULT VALUES;
    INSERT INTO "Users" DEFAULT VALUES;
  `);
};

const assertStorageSecurityMetadata = async (client) => {
  const tables = [
    "PlatformFeedbackSubmissions",
    "PublicTestimonialSubmissions",
    "PublicTestimonialRevisions",
  ];
  const sequences = tables.map((tableName) => `${tableName}_id_seq`);
  const { rows: rlsRows } = await client.query(`
    SELECT relation.relname, relation.relrowsecurity
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY($1::text[])
    ORDER BY relation.relname
  `, [tables]);
  assert.equal(rlsRows.length, tables.length);
  assert.ok(rlsRows.every(({ relrowsecurity }) => relrowsecurity === true));
  const { rows: policies } = await client.query(`
    SELECT policy.polname
    FROM pg_policy policy
    WHERE policy.polrelid = ANY($1::regclass[])
  `, [tables.map((tableName) => `public."${tableName}"`)]);
  assert.deepEqual(policies, [], "backend-owned storage must not expose direct-client RLS policies");

  const { rows: publicAcl } = await client.query(`
    SELECT relation.relname,
           COALESCE(bool_or(expanded_acl.grantee = 0), FALSE) AS public_has_privilege
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    LEFT JOIN LATERAL aclexplode(
      COALESCE(
        relation.relacl,
        acldefault(CASE WHEN relation.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
                   relation.relowner)
      )
    ) expanded_acl ON TRUE
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY($1::text[])
    GROUP BY relation.relname
    ORDER BY relation.relname
  `, [[...tables, ...sequences]]);
  assert.equal(publicAcl.length, tables.length + sequences.length);
  assert.ok(publicAcl.every(({ public_has_privilege }) => public_has_privilege === false));

  const { rows: clientRoles } = await client.query(`
    SELECT rolname FROM pg_roles WHERE rolname = ANY(ARRAY['anon', 'authenticated'])
  `);
  for (const { rolname } of clientRoles) {
    for (const tableName of tables) {
      const qualifiedName = `public."${tableName}"`;
      const { rows } = await client.query(`
        SELECT has_table_privilege($1, $2, 'SELECT')
            OR has_table_privilege($1, $2, 'INSERT')
            OR has_table_privilege($1, $2, 'UPDATE')
            OR has_table_privilege($1, $2, 'DELETE')
            OR has_table_privilege($1, $2, 'TRUNCATE')
            OR has_table_privilege($1, $2, 'REFERENCES')
            OR has_table_privilege($1, $2, 'TRIGGER') AS has_any
      `, [rolname, qualifiedName]);
      assert.equal(rows[0].has_any, false, `${rolname} must have no effective table privileges`);
    }
    for (const sequenceName of sequences) {
      const qualifiedName = `public."${sequenceName}"`;
      const { rows } = await client.query(`
        SELECT has_sequence_privilege($1, $2, 'USAGE')
            OR has_sequence_privilege($1, $2, 'SELECT')
            OR has_sequence_privilege($1, $2, 'UPDATE') AS has_any
      `, [rolname, qualifiedName]);
      assert.equal(rows[0].has_any, false, `${rolname} must have no effective sequence privileges`);
    }
  }
};

const readStorageCatalogFingerprint = async (client) => {
  const { rows } = await client.query(`
    SELECT object_kind, object_name, definition
    FROM (
      SELECT 'constraint' AS object_kind,
             constraint_row.conname AS object_name,
             pg_get_constraintdef(constraint_row.oid, TRUE) AS definition
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid IN (
        'public."PlatformFeedbackSubmissions"'::regclass,
        'public."PublicTestimonialSubmissions"'::regclass,
        'public."PublicTestimonialRevisions"'::regclass
      )
      UNION ALL
      SELECT 'index', index_row.indexname, index_row.indexdef
      FROM pg_indexes index_row
      WHERE index_row.schemaname = 'public'
        AND index_row.tablename = ANY(ARRAY[
          'PlatformFeedbackSubmissions',
          'PublicTestimonialSubmissions',
          'PublicTestimonialRevisions'
        ])
      UNION ALL
      SELECT 'rls', relation.relname, relation.relrowsecurity::text
      FROM pg_class relation
      WHERE relation.oid IN (
        'public."PlatformFeedbackSubmissions"'::regclass,
        'public."PublicTestimonialSubmissions"'::regclass,
        'public."PublicTestimonialRevisions"'::regclass
      )
      UNION ALL
      SELECT 'column',
             table_relation.relname || '.' || attribute.attname,
             format_type(attribute.atttypid, attribute.atttypmod)
               || '|notnull=' || attribute.attnotnull::text
               || '|default=' || COALESCE(
                 pg_get_expr(attribute_default.adbin, attribute_default.adrelid),
                 '<none>'
               )
      FROM pg_attribute attribute
      JOIN pg_class table_relation ON table_relation.oid = attribute.attrelid
      LEFT JOIN pg_attrdef attribute_default
        ON attribute_default.adrelid = attribute.attrelid
        AND attribute_default.adnum = attribute.attnum
      WHERE table_relation.oid IN (
        'public."PlatformFeedbackSubmissions"'::regclass,
        'public."PublicTestimonialSubmissions"'::regclass,
        'public."PublicTestimonialRevisions"'::regclass
      )
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    ) catalog
    ORDER BY object_kind, object_name, definition
  `);
  return rows;
};

const assertExpectedMigrationRejectionRollback = async ({
  client,
  migrationSql,
  expectedError,
  beforeFingerprint,
  readFingerprint = () => readStorageCatalogFingerprint(client),
  fingerprintMessage,
}) => {
  let migrationError;
  try {
    await client.query(migrationSql);
  } catch (error) {
    migrationError = error;
  }
  assert.ok(migrationError, "incompatible migration must reject");

  let unexpectedMigrationError;
  try {
    assert.match(migrationError.message || "", expectedError);
  } catch (error) {
    unexpectedMigrationError = error;
  }

  try {
    await client.query("ROLLBACK");
  } catch (error) {
    const rollbackError = new Error("failed to roll back rejected migration");
    rollbackError.cause = error;
    throw rollbackError;
  }

  if (unexpectedMigrationError) throw unexpectedMigrationError;
  assert.deepEqual(
    await readFingerprint(),
    beforeFingerprint,
    fingerprintMessage,
  );
};

const INCOMPATIBLE_CASE_SETUP_SQL = Object.freeze({
  nullability: `
    ALTER TABLE "PlatformFeedbackSubmissions" ALTER COLUMN "message" DROP NOT NULL
  `,
  defaultValue: `
    ALTER TABLE "PlatformFeedbackSubmissions" ALTER COLUMN "message" SET NOT NULL;
    ALTER TABLE "PlatformFeedbackSubmissions" ALTER COLUMN "message" SET DEFAULT 'unexpected';
  `,
  foreignKeyAction: `
    ALTER TABLE "PlatformFeedbackSubmissions"
    ADD CONSTRAINT "platform_feedback_submissions_author_fk"
    FOREIGN KEY ("authorUserId") REFERENCES "Users"("id") ON DELETE CASCADE
  `,
  foreignKeyTarget: `
    ALTER TABLE "PlatformFeedbackSubmissions"
    DROP CONSTRAINT "platform_feedback_submissions_author_fk";
    ALTER TABLE "PlatformFeedbackSubmissions"
    ADD CONSTRAINT "platform_feedback_submissions_author_fk"
    FOREIGN KEY ("authorUserId")
    REFERENCES "PublicTestimonialSubmissions"("id") ON DELETE RESTRICT
  `,
  unvalidatedConstraint: `
    ALTER TABLE "PlatformFeedbackSubmissions"
    ADD CONSTRAINT "platform_feedback_submissions_message_valid"
    CHECK (
      "message" = regexp_replace(
        "message",
        U&'^[\\0009-\\000D\\0020\\00A0\\1680\\2000-\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF]+|[\\0009-\\000D\\0020\\00A0\\1680\\2000-\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF]+$',
        '',
        'g'
      )
      AND length("message") BETWEEN 1 AND 1000
    ) NOT VALID
  `,
  constraintSemantics: `
    ALTER TABLE "PlatformFeedbackSubmissions"
    ADD CONSTRAINT "platform_feedback_submissions_message_valid" CHECK (TRUE)
  `,
  indexPredicate: `
    DROP INDEX "public_testimonial_revisions_one_current";
    CREATE INDEX "public_testimonial_revisions_one_current"
      ON "PublicTestimonialRevisions" ("submissionId")
      WHERE "isCurrent" = FALSE
  `,
});

test("expected migration rejection rolls back the same client before fingerprinting", async () => {
  const calls = [];
  let transactionAborted = false;
  const baseline = [{ object_kind: "column", object_name: "baseline", definition: "unchanged" }];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      if (sql === "MIGRATION") {
        transactionAborted = true;
        const error = new Error("incompatible pre-existing nullability for message");
        error.code = "P0001";
        throw error;
      }
      if (sql === "ROLLBACK") {
        transactionAborted = false;
        return { rows: [] };
      }
      if (sql === "FINGERPRINT") {
        if (transactionAborted) {
          const error = new Error("current transaction is aborted");
          error.code = "25P02";
          throw error;
        }
        return { rows: baseline };
      }
      throw new Error("unexpected synthetic query");
    },
  };

  await assertExpectedMigrationRejectionRollback({
    client,
    migrationSql: "MIGRATION",
    expectedError: /incompatible pre-existing nullability.*message/i,
    beforeFingerprint: baseline,
    readFingerprint: async () => (await client.query("FINGERPRINT")).rows,
    fingerprintMessage: "expected rejection must preserve the baseline",
  });

  assert.deepEqual(calls, ["MIGRATION", "ROLLBACK", "FINGERPRINT"]);
});

test("migration rejection recovery fails closed on unexpected errors, rollback failure, and changed state", async () => {
  const expectedError = /incompatible required index/i;
  const baseline = [{ object_kind: "index", object_name: "required", definition: "before" }];

  for (const scenario of [
    {
      name: "unexpected migration error",
      migrationError: new Error("unrelated failure"),
      rollbackError: null,
      afterFingerprint: baseline,
      expectedFailure: /incompatible required index/i,
    },
    {
      name: "rollback failure",
      migrationError: new Error("incompatible required index"),
      rollbackError: new Error("rollback unavailable"),
      afterFingerprint: baseline,
      expectedFailure: /failed to roll back rejected migration/i,
    },
    {
      name: "changed fingerprint",
      migrationError: new Error("incompatible required index"),
      rollbackError: null,
      afterFingerprint: [
        { object_kind: "index", object_name: "required", definition: "changed" },
      ],
      expectedFailure: /must preserve the comparison baseline/i,
    },
  ]) {
    const calls = [];
    const client = {
      query: async (sql) => {
        calls.push(sql);
        if (sql === "MIGRATION") throw scenario.migrationError;
        if (sql === "ROLLBACK") {
          if (scenario.rollbackError) throw scenario.rollbackError;
          return { rows: [] };
        }
        throw new Error("unexpected synthetic query");
      },
    };

    await assert.rejects(
      assertExpectedMigrationRejectionRollback({
        client,
        migrationSql: "MIGRATION",
        expectedError,
        beforeFingerprint: baseline,
        readFingerprint: async () => scenario.afterFingerprint,
        fingerprintMessage: "rejected migration must preserve the comparison baseline",
      }),
      scenario.expectedFailure,
      scenario.name,
    );
    assert.deepEqual(calls, ["MIGRATION", "ROLLBACK"], scenario.name);
  }
});

test("each incompatible migration case explicitly establishes its intended fixture", () => {
  assert.deepEqual(Object.keys(INCOMPATIBLE_CASE_SETUP_SQL), [
    "nullability",
    "defaultValue",
    "foreignKeyAction",
    "foreignKeyTarget",
    "unvalidatedConstraint",
    "constraintSemantics",
    "indexPredicate",
  ]);
  assert.match(INCOMPATIBLE_CASE_SETUP_SQL.foreignKeyAction, /ADD CONSTRAINT "platform_feedback_submissions_author_fk"/u);
  assert.doesNotMatch(INCOMPATIBLE_CASE_SETUP_SQL.foreignKeyAction, /DROP CONSTRAINT/u);
  assert.match(INCOMPATIBLE_CASE_SETUP_SQL.constraintSemantics, /CHECK \(TRUE\)/u);
  assert.doesNotMatch(INCOMPATIBLE_CASE_SETUP_SQL.constraintSemantics, /DROP INDEX/u);
  assert.match(INCOMPATIBLE_CASE_SETUP_SQL.indexPredicate, /DROP INDEX "public_testimonial_revisions_one_current"/u);
  assert.match(INCOMPATIBLE_CASE_SETUP_SQL.indexPredicate, /WHERE "isCurrent" = FALSE/u);
  for (const setupSql of Object.values(INCOMPATIBLE_CASE_SETUP_SQL)) {
    assert.doesNotMatch(setupSql, /IF EXISTS/u);
  }
});

postgresTestFor("fresh")("feedback/testimonial fresh migration enforces storage and transition contracts", async () => {
  const target = storagePostgresConfiguration.target;
  const client = await connectToVerifiedStorageTarget(target, { requireEmpty: true });
  const sql = fs.readFileSync(migrationPath, "utf8");

  try {
    await createMinimalUsers(client);
    await client.query(sql);
    const firstMigrationFingerprint = await readStorageCatalogFingerprint(client);
    await client.query(sql);
    assert.deepEqual(
      await readStorageCatalogFingerprint(client),
      firstMigrationFingerprint,
      "migration rerun must preserve required object definitions",
    );

    await client.query(`
      INSERT INTO "PlatformFeedbackSubmissions"
        ("authorUserId", "message", "idempotencyKey", "createdAt", "updatedAt")
      VALUES (1, 'Private platform feedback', 'platform_key_001', NOW(), NOW());
      INSERT INTO "PublicTestimonialSubmissions"
        ("authorUserId", "idempotencyKey", "createdAt", "updatedAt")
      VALUES (1, 'submission_key_001', NOW(), NOW());
      INSERT INTO "PublicTestimonialRevisions"
        ("submissionId", "authorUserId", "revisionNumber", "isCurrent", "message",
         "attributionMode", "publicDisplayNameSnapshot", "publicNamePreviewVersion",
         "consentVersion", "consentedAt", "idempotencyKey", "moderationStatus",
         "createdAt", "updatedAt")
      VALUES (1, 1, 1, TRUE, 'A named testimonial', 'named', 'Ada L.', 'preview_001',
              'consent_001', NOW(), 'revision_key_001', 'pending', NOW(), NOW());
    `);

    for (const [index, message] of [
      " padded",
      "padded\t",
      "\r\n",
      "\u00a0only\u00a0",
      "\u2003only\ufeff",
    ].entries()) {
      await assert.rejects(client.query(`
        INSERT INTO "PlatformFeedbackSubmissions"
          ("authorUserId", "message", "idempotencyKey", "createdAt", "updatedAt")
        VALUES (1, $1, $2, NOW(), NOW())
      `, [message, `bad_text_${index}`]), /check constraint/i);
    }
    await assert.doesNotReject(client.query(`
      INSERT INTO "PlatformFeedbackSubmissions"
        ("authorUserId", "message", "idempotencyKey", "createdAt", "updatedAt")
      VALUES (1, $1, 'internal_whitespace_001', NOW(), NOW())
    `, ["First line\n\tSecond\u00a0line"]));
    await assert.doesNotReject(client.query(`
      INSERT INTO "PlatformFeedbackSubmissions"
        ("authorUserId", "message", "idempotencyKey", "createdAt", "updatedAt")
      VALUES (1, $1, 'unicode_boundary_1000', NOW(), NOW())
    `, ["\u{1f642}".repeat(1000)]));
    await assert.rejects(client.query(`
      INSERT INTO "PlatformFeedbackSubmissions"
        ("authorUserId", "message", "idempotencyKey", "createdAt", "updatedAt")
      VALUES (1, $1, 'unicode_boundary_1001', NOW(), NOW())
    `, ["\u{1f642}".repeat(1001)]), /too long|check constraint/i);

    await assert.rejects(client.query(`
      INSERT INTO "PublicTestimonialRevisions"
        ("submissionId", "authorUserId", "revisionNumber", "isCurrent", "message",
         "attributionMode", "consentVersion", "consentedAt", "idempotencyKey",
         "moderationStatus", "createdAt", "updatedAt")
      VALUES (1, 2, 2, FALSE, 'Wrong author', 'anonymous', 'consent_001', NOW(),
              'revision_key_002', 'pending', NOW(), NOW())
    `), /foreign key/i);
    await assert.rejects(client.query(`
      INSERT INTO "PublicTestimonialRevisions"
        ("submissionId", "authorUserId", "revisionNumber", "isCurrent", "message",
         "attributionMode", "consentVersion", "consentedAt", "idempotencyKey",
         "moderationStatus", "createdAt", "updatedAt")
      VALUES (1, 1, 2, TRUE, 'Second current', 'anonymous', 'consent_001', NOW(),
              'revision_key_002', 'pending', NOW(), NOW())
    `), /duplicate key/i);
    await assert.rejects(client.query(`
      UPDATE "PublicTestimonialRevisions" SET "message" = 'Changed' WHERE "id" = 1
    `), /immutable/i);
    await client.query(`
      UPDATE "PublicTestimonialRevisions"
      SET "moderationStatus" = 'approved', "approvedByUserId" = 2,
          "approvedAt" = NOW(), "updatedAt" = NOW()
      WHERE "id" = 1
    `);
    await assert.rejects(client.query(`
      UPDATE "PublicTestimonialRevisions"
      SET "moderationStatus" = 'pending', "updatedAt" = NOW()
      WHERE "id" = 1
    `), /moderation transition/i);

    await client.query("BEGIN");
    try {
      await client.query(`
        UPDATE "PublicTestimonialRevisions"
        SET "isCurrent" = FALSE, "updatedAt" = NOW()
        WHERE "id" = 1
      `);
      await client.query(`
        INSERT INTO "PublicTestimonialRevisions"
          ("submissionId", "authorUserId", "revisionNumber", "isCurrent", "message",
           "attributionMode", "consentVersion", "consentedAt", "idempotencyKey",
           "moderationStatus", "createdAt", "updatedAt")
        VALUES (1, 1, 2, TRUE, 'Replacement revision', 'anonymous', 'consent_002', NOW(),
                'revision_key_003', 'pending', NOW(), NOW())
      `);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    await client.query(`
      UPDATE "PublicTestimonialRevisions"
      SET "moderationStatus" = 'rejected', "rejectedByUserId" = 2,
          "rejectedAt" = NOW(), "moderationExplanation" = 'Remove the private detail.',
          "updatedAt" = NOW()
      WHERE "submissionId" = 1 AND "revisionNumber" = 2
    `);
    await assert.rejects(client.query(`
      UPDATE "PublicTestimonialRevisions"
      SET "moderationExplanation" = 'Rewritten explanation', "updatedAt" = NOW()
      WHERE "submissionId" = 1 AND "revisionNumber" = 2
    `), /write-once/i);
    await assert.rejects(client.query(`
      UPDATE "PublicTestimonialRevisions"
      SET "isCurrent" = TRUE, "updatedAt" = NOW()
      WHERE "id" = 1
    `), /cannot become current/i);

    const { rows: revocationSubmissions } = await client.query(`
      INSERT INTO "PublicTestimonialSubmissions"
        ("authorUserId", "idempotencyKey", "createdAt", "updatedAt")
      VALUES (1, 'submission_key_002', NOW(), NOW())
      RETURNING "id"
    `);
    const revocationSubmissionId = revocationSubmissions[0].id;
    const { rows: approvedRevisions } = await client.query(`
      INSERT INTO "PublicTestimonialRevisions"
        ("submissionId", "authorUserId", "revisionNumber", "isCurrent", "message",
         "attributionMode", "consentVersion", "consentedAt", "idempotencyKey",
         "moderationStatus", "createdAt", "updatedAt")
      VALUES ($1, 1, 1, TRUE, 'Revocable testimonial', 'anonymous', 'consent_003', NOW(),
              'revision_key_004', 'pending', NOW(), NOW())
      RETURNING "id"
    `, [revocationSubmissionId]);
    const approvedRevisionId = approvedRevisions[0].id;
    await client.query(`
      UPDATE "PublicTestimonialRevisions"
      SET "moderationStatus" = 'approved', "approvedByUserId" = 2,
          "approvedAt" = NOW(), "updatedAt" = NOW()
      WHERE "id" = $1
    `, [approvedRevisionId]);
    await client.query(`
      UPDATE "PublicTestimonialRevisions"
      SET "moderationStatus" = 'revoked', "revokedByUserId" = 3,
          "revokedAt" = NOW(), "moderationExplanation" = 'Withdrawn from public use.',
          "updatedAt" = NOW()
      WHERE "id" = $1
    `, [approvedRevisionId]);
    await assert.rejects(client.query(`
      UPDATE "PublicTestimonialRevisions"
      SET "revokedByUserId" = 4, "updatedAt" = NOW()
      WHERE "id" = $1
    `, [approvedRevisionId]), /write-once/i);

    const { rows: suspendedSubmissions } = await client.query(`
      INSERT INTO "PublicTestimonialSubmissions"
        ("authorUserId", "idempotencyKey", "createdAt", "updatedAt")
      VALUES (1, 'submission_key_003', NOW(), NOW())
      RETURNING "id"
    `);
    const suspendedSubmissionId = suspendedSubmissions[0].id;
    await client.query(`
      INSERT INTO "PublicTestimonialRevisions"
        ("submissionId", "authorUserId", "revisionNumber", "isCurrent", "message",
         "attributionMode", "consentVersion", "consentedAt", "idempotencyKey",
         "moderationStatus", "createdAt", "updatedAt")
      VALUES ($1, 1, 1, TRUE, 'Before suspension', 'anonymous', 'consent_004', NOW(),
              'revision_key_005', 'pending', NOW(), NOW())
    `, [suspendedSubmissionId]);
    await client.query(`
      UPDATE "PublicTestimonialSubmissions"
      SET "publicationSuspendedAt" = NOW(),
          "publicationSuspensionReason" = 'account_deactivated', "updatedAt" = NOW()
      WHERE "id" = $1
    `, [suspendedSubmissionId]);
    await client.query("BEGIN");
    try {
      await client.query(`
        UPDATE "PublicTestimonialRevisions"
        SET "isCurrent" = FALSE, "updatedAt" = NOW()
        WHERE "submissionId" = $1 AND "revisionNumber" = 1
      `, [suspendedSubmissionId]);
      await client.query(`
        INSERT INTO "PublicTestimonialRevisions"
          ("submissionId", "authorUserId", "revisionNumber", "isCurrent", "message",
           "attributionMode", "consentVersion", "consentedAt", "idempotencyKey",
           "moderationStatus", "createdAt", "updatedAt")
        VALUES ($1, 1, 2, TRUE, 'Fresh consent after suspension', 'anonymous',
                'consent_005', NOW(), 'revision_key_006', 'pending', NOW(), NOW())
      `, [suspendedSubmissionId]);
      await client.query(`
        UPDATE "PublicTestimonialSubmissions"
        SET "publicationSuspendedAt" = NULL, "publicationSuspensionReason" = NULL,
            "updatedAt" = NOW()
        WHERE "id" = $1
      `, [suspendedSubmissionId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    const { rows: recoveredSubmissions } = await client.query(`
      SELECT "publicationSuspendedAt", "publicationSuspensionReason"
      FROM "PublicTestimonialSubmissions" WHERE "id" = $1
    `, [suspendedSubmissionId]);
    assert.equal(recoveredSubmissions[0].publicationSuspendedAt, null);
    assert.equal(recoveredSubmissions[0].publicationSuspensionReason, null);
    await assert.rejects(client.query(`
      UPDATE "PublicTestimonialRevisions"
      SET "moderationStatus" = 'rejected', "rejectedByUserId" = 2,
          "rejectedAt" = NOW(), "moderationExplanation" = $2, "updatedAt" = NOW()
      WHERE "submissionId" = $1 AND "revisionNumber" = 2
    `, [suspendedSubmissionId, "\u00a0Not normalized\u00a0"]), /check constraint/i);
    const { rows: stillPending } = await client.query(`
      SELECT "moderationStatus", "moderationExplanation"
      FROM "PublicTestimonialRevisions"
      WHERE "submissionId" = $1 AND "revisionNumber" = 2
    `, [suspendedSubmissionId]);
    assert.deepEqual(stillPending[0], {
      moderationStatus: "pending",
      moderationExplanation: null,
    });

    await client.query(`
      UPDATE "PublicTestimonialSubmissions"
      SET "withdrawnAt" = NOW(), "updatedAt" = NOW() WHERE "id" = 1
    `);
    await assert.rejects(client.query(`
      UPDATE "PublicTestimonialSubmissions"
      SET "withdrawnAt" = NULL, "updatedAt" = NOW() WHERE "id" = 1
    `), /withdrawal/i);
    await assert.rejects(client.query('DELETE FROM "Users" WHERE "id" = 1'), /foreign key/i);

    await assertStorageSecurityMetadata(client);
    completedStorageScenarios.push({ id: STORAGE_POSTGRES_SCENARIOS[0], status: "passed" });
  } finally {
    await client.end();
  }
});

postgresTestFor("sync")("feedback/testimonial migration accepts the exact sync-created schema", async () => {
  const target = storagePostgresConfiguration.target;
  let client = await connectToVerifiedStorageTarget(target, { requireEmpty: true });
  await client.end();

  await createSyncSchema(target);
  client = await connectToVerifiedStorageTarget(target);
  const sql = fs.readFileSync(migrationPath, "utf8");
  try {
    const { rows: tables } = await client.query(`
      SELECT relation.relname
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relkind = 'r'
        AND relation.relname = ANY($1::text[])
      ORDER BY relation.relname
    `, [[
      "PlatformFeedbackSubmissions",
      "PublicTestimonialSubmissions",
      "PublicTestimonialRevisions",
    ]]);
    assert.deepEqual(tables.map(({ relname }) => relname), [
      "PlatformFeedbackSubmissions",
      "PublicTestimonialRevisions",
      "PublicTestimonialSubmissions",
    ]);

    await client.query(sql);
    const firstFingerprint = await readStorageCatalogFingerprint(client);
    await client.query(sql);
    const secondFingerprint = await readStorageCatalogFingerprint(client);
    assert.deepEqual(secondFingerprint, firstFingerprint);

    const { rows: users } = await client.query(`
      INSERT INTO "Users"
        ("firstName", "lastName", "username", "email", "password", "role", "status",
         "createdAt", "updatedAt")
      VALUES
        ('Sync', 'Author', 'sync_author', 'sync-author@example.test', 'test-only',
         'student', 'active', NOW(), NOW()),
        ('Sync', 'Moderator', 'sync_moderator', 'sync-moderator@example.test', 'test-only',
         'admin', 'active', NOW(), NOW())
      RETURNING "id"
    `);
    const authorId = users[0].id;
    const { rows: submissions } = await client.query(`
      INSERT INTO "PublicTestimonialSubmissions"
        ("authorUserId", "idempotencyKey", "createdAt", "updatedAt")
      VALUES ($1, 'sync_submission_001', NOW(), NOW())
      RETURNING "id"
    `, [authorId]);
    await client.query(`
      INSERT INTO "PublicTestimonialRevisions"
        ("submissionId", "authorUserId", "revisionNumber", "isCurrent", "message",
         "attributionMode", "consentVersion", "consentedAt", "idempotencyKey",
         "moderationStatus", "createdAt", "updatedAt")
      VALUES ($1, $2, 1, TRUE, 'Sync-created path', 'anonymous', 'consent_sync', NOW(),
              'sync_revision_001', 'pending', NOW(), NOW())
    `, [submissions[0].id, authorId]);
    await assert.rejects(client.query(`
      INSERT INTO "PlatformFeedbackSubmissions"
        ("authorUserId", "message", "idempotencyKey", "createdAt", "updatedAt")
      VALUES ($1, $2, 'sync_bad_text_001', NOW(), NOW())
    `, [authorId, "\u2003not normalized\u2003"]), /check constraint/i);
    await assertStorageSecurityMetadata(client);
    completedStorageScenarios.push({ id: STORAGE_POSTGRES_SCENARIOS[1], status: "passed" });
  } finally {
    await client.end();
  }
});

postgresTestFor("incompatible")("feedback/testimonial migration rejects incompatible named objects atomically", async () => {
  const target = storagePostgresConfiguration.target;
  let client = await connectToVerifiedStorageTarget(target, { requireEmpty: true });
  await client.end();

  await createSyncSchema(target);
  client = await connectToVerifiedStorageTarget(target);
  const sql = fs.readFileSync(migrationPath, "utf8");
  try {
    await client.query(INCOMPATIBLE_CASE_SETUP_SQL.nullability);
    const beforeNullabilityFailure = await readStorageCatalogFingerprint(client);
    await assertExpectedMigrationRejectionRollback({
      client,
      migrationSql: sql,
      expectedError: /incompatible pre-existing nullability.*message/i,
      beforeFingerprint: beforeNullabilityFailure,
      fingerprintMessage: "failed column validation must roll back every migration mutation",
    });
    await client.query(INCOMPATIBLE_CASE_SETUP_SQL.defaultValue);
    const beforeDefaultFailure = await readStorageCatalogFingerprint(client);
    await assertExpectedMigrationRejectionRollback({
      client,
      migrationSql: sql,
      expectedError: /unexpected pre-existing default.*message/i,
      beforeFingerprint: beforeDefaultFailure,
      fingerprintMessage: "failed default validation must roll back every migration mutation",
    });
    await client.query(`
      ALTER TABLE "PlatformFeedbackSubmissions" ALTER COLUMN "message" DROP DEFAULT
    `);

    await client.query(INCOMPATIBLE_CASE_SETUP_SQL.foreignKeyAction);
    const beforeForeignKeyFailure = await readStorageCatalogFingerprint(client);
    await assertExpectedMigrationRejectionRollback({
      client,
      migrationSql: sql,
      expectedError: /incompatible.*platform_feedback_submissions_author_fk|foreign key.*action/i,
      beforeFingerprint: beforeForeignKeyFailure,
      fingerprintMessage:
        "failed foreign-key target/action validation must roll back every migration mutation",
    });
    await client.query(`
      ALTER TABLE "PlatformFeedbackSubmissions"
      DROP CONSTRAINT "platform_feedback_submissions_author_fk";
      ALTER TABLE "PlatformFeedbackSubmissions"
      ADD CONSTRAINT "platform_feedback_submissions_author_fk"
      FOREIGN KEY ("authorUserId") REFERENCES "Users"("id") ON DELETE RESTRICT
    `);

    await client.query(INCOMPATIBLE_CASE_SETUP_SQL.foreignKeyTarget);
    const beforeForeignKeyTargetFailure = await readStorageCatalogFingerprint(client);
    await assertExpectedMigrationRejectionRollback({
      client,
      migrationSql: sql,
      expectedError: /incompatible required foreign key.*platform_feedback_submissions_author_fk/i,
      beforeFingerprint: beforeForeignKeyTargetFailure,
      fingerprintMessage:
        "failed foreign-key target validation must roll back every migration mutation",
    });
    await client.query(`
      ALTER TABLE "PlatformFeedbackSubmissions"
      DROP CONSTRAINT "platform_feedback_submissions_author_fk";
      ALTER TABLE "PlatformFeedbackSubmissions"
      ADD CONSTRAINT "platform_feedback_submissions_author_fk"
      FOREIGN KEY ("authorUserId") REFERENCES "Users"("id") ON DELETE RESTRICT
    `);

    await client.query(INCOMPATIBLE_CASE_SETUP_SQL.unvalidatedConstraint);
    const beforeNotValidFailure = await readStorageCatalogFingerprint(client);
    await assertExpectedMigrationRejectionRollback({
      client,
      migrationSql: sql,
      expectedError:
        /incompatible required check constraint.*platform_feedback_submissions_message_valid/i,
      beforeFingerprint: beforeNotValidFailure,
      fingerprintMessage:
        "unvalidated required constraints must reject without partial migration changes",
    });
    await client.query(`
      ALTER TABLE "PlatformFeedbackSubmissions"
      DROP CONSTRAINT "platform_feedback_submissions_message_valid"
    `);

    await client.query(INCOMPATIBLE_CASE_SETUP_SQL.constraintSemantics);

    const beforeConstraintFailure = await readStorageCatalogFingerprint(client);
    await assertExpectedMigrationRejectionRollback({
      client,
      migrationSql: sql,
      expectedError: /incompatible semantics.*platform_feedback_submissions_message_valid/i,
      beforeFingerprint: beforeConstraintFailure,
      fingerprintMessage: "failed constraint validation must roll back every migration mutation",
    });

    await client.query(`
      ALTER TABLE "PlatformFeedbackSubmissions"
      DROP CONSTRAINT "platform_feedback_submissions_message_valid"
    `);
    await client.query(INCOMPATIBLE_CASE_SETUP_SQL.indexPredicate);
    const beforeIndexFailure = await readStorageCatalogFingerprint(client);
    await assertExpectedMigrationRejectionRollback({
      client,
      migrationSql: sql,
      expectedError:
        /incompatible required index public_testimonial_revisions_one_current|incompatible predicate.*public_testimonial_revisions_one_current/i,
      beforeFingerprint: beforeIndexFailure,
      fingerprintMessage: "failed index validation must roll back every migration mutation",
    });
    completedStorageScenarios.push({ id: STORAGE_POSTGRES_SCENARIOS[2], status: "passed" });
  } finally {
    await client.end();
  }
});

if (isStoragePostgresWorker) {
  test.after(() => {
    const expectedScenarios = [{ id: selectedStorageScenario, status: "passed" }];
    assert.deepEqual(
      completedStorageScenarios,
      expectedScenarios,
      "the selected storage PostgreSQL scenario must execute before acknowledgement",
    );
    emitWorkerCompletionAcknowledgement({
      suiteId: STORAGE_POSTGRES_WORKER_SUITE,
      scenarios: completedStorageScenarios,
    });
  });
} else {
  const storageWrapperTest = storagePostgresConfiguration ? test : test.skip;
  storageWrapperTest("feedback/testimonial guarded PostgreSQL storage rehearsal", async () => {
    const childEnvironment = storagePostgresConfiguration.rerun
      ? {
        [storagePostgresConfiguration.optInEnvironmentName]: "1",
        [storagePostgresConfiguration.target.environmentName]:
          storagePostgresConfiguration.target.databaseUrl,
        [STORAGE_POSTGRES_WORKER_ENV]: "1",
      }
      : {
        RUN_FEEDBACK_TESTIMONIAL_STORAGE_POSTGRES: "1",
        [STORAGE_POSTGRES_SELECTOR_ENV]: storagePostgresConfiguration.selector,
        [storagePostgresConfiguration.target.environmentName]:
          storagePostgresConfiguration.target.databaseUrl,
        [STORAGE_POSTGRES_WORKER_ENV]: "1",
      };
    await runPostgresWorker({
      scriptPath: __filename,
      suiteId: STORAGE_POSTGRES_WORKER_SUITE,
      expectedScenarioIds: [selectedStorageScenario],
      environment: childEnvironment,
      redactDiagnostics: (value) => redactStorageDiagnostics(
        value,
        [storagePostgresConfiguration.target],
      ),
    });
  });
}
