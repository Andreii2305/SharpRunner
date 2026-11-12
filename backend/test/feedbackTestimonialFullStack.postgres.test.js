const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { Client } = require("pg");
const {
  emitWorkerCompletionAcknowledgement,
  runPostgresWorker,
} = require("./support/postgresWorkerHarness");

const OPT_IN_ENV = "RUN_FEEDBACK_TESTIMONIAL_FULL_STACK_POSTGRES";
const OWNER_URL_ENV = "FEEDBACK_TESTIMONIAL_FULL_STACK_OWNER_DATABASE_URL";
const PROBE_URL_ENV = "FEEDBACK_TESTIMONIAL_FULL_STACK_PROBE_DATABASE_URL";
const WORKER_ENV = "FEEDBACK_TESTIMONIAL_FULL_STACK_POSTGRES_WORKER";
const SYNC_WORKER_ENV = "FEEDBACK_TESTIMONIAL_SYNC_SCHEMA_WORKER";
const URL_CONTRACT_ENV = "FEEDBACK_TESTIMONIAL_FULL_STACK_URL_CONTRACT";
const URL_CONTRACT_OWNER_PASSWORD_ENV =
  "FEEDBACK_TESTIMONIAL_FULL_STACK_URL_CONTRACT_OWNER_PASSWORD";
const URL_CONTRACT_PROBE_PASSWORD_ENV =
  "FEEDBACK_TESTIMONIAL_FULL_STACK_URL_CONTRACT_PROBE_PASSWORD";
const DATABASE_NAME = "sharprunner_feedback_testimonial_full_rehearsal_test";
const OWNER_ROLE = "sharprunner_phase8_feedback_rehearsal_app";
const PROBE_ROLE = "sharprunner_phase8_feedback_rehearsal_probe";
const DATABASE_MARKER =
  "SharpRunner disposable Phase 8 feedback testimonial storage rehearsal";
const WORKER_SUITE_ID = "feedback-testimonial-full-stack";
const SYNC_WORKER_SUITE_ID = "feedback-testimonial-sync-schema";
const SCENARIO_IDS = Object.freeze([
  "platform-feedback-idempotency-savepoint",
  "author-moderation-public-lifecycle",
  "withdrawal-suspension-recovery",
  "concurrent-lifecycle-races",
  "public-read-eligibility-pagination",
  "rls-privilege-cleanup",
]);
const PROTECTED_TABLES = Object.freeze([
  "PlatformFeedbackSubmissions",
  "PublicTestimonialSubmissions",
  "PublicTestimonialRevisions",
]);
const PROTECTED_SEQUENCES = Object.freeze(
  PROTECTED_TABLES.map((tableName) => `${tableName}_id_seq`),
);
const REQUIRED_CONSTRAINTS = Object.freeze([
  "platform_feedback_submissions_author_fk",
  "platform_feedback_submissions_message_valid",
  "public_testimonial_submissions_author_fk",
  "public_testimonial_submissions_suspension_valid",
  "public_testimonial_revisions_submission_author_fk",
  "public_testimonial_revisions_author_fk",
  "public_testimonial_revisions_moderation_valid",
]);
const REQUIRED_TRIGGERS = Object.freeze([
  "public_testimonial_submissions_enforce_transitions",
  "public_testimonial_revisions_enforce_transitions",
]);
const REQUIRED_INDEXES = Object.freeze([
  "platform_feedback_submissions_author_key",
  "public_testimonial_submissions_author_key",
  "public_testimonial_revisions_author_key",
  "public_testimonial_revisions_one_current",
  "public_testimonial_revisions_public_order",
]);

const parseExactUrl = (value, environmentName, expectedRole) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${environmentName} must be a valid PostgreSQL URL`);
  }
  if (!/^postgres(?:ql)?:$/u.test(parsed.protocol)) {
    throw new Error(`${environmentName} must use PostgreSQL`);
  }
  if (!["127.0.0.1", "[::1]"].includes(parsed.hostname)) {
    throw new Error(`${environmentName} must use a literal loopback host`);
  }
  let role;
  try {
    role = decodeURIComponent(parsed.username);
  } catch {
    throw new Error(`${environmentName} must use the exact dedicated role`);
  }
  if (role !== expectedRole) {
    throw new Error(`${environmentName} must use the exact dedicated role`);
  }
  const hasSupportedSearch = parsed.search === "" || parsed.search === "?connect_timeout=5";
  if (parsed.pathname !== `/${DATABASE_NAME}` || !hasSupportedSearch || parsed.hash) {
    throw new Error(`${environmentName} must target the exact dedicated database`);
  }
  return value;
};

const resolveConfiguration = (environment) => {
  const values = [
    environment[OPT_IN_ENV],
    environment[OWNER_URL_ENV],
    environment[PROBE_URL_ENV],
  ];
  if (values.every((value) => value === undefined)) return null;
  if (environment[OPT_IN_ENV] !== "1"
    || !environment[OWNER_URL_ENV]
    || !environment[PROBE_URL_ENV]) {
    throw new Error("feedback/testimonial full-stack PostgreSQL configuration is partial");
  }
  const ownerDatabaseUrl = parseExactUrl(
    environment[OWNER_URL_ENV],
    OWNER_URL_ENV,
    OWNER_ROLE,
  );
  const probeDatabaseUrl = parseExactUrl(
    environment[PROBE_URL_ENV],
    PROBE_URL_ENV,
    PROBE_ROLE,
  );
  if (ownerDatabaseUrl === probeDatabaseUrl) {
    throw new Error("owner and probe PostgreSQL URLs must use distinct credentials");
  }
  return { ownerDatabaseUrl, probeDatabaseUrl };
};

const assertRestrictedRole = (identity, expectedRole) => {
  assert.equal(identity.current_role, expectedRole, "database role mismatch");
  assert.equal(identity.role_superuser, false, "role must not be superuser");
  assert.equal(identity.role_create_db, false, "role must not create databases");
  assert.equal(identity.role_create_role, false, "role must not create roles");
  assert.equal(identity.role_bypass_rls, false, "role must not bypass RLS");
  assert.equal(identity.role_inherit, false, "role must not inherit privileges");
  assert.equal(identity.role_membership_count, 0, "role must have zero memberships");
};

const assertIdentity = (identity, expectedRole) => {
  assert.ok(identity && typeof identity === "object", "database identity is required");
  assert.equal(identity.database_name, DATABASE_NAME, "database name mismatch");
  assert.ok(
    ["127.0.0.1", "::1"].includes(identity.server_address),
    "server address must be normalized loopback",
  );
  assert.equal(identity.database_owner, OWNER_ROLE, "database owner mismatch");
  assert.equal(identity.database_marker, DATABASE_MARKER, "database marker mismatch");
  assertRestrictedRole(identity, expectedRole);
};

const redactDiagnostics = (value, configuration) => {
  let sanitized = String(value || "");
  for (const databaseUrl of [configuration?.ownerDatabaseUrl, configuration?.probeDatabaseUrl]) {
    if (!databaseUrl) continue;
    const parsed = new URL(databaseUrl);
    for (const secret of [databaseUrl, parsed.password, decodeURIComponent(parsed.password)]) {
      if (secret) sanitized = sanitized.split(secret).join("[REDACTED]");
    }
  }
  return sanitized;
};

test("feedback/testimonial full-stack guards reject partial and substituted targets", () => {
  assert.equal(resolveConfiguration({}), null);
  for (const environment of [
    { [OPT_IN_ENV]: "1" },
    { [OWNER_URL_ENV]: `postgresql://127.0.0.1/${DATABASE_NAME}` },
    {
      [OPT_IN_ENV]: "1",
      [OWNER_URL_ENV]: `postgresql://127.0.0.1/${DATABASE_NAME}`,
    },
  ]) {
    assert.throws(() => resolveConfiguration(environment), /partial/u);
  }
  for (const value of [
    `postgresql://${OWNER_ROLE}@localhost/${DATABASE_NAME}`,
    `postgresql://${OWNER_ROLE}@192.0.2.1/${DATABASE_NAME}`,
    `postgresql://${OWNER_ROLE}@127.0.0.1/sharprunner_browser_test`,
  ]) {
    assert.throws(() => resolveConfiguration({
      [OPT_IN_ENV]: "1",
      [OWNER_URL_ENV]: value,
      [PROBE_URL_ENV]: `postgresql://${PROBE_ROLE}@127.0.0.1/${DATABASE_NAME}`,
    }), /loopback|database/u);
  }
  for (const suffix of ["", "?connect_timeout=5"]) {
    assert.doesNotThrow(() => resolveConfiguration({
      [OPT_IN_ENV]: "1",
      [OWNER_URL_ENV]: `postgresql://${OWNER_ROLE}@127.0.0.1/${DATABASE_NAME}${suffix}`,
      [PROBE_URL_ENV]: `postgresql://${PROBE_ROLE}@[::1]/${DATABASE_NAME}${suffix}`,
    }));
  }
  for (const changed of [
    {
      [OWNER_URL_ENV]: `postgresql://${OWNER_ROLE}@127.0.0.1/${DATABASE_NAME}?connect_timeout=4`,
      [PROBE_URL_ENV]: `postgresql://${PROBE_ROLE}@127.0.0.1/${DATABASE_NAME}`,
    },
    {
      [OWNER_URL_ENV]: `postgresql://${OWNER_ROLE}@127.0.0.1/${DATABASE_NAME}?connect_timeout=5&application_name=test`,
      [PROBE_URL_ENV]: `postgresql://${PROBE_ROLE}@127.0.0.1/${DATABASE_NAME}`,
    },
    {
      [OWNER_URL_ENV]: `postgresql://${OWNER_ROLE}@127.0.0.1/${DATABASE_NAME}#fragment`,
      [PROBE_URL_ENV]: `postgresql://${PROBE_ROLE}@127.0.0.1/${DATABASE_NAME}`,
    },
    {
      [OWNER_URL_ENV]: `postgresql://${PROBE_ROLE}@127.0.0.1/${DATABASE_NAME}`,
      [PROBE_URL_ENV]: `postgresql://${OWNER_ROLE}@127.0.0.1/${DATABASE_NAME}`,
    },
  ]) {
    assert.throws(() => resolveConfiguration({
      [OPT_IN_ENV]: "1",
      ...changed,
    }), /database|role/u);
  }
});

test("protected helper-generated full-stack URLs satisfy the exact parser contract", () => {
  const rawContract = process.env[URL_CONTRACT_ENV];
  if (rawContract === undefined) return;
  const contract = JSON.parse(rawContract);
  const ownerPassword = process.env[URL_CONTRACT_OWNER_PASSWORD_ENV];
  const probePassword = process.env[URL_CONTRACT_PROBE_PASSWORD_ENV];
  assert.equal(typeof ownerPassword, "string");
  assert.equal(typeof probePassword, "string");
  const configuration = resolveConfiguration({
    [OPT_IN_ENV]: "1",
    [OWNER_URL_ENV]: contract.ownerDatabaseUrl,
    [PROBE_URL_ENV]: contract.probeDatabaseUrl,
  });
  const ownerUrl = new URL(configuration.ownerDatabaseUrl);
  const probeUrl = new URL(configuration.probeDatabaseUrl);
  assert.equal(decodeURIComponent(ownerUrl.username), OWNER_ROLE);
  assert.equal(decodeURIComponent(probeUrl.username), PROBE_ROLE);
  assert.equal(decodeURIComponent(ownerUrl.password), ownerPassword);
  assert.equal(decodeURIComponent(probeUrl.password), probePassword);
  assert.equal(ownerUrl.pathname, `/${DATABASE_NAME}`);
  assert.equal(probeUrl.pathname, `/${DATABASE_NAME}`);
  assert.equal(ownerUrl.search, "?connect_timeout=5");
  assert.equal(probeUrl.search, "?connect_timeout=5");
});

test("feedback/testimonial full-stack identity guards require restricted unprivileged roles", () => {
  const valid = {
    database_name: DATABASE_NAME,
    server_address: "127.0.0.1",
    current_role: OWNER_ROLE,
    database_owner: OWNER_ROLE,
    database_marker: DATABASE_MARKER,
    role_superuser: false,
    role_create_db: false,
    role_create_role: false,
    role_bypass_rls: false,
    role_inherit: false,
    role_membership_count: 0,
  };
  assert.doesNotThrow(() => assertIdentity(valid, OWNER_ROLE));
  assert.doesNotThrow(() => assertIdentity({ ...valid, server_address: "::1" }, OWNER_ROLE));
  for (const changed of [
    { database_name: "sharprunner_browser_test" },
    { server_address: "127.0.0.1/32" },
    { current_role: "postgres" },
    { database_owner: "postgres" },
    { database_marker: null },
    { database_marker: "unexpected" },
    { role_superuser: true },
    { role_create_db: true },
    { role_create_role: true },
    { role_bypass_rls: true },
    { role_inherit: true },
    { role_membership_count: 1 },
  ]) {
    assert.throws(() => assertIdentity({ ...valid, ...changed }, OWNER_ROLE));
  }
});

test("feedback/testimonial full-stack preflight uses the shared database marker before schema access", () => {
  const source = fs.readFileSync(__filename, "utf8");
  const queryBlock = source.match(/const queryIdentity = async \(client\) => \{[\s\S]*?^\};/mu);
  const verificationBlock = source.match(/const verifyTargets = async[\s\S]*?^\};/mu);
  assert.ok(queryBlock, "full-stack identity query must remain inspectable");
  assert.match(
    queryBlock[0],
    /shobj_description\(database\.oid, 'pg_database'::name\) AS database_marker/u,
  );
  assert.doesNotMatch(queryBlock[0], /(?<!sh)obj_description\(/u);
  assert.ok(verificationBlock, "full-stack target verification must remain inspectable");
  assert.ok(
    verificationBlock[0].indexOf("assertIdentity(await queryIdentity(ownerClient)")
      < verificationBlock[0].indexOf("assertFullSchema(ownerClient)"),
    "owner marker identity must be verified before schema access can continue",
  );
});

test("feedback/testimonial full-stack suite is registered once with exact scenarios", () => {
  const runner = fs.readFileSync(path.resolve(__dirname, "runTests.js"), "utf8");
  assert.equal(
    (runner.match(/require\("\.\/feedbackTestimonialFullStack\.postgres\.test"\);/gu) || []).length,
    1,
  );
  assert.deepEqual(SCENARIO_IDS, [
    "platform-feedback-idempotency-savepoint",
    "author-moderation-public-lifecycle",
    "withdrawal-suspension-recovery",
    "concurrent-lifecycle-races",
    "public-read-eligibility-pagination",
    "rls-privilege-cleanup",
  ]);
});

test("feedback/testimonial full-stack migration preflight compares the exact named registry", () => {
  const source = fs.readFileSync(__filename, "utf8");
  const preflightBlock = source.match(
    /const assertFullSchema = async \(ownerClient\) => \{[\s\S]*?^\};/mu,
  );
  assert.ok(preflightBlock, "full-stack schema preflight must remain inspectable");
  assert.match(
    preflightBlock[0],
    /SELECT "name" FROM "SharpRunnerMigrations" ORDER BY "name" ASC/u,
  );
  assert.doesNotMatch(preflightBlock[0], /ORDER BY "id"/u);

  const { migrations } = require("../src/services/migrationService");
  const registeredNames = migrations.map(([name]) => name);
  assert.equal(registeredNames.length, 36);
  const rows = [...registeredNames]
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({ name }));
  assert.doesNotThrow(() => assertExactMigrationRegistry(rows, registeredNames));
  for (const changedRows of [
    rows.slice(1),
    [...rows, { name: "20990101000000_unregistered" }],
    [...rows, { name: rows[0].name }],
  ]) {
    assert.throws(
      () => assertExactMigrationRegistry(changedRows, registeredNames),
      /exact registered migration chain/u,
    );
  }
});

const queryIdentity = async (client) => {
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
           (SELECT COUNT(*)::integer FROM pg_auth_members membership
             WHERE membership.member = role.oid) AS role_membership_count
    FROM pg_database database
    JOIN pg_roles role ON role.rolname = current_user
    WHERE database.datname = current_database()
  `);
  assert.equal(rows.length, 1);
  return rows[0];
};

const assertExactMigrationRegistry = (appliedRows, registeredNames) => {
  const expectedNames = [...registeredNames].sort();
  assert.deepEqual(
    appliedRows.map(({ name }) => name),
    expectedNames,
    "the exact registered migration chain must already be applied",
  );
};

const assertFullSchema = async (ownerClient) => {
  const { migrations } = require("../src/services/migrationService");
  const registeredNames = migrations.map(([name]) => name);
  const applied = await ownerClient.query(`
    SELECT "name" FROM "SharpRunnerMigrations" ORDER BY "name" ASC
  `);
  assertExactMigrationRegistry(applied.rows, registeredNames);

  const tables = await ownerClient.query(`
    SELECT relation.relname, relation.relrowsecurity
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
    ORDER BY relation.relname
  `, [PROTECTED_TABLES]);
  assert.deepEqual(tables.rows.map(({ relname }) => relname), [...PROTECTED_TABLES].sort());
  assert.ok(tables.rows.every(({ relrowsecurity }) => relrowsecurity === true));

  const constraints = await ownerClient.query(`
    SELECT constraint_row.conname, constraint_row.convalidated
    FROM pg_constraint constraint_row
    WHERE constraint_row.conname = ANY($1::text[])
    ORDER BY constraint_row.conname
  `, [REQUIRED_CONSTRAINTS]);
  assert.deepEqual(
    constraints.rows.map(({ conname }) => conname),
    [...REQUIRED_CONSTRAINTS].sort(),
  );
  assert.ok(constraints.rows.every(({ convalidated }) => convalidated === true));

  const triggers = await ownerClient.query(`
    SELECT trigger_row.tgname
    FROM pg_trigger trigger_row
    WHERE NOT trigger_row.tgisinternal AND trigger_row.tgname = ANY($1::text[])
    ORDER BY trigger_row.tgname
  `, [REQUIRED_TRIGGERS]);
  assert.deepEqual(triggers.rows.map(({ tgname }) => tgname), [...REQUIRED_TRIGGERS].sort());
  const indexes = await ownerClient.query(`
    SELECT index_row.indexname
    FROM pg_indexes index_row
    WHERE index_row.schemaname = 'public' AND index_row.indexname = ANY($1::text[])
    ORDER BY index_row.indexname
  `, [REQUIRED_INDEXES]);
  assert.deepEqual(indexes.rows.map(({ indexname }) => indexname), [...REQUIRED_INDEXES].sort());
};

const assertProbeBaseline = async (probeClient) => {
  const scope = await probeClient.query(`
    SELECT has_database_privilege(current_user, current_database(), 'CONNECT') AS can_connect,
           has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_database_objects,
           has_database_privilege(current_user, current_database(), 'TEMPORARY') AS can_create_temporary_objects,
           has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_schema,
           has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_schema_objects
  `);
  assert.deepEqual(scope.rows[0], {
    can_connect: true,
    can_create_database_objects: false,
    can_create_temporary_objects: false,
    can_use_schema: true,
    can_create_schema_objects: false,
  });
  for (const tableName of PROTECTED_TABLES) {
    const privilege = await probeClient.query(
      "SELECT has_table_privilege(current_user, $1, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS has_any",
      [`public.\"${tableName}\"`],
    );
    assert.equal(privilege.rows[0].has_any, false, `${tableName} must deny probe table access`);
  }
  for (const sequenceName of PROTECTED_SEQUENCES) {
    const privilege = await probeClient.query(
      "SELECT has_sequence_privilege(current_user, $1, 'USAGE,SELECT,UPDATE') AS has_any",
      [`public.\"${sequenceName}\"`],
    );
    assert.equal(privilege.rows[0].has_any, false, `${sequenceName} must deny probe sequence access`);
  }
};

const verifyTargets = async (configuration) => {
  const ownerClient = new Client({ connectionString: configuration.ownerDatabaseUrl });
  const probeClient = new Client({ connectionString: configuration.probeDatabaseUrl });
  await ownerClient.connect();
  await probeClient.connect();
  try {
    assertIdentity(await queryIdentity(ownerClient), OWNER_ROLE);
    assertIdentity(await queryIdentity(probeClient), PROBE_ROLE);
    await assertFullSchema(ownerClient);
    await assertProbeBaseline(probeClient);
    return { ownerClient, probeClient };
  } catch (error) {
    await Promise.allSettled([ownerClient.end(), probeClient.end()]);
    throw error;
  }
};

const randomToken = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;

const loadRuntime = () => {
  const database = require("../src/config/database");
  const models = require("../src/models");
  const { createPlatformFeedbackService } = require("../src/services/platformFeedbackService");
  const {
    createPublicTestimonialAuthorService,
    createTestimonialConsentConfiguration,
  } = require("../src/services/publicTestimonialAuthorService");
  const {
    createPublicTestimonialModerationService,
  } = require("../src/services/publicTestimonialModerationService");
  const {
    createAccountStatusTransitionService,
  } = require("../src/services/accountStatusTransitionService");
  const {
    createPublicTestimonialReadService,
  } = require("../src/services/publicTestimonialReadService");
  const consentConfiguration = createTestimonialConsentConfiguration({
    consentVersion: "phase8-rehearsal-v1",
    consentText: "Synthetic rehearsal disclosure; never production consent.",
    previewSecret: randomToken("synthetic_test_secret"),
  });
  assert.ok(consentConfiguration);
  return {
    database,
    models,
    consentConfiguration,
    platformService: createPlatformFeedbackService({ sequelize: database, models }),
    authorService: createPublicTestimonialAuthorService({
      sequelize: database,
      models,
      consentConfiguration,
    }),
    moderationService: createPublicTestimonialModerationService({
      sequelize: database,
      models,
      auditLogger: async () => {},
    }),
    accountService: createAccountStatusTransitionService({ database, models }),
    publicReadService: createPublicTestimonialReadService({ database }),
    factories: {
      createPlatformFeedbackService,
      createPublicTestimonialAuthorService,
      createPublicTestimonialModerationService,
      createAccountStatusTransitionService,
      createPublicTestimonialReadService,
    },
  };
};

const createUser = async (runtime, role = "student") => {
  const token = randomToken(role);
  return runtime.models.User.create({
    firstName: role === "admin" ? "Rehearsal" : "Synthetic",
    lastName: role === "admin" ? "Moderator" : "Author",
    username: token,
    email: `${token}@example.invalid`,
    password: "synthetic-not-a-login-secret",
    role,
    status: "active",
    emailVerifiedAt: new Date(),
  });
};

const makeAuthorOperation = async (runtime, author, {
  attributionMode = "anonymous",
  idempotencyKey = randomToken("testimonial"),
  message = "Synthetic testimonial for PostgreSQL rehearsal.",
} = {}) => {
  const options = await runtime.authorService.getOptions({
    actorId: author.id,
    actorRole: author.role,
  });
  return {
    actorId: author.id,
    actorRole: author.role,
    attributionMode,
    consent: true,
    consentVersion: options.consentVersion,
    consentBinding: options.consentBinding,
    ...(attributionMode === "named"
      ? { publicNamePreviewVersion: options.publicNamePreviewVersion }
      : {}),
    idempotencyKey,
    message,
  };
};

const createAndApprove = async (runtime, author, admin, options = {}) => {
  const operation = await makeAuthorOperation(runtime, author, options);
  const created = await runtime.authorService.createTestimonial(operation);
  const approved = await runtime.moderationService.approve({
    actorId: admin.id,
    actorRole: "admin",
    submissionId: created.testimonial.id,
    revisionId: created.revision.id,
  });
  return { operation, created, approved };
};

const scenarioPlatformFeedback = async (runtime) => {
  const author = await createUser(runtime);
  const input = {
    actorId: author.id,
    actorRole: "student",
    message: "Synthetic private platform feedback.",
    idempotencyKey: randomToken("platform"),
  };
  const created = await runtime.platformService.submitPlatformFeedback(input);
  assert.equal(created.changed, true);
  const retry = await runtime.platformService.submitPlatformFeedback(input);
  assert.equal(retry.changed, false);
  assert.equal(retry.feedback.id, created.feedback.id);
  await assert.rejects(
    runtime.platformService.submitPlatformFeedback({ ...input, message: "Conflicting content." }),
    (error) => error?.code === "IDEMPOTENCY_KEY_CONFLICT",
  );

  let hideFirstLookup = true;
  const platformModel = new Proxy(runtime.models.PlatformFeedbackSubmission, {
    get(target, property, receiver) {
      if (property !== "findOne") return Reflect.get(target, property, receiver);
      return async (...argumentsList) => {
        if (hideFirstLookup) {
          hideFirstLookup = false;
          return null;
        }
        return target.findOne(...argumentsList);
      };
    },
  });
  const recoveryService = runtime.factories.createPlatformFeedbackService({
    sequelize: runtime.database,
    models: { ...runtime.models, PlatformFeedbackSubmission: platformModel },
  });
  const recovered = await recoveryService.submitPlatformFeedback(input);
  assert.equal(recovered.changed, false, "a real unique violation must recover through savepoint");
  assert.equal(recovered.feedback.id, created.feedback.id);
  const usable = await runtime.database.transaction(async (transaction) => (
    runtime.models.PlatformFeedbackSubmission.count({ transaction })
  ));
  assert.ok(usable >= 1, "the parent connection remains usable after savepoint recovery");
};

const scenarioAuthorModerationLifecycle = async (runtime) => {
  const [admin, namedAuthor, anonymousAuthor, rejectedAuthor] = await Promise.all([
    createUser(runtime, "admin"),
    createUser(runtime),
    createUser(runtime, "teacher"),
    createUser(runtime),
  ]);
  const named = await createAndApprove(runtime, namedAuthor, admin, { attributionMode: "named" });
  assert.equal(named.approved.changed, true);
  assert.equal(named.approved.revision.publicDisplayName, "Synthetic A.");
  const namedAuthorRetry = await runtime.authorService.createTestimonial(named.operation);
  assert.equal(namedAuthorRetry.changed, false);
  assert.equal(namedAuthorRetry.revision.id, named.created.revision.id);
  assert.equal(namedAuthorRetry.testimonial.currentRevision.moderationStatus, "approved");
  const namedModerationRetry = await runtime.moderationService.approve({
    actorId: admin.id,
    actorRole: "admin",
    submissionId: named.created.testimonial.id,
    revisionId: named.created.revision.id,
  });
  assert.equal(namedModerationRetry.changed, false);
  const anonymous = await createAndApprove(runtime, anonymousAuthor, admin);
  assert.equal(anonymous.approved.revision.publicDisplayName, null);

  const rejectedInput = await makeAuthorOperation(runtime, rejectedAuthor, {
    message: "This revision is rejected for lifecycle coverage.",
  });
  const rejected = await runtime.authorService.createTestimonial(rejectedInput);
  const rejection = await runtime.moderationService.reject({
    actorId: admin.id,
    actorRole: "admin",
    submissionId: rejected.testimonial.id,
    revisionId: rejected.revision.id,
    explanation: "Synthetic moderation explanation.",
  });
  assert.equal(rejection.revision.moderationStatus, "rejected");

  const revocation = await runtime.moderationService.revoke({
    actorId: admin.id,
    actorRole: "admin",
    submissionId: anonymous.created.testimonial.id,
    revisionId: anonymous.created.revision.id,
    explanation: "Synthetic revocation explanation.",
  });
  assert.equal(revocation.revision.moderationStatus, "revoked");
  const revocationRetry = await runtime.moderationService.revoke({
    actorId: admin.id,
    actorRole: "admin",
    submissionId: anonymous.created.testimonial.id,
    revisionId: anonymous.created.revision.id,
    explanation: "Synthetic revocation explanation.",
  });
  assert.equal(revocationRetry.changed, false);

  const editInput = await makeAuthorOperation(runtime, namedAuthor, {
    attributionMode: "named",
    message: "Edited testimonial awaiting renewed approval.",
  });
  const edited = await runtime.authorService.createRevision({
    ...editInput,
    submissionId: named.created.testimonial.id,
    baseRevisionId: named.created.revision.id,
  });
  assert.equal(edited.revision.moderationStatus, "pending");
  const revisions = await runtime.models.PublicTestimonialRevision.findAll({
    where: { submissionId: named.created.testimonial.id },
    order: [["revisionNumber", "ASC"]],
  });
  assert.equal(revisions.length, 2);
  assert.equal(revisions.filter((revision) => revision.isCurrent).length, 1);
  assert.equal(revisions[0].moderationStatus, "approved");
};

const scenarioWithdrawalSuspensionRecovery = async (runtime) => {
  const [admin, withdrawnAuthor, suspendedAuthor] = await Promise.all([
    createUser(runtime, "admin"),
    createUser(runtime),
    createUser(runtime),
  ]);
  const withdrawn = await createAndApprove(runtime, withdrawnAuthor, admin);
  const withdrawal = await runtime.authorService.withdrawTestimonial({
    actorId: withdrawnAuthor.id,
    actorRole: "student",
    submissionId: withdrawn.created.testimonial.id,
  });
  assert.equal(withdrawal.changed, true);
  assert.ok(withdrawal.testimonial.withdrawnAt);
  const repeated = await runtime.authorService.withdrawTestimonial({
    actorId: withdrawnAuthor.id,
    actorRole: "student",
    submissionId: withdrawn.created.testimonial.id,
  });
  assert.equal(repeated.changed, false);

  const suspended = await createAndApprove(runtime, suspendedAuthor, admin);
  await runtime.accountService.transition({ userId: suspendedAuthor.id, nextStatus: "inactive" });
  await runtime.accountService.transition({ userId: suspendedAuthor.id, nextStatus: "active" });
  let stored = await runtime.models.PublicTestimonialSubmission.findByPk(
    suspended.created.testimonial.id,
  );
  assert.ok(stored.publicationSuspendedAt, "reactivation must not republish an approval");
  const recoveryInput = await makeAuthorOperation(runtime, suspendedAuthor, {
    message: "Freshly consented recovery revision.",
  });
  const recovered = await runtime.authorService.createRevision({
    ...recoveryInput,
    submissionId: suspended.created.testimonial.id,
    baseRevisionId: suspended.created.revision.id,
  });
  assert.equal(recovered.revision.moderationStatus, "pending");
  stored = await runtime.models.PublicTestimonialSubmission.findByPk(suspended.created.testimonial.id);
  assert.equal(stored.publicationSuspendedAt, null);
  await runtime.accountService.transition({ userId: suspendedAuthor.id, nextStatus: "inactive" });
  stored = await runtime.models.PublicTestimonialSubmission.findByPk(suspended.created.testimonial.id);
  assert.ok(stored.publicationSuspendedAt, "later deactivation must suspend recovered history again");
};

const deferred = () => {
  let resolve;
  const promise = new Promise((onResolve) => { resolve = onResolve; });
  return { promise, resolve };
};

const waitForDatabaseLock = async (observer, deadlineMs = 5000) => {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const result = await observer.query(`
      SELECT COUNT(*)::integer AS waiting
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
    `);
    if (result.rows[0].waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("bounded lock observation did not see the competing operation wait");
};

const createGatedModels = (runtime, { method, matches }) => {
  const entered = deferred();
  const release = deferred();
  let used = false;
  const userModel = new Proxy(runtime.models.User, {
    get(target, property, receiver) {
      if (property !== method) return Reflect.get(target, property, receiver);
      return async (...argumentsList) => {
        const result = await target[property](...argumentsList);
        if (!used && matches(argumentsList, result)) {
          used = true;
          entered.resolve();
          await release.promise;
        }
        return result;
      };
    },
  });
  return {
    models: { ...runtime.models, User: userModel },
    entered: entered.promise,
    release: release.resolve,
  };
};

const assertOneCurrentRevision = async (runtime, submissionId) => {
  assert.equal(await runtime.models.PublicTestimonialRevision.count({
    where: { submissionId, isCurrent: true },
  }), 1);
};

const scenarioConcurrentLifecycleRaces = async (runtime, observer) => {
  const admin = await createUser(runtime, "admin");

  const runEditApproveRace = async (firstAction) => {
    const author = await createUser(runtime);
    const createInput = await makeAuthorOperation(runtime, author, {
      message: `Pending race base ${firstAction}.`,
    });
    const created = await runtime.authorService.createTestimonial(createInput);
    const base = await makeAuthorOperation(runtime, author, {
      message: `Race edit ${firstAction}.`,
    });
    const editInput = {
      ...base,
      submissionId: created.testimonial.id,
      baseRevisionId: created.revision.id,
    };
    const target = created.revision.id;
    const gate = createGatedModels(runtime, {
      method: firstAction === "edit" ? "findByPk" : "findAll",
      matches: (argumentsList) => (firstAction === "edit"
        ? argumentsList[0] === author.id
        : true),
    });
    const firstService = firstAction === "edit"
      ? runtime.factories.createPublicTestimonialAuthorService({
        sequelize: runtime.database,
        models: gate.models,
        consentConfiguration: runtime.consentConfiguration,
      })
      : runtime.factories.createPublicTestimonialModerationService({
        sequelize: runtime.database,
        models: gate.models,
        auditLogger: async () => {},
      });
    const first = firstAction === "edit"
      ? firstService.createRevision(editInput)
      : firstService.approve({
        actorId: admin.id,
        actorRole: "admin",
        submissionId: created.testimonial.id,
        revisionId: target,
      });
    await gate.entered;
    const second = firstAction === "edit"
      ? runtime.moderationService.approve({
        actorId: admin.id,
        actorRole: "admin",
        submissionId: created.testimonial.id,
        revisionId: target,
      })
      : runtime.authorService.createRevision(editInput);
    await waitForDatabaseLock(observer);
    gate.release();
    const outcomes = await Promise.allSettled([first, second]);
    assert.ok(outcomes.some(({ status }) => status === "fulfilled"));
    await assertOneCurrentRevision(runtime, created.testimonial.id);
  };

  await runEditApproveRace("edit");
  await runEditApproveRace("approve");

  const runWithdrawApproveRace = async (firstAction) => {
    const author = await createUser(runtime);
    const input = await makeAuthorOperation(runtime, author, { message: `Withdraw race ${firstAction}.` });
    const created = await runtime.authorService.createTestimonial(input);
    const gate = createGatedModels(runtime, {
      method: firstAction === "withdraw" ? "findByPk" : "findAll",
      matches: (argumentsList) => (firstAction === "withdraw"
        ? argumentsList[0] === author.id
        : true),
    });
    const firstService = firstAction === "withdraw"
      ? runtime.factories.createPublicTestimonialAuthorService({
        sequelize: runtime.database,
        models: gate.models,
        consentConfiguration: runtime.consentConfiguration,
      })
      : runtime.factories.createPublicTestimonialModerationService({
        sequelize: runtime.database,
        models: gate.models,
        auditLogger: async () => {},
      });
    const withdraw = (service) => service.withdrawTestimonial({
      actorId: author.id,
      actorRole: "student",
      submissionId: created.testimonial.id,
    });
    const approve = (service) => service.approve({
      actorId: admin.id,
      actorRole: "admin",
      submissionId: created.testimonial.id,
      revisionId: created.revision.id,
    });
    const first = firstAction === "withdraw" ? withdraw(firstService) : approve(firstService);
    await gate.entered;
    const second = firstAction === "withdraw"
      ? approve(runtime.moderationService)
      : withdraw(runtime.authorService);
    await waitForDatabaseLock(observer);
    gate.release();
    await Promise.allSettled([first, second]);
    const submission = await runtime.models.PublicTestimonialSubmission.findByPk(created.testimonial.id);
    assert.ok(submission.withdrawnAt, "withdrawal must remain terminal in either ordering");
    await assertOneCurrentRevision(runtime, created.testimonial.id);
  };
  await runWithdrawApproveRace("withdraw");
  await runWithdrawApproveRace("approve");

  const runEditDeactivateRace = async (firstAction) => {
    const author = await createUser(runtime);
    const fixture = await createAndApprove(runtime, author, admin);
    const revisionInput = await makeAuthorOperation(runtime, author, {
      message: `Deactivate race ${firstAction}.`,
    });
    const editInput = {
      ...revisionInput,
      submissionId: fixture.created.testimonial.id,
      baseRevisionId: fixture.created.revision.id,
    };
    const gate = createGatedModels(runtime, {
      method: "findByPk",
      matches: (argumentsList) => argumentsList[0] === author.id,
    });
    const firstService = firstAction === "edit"
      ? runtime.factories.createPublicTestimonialAuthorService({
        sequelize: runtime.database,
        models: gate.models,
        consentConfiguration: runtime.consentConfiguration,
      })
      : runtime.factories.createAccountStatusTransitionService({
        database: runtime.database,
        models: gate.models,
      });
    const edit = (service) => service.createRevision(editInput);
    const deactivate = (service) => service.transition({
      userId: author.id,
      nextStatus: "inactive",
    });
    const first = firstAction === "edit" ? edit(firstService) : deactivate(firstService);
    await gate.entered;
    const second = firstAction === "edit"
      ? deactivate(runtime.accountService)
      : edit(runtime.authorService);
    await waitForDatabaseLock(observer);
    gate.release();
    await Promise.allSettled([first, second]);
    const submission = await runtime.models.PublicTestimonialSubmission.findByPk(
      fixture.created.testimonial.id,
    );
    assert.ok(submission.publicationSuspendedAt, "deactivation must win publication safety");
    await assertOneCurrentRevision(runtime, fixture.created.testimonial.id);
  };
  await runEditDeactivateRace("edit");
  await runEditDeactivateRace("deactivate");
};

const scenarioPublicRead = async (runtime) => {
  const admin = await createUser(runtime, "admin");
  const baseline = await runtime.publicReadService.listTestimonials({ page: 1, limit: 50, offset: 0 });
  const approved = [];
  const sharedApprovedAt = new Date(Date.now() + 60000);
  const tieModerationService = runtime.factories.createPublicTestimonialModerationService({
    sequelize: runtime.database,
    models: runtime.models,
    auditLogger: async () => {},
    now: () => sharedApprovedAt,
  });
  for (const attributionMode of ["named", "anonymous", "named", "anonymous"]) {
    const author = await createUser(runtime, attributionMode === "anonymous" ? "teacher" : "student");
    const operation = await makeAuthorOperation(runtime, author, {
      attributionMode,
      message: `Public ordering ${approved.length + 1}.`,
    });
    const created = await runtime.authorService.createTestimonial(operation);
    const approval = await tieModerationService.approve({
      actorId: admin.id,
      actorRole: "admin",
      submissionId: created.testimonial.id,
      revisionId: created.revision.id,
    });
    approved.push({ author, operation, created, approval });
  }
  const pageOne = await runtime.publicReadService.listTestimonials({ page: 1, limit: 2, offset: 0 });
  const pageTwo = await runtime.publicReadService.listTestimonials({ page: 2, limit: 2, offset: 2 });
  assert.equal(pageOne.total, baseline.total + 4);
  assert.equal(pageTwo.total, pageOne.total);
  const visibleNew = [...pageOne.testimonials, ...pageTwo.testimonials]
    .filter(({ id }) => approved.some(({ created }) => created.revision.id === id));
  assert.equal(visibleNew.length, 4, "the four newly approved rows must occupy the first two pages");
  for (const item of visibleNew) {
    assert.deepEqual(Object.keys(item).sort(), ["approvedAt", "displayName", "id", "message"]);
    assert.ok(item.displayName === "Anonymous user" || item.displayName === "Synthetic A.");
  }
  const expectedTieOrder = approved.map(({ created }) => created.revision.id).sort((left, right) => right - left);
  assert.deepEqual(
    visibleNew.map(({ id }) => id),
    expectedTieOrder.slice(0, visibleNew.length),
    "equal approval timestamps must use revision ID descending as the stable tie-breaker",
  );
  const outOfRange = await runtime.publicReadService.listTestimonials({
    page: Math.ceil(pageOne.total / 2) + 1,
    limit: 2,
    offset: Math.ceil(pageOne.total / 2) * 2,
  });
  assert.deepEqual(outOfRange.testimonials, []);
  for (const fixture of approved) {
    await runtime.authorService.withdrawTestimonial({
      actorId: fixture.author.id,
      actorRole: fixture.author.role,
      submissionId: fixture.created.testimonial.id,
    });
  }
  const afterWithdrawal = await runtime.publicReadService.listTestimonials({
    page: 1,
    limit: 50,
    offset: 0,
  });
  assert.equal(afterWithdrawal.total, baseline.total);
};

const assertSqlState = (expectedCode) => (error) => error?.code === expectedCode;

const scenarioRlsPrivileges = async (runtime, ownerClient, probeClient) => {
  const author = await createUser(runtime);
  const fixture = await runtime.authorService.createTestimonial(
    await makeAuthorOperation(runtime, author, { message: "RLS fixture testimonial." }),
  );
  await assertProbeBaseline(probeClient);
  for (const sequenceName of PROTECTED_SEQUENCES) {
    await assert.rejects(
      probeClient.query(`SELECT nextval('public."${sequenceName}"')`),
      assertSqlState("42501"),
    );
  }

  const maxima = await ownerClient.query(`
    SELECT
      (SELECT COALESCE(MAX("id"), 0) + 1000000 FROM "PlatformFeedbackSubmissions") AS platform_id,
      (SELECT COALESCE(MAX("id"), 0) + 1000000 FROM "PublicTestimonialSubmissions") AS submission_id,
      (SELECT COALESCE(MAX("id"), 0) + 1000000 FROM "PublicTestimonialRevisions") AS revision_id
  `);
  const ids = maxima.rows[0];
  const candidates = [
    {
      table: "PlatformFeedbackSubmissions",
      sql: `INSERT INTO "PlatformFeedbackSubmissions"
        ("id", "authorUserId", "message", "idempotencyKey", "createdAt", "updatedAt")
        VALUES ($1, $2, 'Valid explicit RLS candidate.', $3, NOW(), NOW())`,
      values: [ids.platform_id, author.id, randomToken("rls_platform")],
    },
    {
      table: "PublicTestimonialSubmissions",
      sql: `INSERT INTO "PublicTestimonialSubmissions"
        ("id", "authorUserId", "idempotencyKey", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, NOW(), NOW())`,
      values: [ids.submission_id, author.id, randomToken("rls_submission")],
    },
    {
      table: "PublicTestimonialRevisions",
      sql: `INSERT INTO "PublicTestimonialRevisions"
        ("id", "submissionId", "authorUserId", "revisionNumber", "isCurrent", "message",
         "attributionMode", "consentVersion", "consentedAt", "idempotencyKey",
         "moderationStatus", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, 999999, FALSE, 'Valid explicit RLS candidate.',
                'anonymous', 'phase8-rehearsal-v1', NOW(), $4, 'pending', NOW(), NOW())`,
      values: [ids.revision_id, fixture.testimonial.id, author.id, randomToken("rls_revision")],
    },
  ];

  for (const candidate of candidates) {
    await ownerClient.query("BEGIN");
    try {
      await ownerClient.query(candidate.sql, candidate.values);
    } finally {
      await ownerClient.query("ROLLBACK");
    }
    try {
      await ownerClient.query(`GRANT SELECT, INSERT ON TABLE public."${candidate.table}" TO "${PROBE_ROLE}"`);
      const visible = await probeClient.query(`SELECT COUNT(*)::integer AS count FROM public."${candidate.table}"`);
      assert.equal(visible.rows[0].count, 0, `${candidate.table} RLS must hide owner rows`);
      await assert.rejects(
        probeClient.query(candidate.sql, candidate.values),
        (error) => error?.code === "42501" && /row-level security/u.test(error.message),
      );
    } finally {
      await ownerClient.query(`REVOKE ALL PRIVILEGES ON TABLE public."${candidate.table}" FROM "${PROBE_ROLE}"`);
    }
  }
  await assertProbeBaseline(probeClient);
};

const runFullStackWorker = async (configuration) => {
  process.env.DATABASE_URL = configuration.ownerDatabaseUrl;
  process.env.DB_SSL = "0";
  const { ownerClient, probeClient } = await verifyTargets(configuration);
  const runtime = loadRuntime();
  const completed = [];
  const run = async (id, callback) => {
    await callback();
    completed.push({ id, status: "passed" });
  };
  try {
    await run(SCENARIO_IDS[0], () => scenarioPlatformFeedback(runtime));
    await run(SCENARIO_IDS[1], () => scenarioAuthorModerationLifecycle(runtime));
    await run(SCENARIO_IDS[2], () => scenarioWithdrawalSuspensionRecovery(runtime));
    await run(SCENARIO_IDS[3], () => scenarioConcurrentLifecycleRaces(runtime, ownerClient));
    await run(SCENARIO_IDS[4], () => scenarioPublicRead(runtime));
    await run(SCENARIO_IDS[5], () => scenarioRlsPrivileges(runtime, ownerClient, probeClient));
    assert.deepEqual(completed, SCENARIO_IDS.map((id) => ({ id, status: "passed" })));
    emitWorkerCompletionAcknowledgement({ suiteId: WORKER_SUITE_ID, scenarios: completed });
  } finally {
    await Promise.allSettled([
      runtime.database.close(),
      ownerClient.end(),
      probeClient.end(),
    ]);
  }
};

const configuration = resolveConfiguration(process.env);
const isFullStackWorker = process.env[WORKER_ENV] === "1";
const isSyncSchemaWorker = process.env[SYNC_WORKER_ENV] === "1";

if (isSyncSchemaWorker) {
  test("feedback/testimonial Sequelize sync schema worker", async () => {
    require("../src/models");
    const database = require("../src/config/database");
    try {
      await database.sync();
      emitWorkerCompletionAcknowledgement({
        suiteId: SYNC_WORKER_SUITE_ID,
        scenarios: [{ id: "sequelize-sync-schema-created", status: "passed" }],
      });
    } finally {
      await database.close();
    }
  });
} else if (isFullStackWorker) {
  test("feedback/testimonial full-schema production rehearsal scenarios", { timeout: 180000 }, async () => {
    assert.ok(configuration, "worker configuration must be complete");
    await runFullStackWorker(configuration);
  });
} else {
  const fullStackTest = configuration ? test : test.skip;
  fullStackTest("feedback/testimonial guarded full-schema PostgreSQL rehearsal", async () => {
    await runPostgresWorker({
      scriptPath: __filename,
      suiteId: WORKER_SUITE_ID,
      expectedScenarioIds: SCENARIO_IDS,
      environment: {
        [OPT_IN_ENV]: "1",
        [OWNER_URL_ENV]: configuration.ownerDatabaseUrl,
        [PROBE_URL_ENV]: configuration.probeDatabaseUrl,
        [WORKER_ENV]: "1",
        DATABASE_URL: configuration.ownerDatabaseUrl,
        DB_SSL: "0",
      },
      redactDiagnostics: (value) => redactDiagnostics(value, configuration),
    });
  });
}
