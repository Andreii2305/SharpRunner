const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { Client } = require("pg");

const models = require("../src/models");
const sequelize = require("../src/config/database");
const { PLAYABLE_LEVEL_KEYS } = require("../src/constants/progressDefaults");
const { migrations, runMigrations } = require("../src/services/migrationService");

const migrationName = "20261031000000_game_interruption_completion_evidence";
const migrationPath = path.resolve(
  __dirname,
  `../../supabase/migrations/${migrationName}.sql`,
);

const evidenceInput = (extra = {}) => ({
  studentId: 11,
  classroomId: 25,
  levelKey: PLAYABLE_LEVEL_KEYS[0],
  policyVersion: "game-interruption-deduction/v1",
  appliedEventCount: 2,
  baseScore: "95.00",
  scoreDeduction: "2.25",
  finalScore: "92.75",
  grossCompletionXp: 25,
  xpDeduction: 20,
  netCompletionXp: 5,
  completedAt: new Date("2026-10-29T00:10:00.000Z"),
  ...extra,
});

test("completion evidence model stores exact immutable calculation inputs and validates arithmetic", async () => {
  const Evidence = models.GameInterruptionCompletionEvidence;
  assert.ok(Evidence, "GameInterruptionCompletionEvidence must be registered");
  assert.equal(Evidence.rawAttributes.id.type.key, "INTEGER");
  assert.equal(Evidence.rawAttributes.baseScore.type.key, "DECIMAL");
  assert.equal(Evidence.rawAttributes.scoreDeduction.type.key, "DECIMAL");
  assert.equal(Evidence.rawAttributes.finalScore.type.key, "DECIMAL");
  assert.equal(Evidence.rawAttributes.grossCompletionXp.type.key, "INTEGER");
  assert.equal(Evidence.rawAttributes.xpDeduction.type.key, "INTEGER");
  assert.equal(Evidence.rawAttributes.netCompletionXp.type.key, "INTEGER");
  assert.equal(Evidence.options.updatedAt, false);

  await assert.doesNotReject(Evidence.build(evidenceInput()).validate());
  await assert.doesNotReject(Evidence.build(evidenceInput({
    appliedEventCount: 0,
    scoreDeduction: "0.00",
    finalScore: "95.00",
    xpDeduction: 0,
    netCompletionXp: 25,
  })).validate());

  for (const extra of [
    { levelKey: "unknown-level-1" },
    { policyVersion: "" },
    { appliedEventCount: -1 },
    { baseScore: "74.99", scoreDeduction: "0.00", finalScore: "74.99" },
    { baseScore: "100.01", scoreDeduction: "0.00", finalScore: "100.01" },
    { scoreDeduction: "20.01", finalScore: "74.99" },
    { scoreDeduction: "1.234", finalScore: "93.766" },
    { finalScore: "93.00" },
    { grossCompletionXp: -1 },
    { xpDeduction: 26, netCompletionXp: -1 },
    { xpDeduction: 20.5, netCompletionXp: 4.5 },
    { netCompletionXp: 6 },
    { completedAt: null },
  ]) {
    await assert.rejects(Evidence.build(evidenceInput(extra)).validate());
  }
});

test("evidence links preserve applied-zero versus unapplied-null model semantics", async () => {
  const { GameInterruptionEvent: Event, XpTransaction } = models;
  assert.equal(Event.rawAttributes.completionEvidenceId.type.key, "INTEGER");
  assert.equal(Event.rawAttributes.completionEvidenceId.allowNull, true);
  assert.equal(Event.rawAttributes.completionEvidenceId.defaultValue, null);
  assert.equal(XpTransaction.rawAttributes.completionEvidenceId.type.key, "INTEGER");
  assert.equal(XpTransaction.rawAttributes.completionEvidenceId.allowNull, true);

  const baseEvent = {
    sessionId: 7,
    studentId: 11,
    eventKey: "event_key_123456",
    eventType: "hidden",
    receivedAt: new Date("2026-10-29T00:01:00.000Z"),
  };
  await assert.doesNotReject(Event.build(baseEvent).validate());
  await assert.doesNotReject(Event.build({
    ...baseEvent,
    completionEvidenceId: 9,
    appliedAt: new Date("2026-10-29T00:10:00.000Z"),
    appliedScoreDeduction: "0.00",
    appliedXpDeduction: 0,
  }).validate());
  await assert.rejects(Event.build({
    ...baseEvent,
    appliedAt: new Date("2026-10-29T00:10:00.000Z"),
    appliedScoreDeduction: "0.00",
    appliedXpDeduction: 0,
  }).validate());
  await assert.rejects(Event.build({ ...baseEvent, completionEvidenceId: 9 }).validate());
  await assert.rejects(Event.build({ ...baseEvent, completionEvidenceId: 0 }).validate());

  await assert.doesNotReject(XpTransaction.build({
    userId: 11,
    amount: 5,
    kind: "level_completion",
    referenceType: "level",
    referenceId: PLAYABLE_LEVEL_KEYS[0],
    completionEvidenceId: 9,
  }).validate());
  await assert.rejects(XpTransaction.build({
    userId: 11,
    amount: -30,
    kind: "detailed_hint_purchase",
    referenceType: "level",
    referenceId: PLAYABLE_LEVEL_KEYS[0],
    completionEvidenceId: 9,
  }).validate());
  await assert.rejects(XpTransaction.build({
    userId: 11,
    amount: 5,
    kind: "level_completion",
    referenceType: "level",
    referenceId: PLAYABLE_LEVEL_KEYS[0],
    completionEvidenceId: 0,
  }).validate());
});

test("completion evidence associations are retained and uniquely scoped", () => {
  const {
    Classroom,
    GameInterruptionCompletionEvidence: Evidence,
    GameInterruptionEvent: Event,
    User,
    XpTransaction,
  } = models;
  assert.equal(User.associations.gameInterruptionCompletionEvidence.target, Evidence);
  assert.equal(User.associations.gameInterruptionCompletionEvidence.options.onDelete, "RESTRICT");
  assert.equal(Classroom.associations.gameInterruptionCompletionEvidence.target, Evidence);
  assert.equal(Evidence.associations.appliedEvents.target, Event);
  assert.equal(Event.associations.completionEvidence.target, Evidence);
  assert.equal(Evidence.associations.xpTransaction.target, XpTransaction);
  assert.equal(XpTransaction.associations.completionEvidence.target, Evidence);
  assert.equal(Event.associations.completionEvidence.options.onDelete, "RESTRICT");
  assert.equal(XpTransaction.associations.completionEvidence.options.onDelete, "RESTRICT");

  assert.ok(Evidence.options.indexes.some((index) => index.unique
    && index.fields.join(",") === "studentId,levelKey"));
  assert.ok(XpTransaction.options.indexes.some((index) => index.unique
    && index.fields.join(",") === "completionEvidenceId"));
});

test("completion evidence migration precedes the report index and encodes retained immutable evidence", async () => {
  assert.equal(fs.existsSync(migrationPath), true, "completion evidence migration SQL must exist");
  const sql = fs.readFileSync(migrationPath, "utf8");
  const names = migrations.map(([name]) => name);
  const migrationIndex = names.indexOf(migrationName);
  assert.equal(names[migrationIndex + 1], "20261031120000_game_interruption_report_index");
  assert.ok(migrationIndex > names.indexOf("20261030000000_game_interruption_history"));

  assert.match(sql, /^\s*(?:--[^\n]*\n)*\s*BEGIN;/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "GameInterruptionCompletionEvidence"/);
  assert.match(sql, /UNIQUE \("studentId", "levelKey"\)/);
  assert.match(sql, /NUMERIC\(5, 2\)/);
  assert.match(sql, /"finalScore" >= 75/);
  assert.match(sql, /"baseScore" - "scoreDeduction" = "finalScore"/);
  assert.match(sql, /"grossCompletionXp" - "xpDeduction" = "netCompletionXp"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "completionEvidenceId" INTEGER/);
  assert.match(sql, /prevent_game_interruption_completion_evidence_mutation/);
  assert.match(sql, /validate_game_interruption_event_completion_evidence/);
  assert.match(sql, /protect_game_interruption_session_evidence_scope/);
  assert.match(sql, /validate_xp_transaction_completion_evidence/);
  assert.match(sql, /ON DELETE RESTRICT/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE/);
  assert.match(sql, /ARRAY\['anon', 'authenticated'\]/);
  assert.doesNotMatch(sql, /SECURITY DEFINER/i);
  assert.doesNotMatch(
    sql,
    /ALTER COLUMN "(?:baseScore|scoreDeduction|finalScore|grossCompletionXp|xpDeduction|netCompletionXp)" TYPE/,
  );
  assert.doesNotMatch(sql, /TRUNCATE|DELETE FROM/i);
  assert.match(sql, /COMMIT;\s*$/);

  const originalQuery = sequelize.query;
  const queries = [];
  sequelize.query = async (statement) => { queries.push(statement); };
  try {
    await migrations[migrationIndex][1]();
  } finally {
    sequelize.query = originalQuery;
  }
  assert.deepEqual(queries, [sql]);
});

test("migration runner records completion evidence once and skips registered reruns", async () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const names = migrations.map(([name]) => name);
  const originalQuery = sequelize.query;
  const firstRun = [];
  sequelize.query = async (statement, options = {}) => {
    firstRun.push({ statement, options });
    if (/SELECT "name" FROM "SharpRunnerMigrations"/.test(statement)) {
      return [names.filter((name) => name !== migrationName).map((name) => ({ name }))];
    }
    return [[], undefined];
  };
  try {
    await runMigrations();
  } finally {
    sequelize.query = originalQuery;
  }
  assert.equal(firstRun.filter(({ statement }) => statement === sql).length, 1);
  assert.equal(
    firstRun.find(({ statement }) => /INSERT INTO "SharpRunnerMigrations"/.test(statement))
      ?.options?.replacements?.name,
    migrationName,
  );

  const secondRun = [];
  sequelize.query = async (statement) => {
    secondRun.push(statement);
    if (/SELECT "name" FROM "SharpRunnerMigrations"/.test(statement)) {
      return [names.map((name) => ({ name }))];
    }
    return [[], undefined];
  };
  try {
    await runMigrations();
  } finally {
    sequelize.query = originalQuery;
  }
  assert.equal(secondRun.includes(sql), false);
});

const databaseUrl = process.env.GAME_INTERRUPTION_COMPLETION_EVIDENCE_DATABASE_URL;
const postgresTest = databaseUrl ? test : test.skip;

postgresTest("completion evidence migration is rerunnable and enforces cross-table integrity on PostgreSQL", async () => {
  const parsed = new URL(databaseUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
  assert.equal(
    parsed.pathname.slice(1),
    "sharprunner_game_interruption_completion_evidence_rehearsal",
  );
  const client = new Client({ connectionString: databaseUrl });
  const historySql = fs.readFileSync(path.resolve(
    __dirname,
    "../../supabase/migrations/20261030000000_game_interruption_history.sql",
  ), "utf8");
  const sql = fs.readFileSync(migrationPath, "utf8");
  await client.connect();
  try {
    const { rows: existingTables } = await client.query(
      "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'",
    );
    assert.deepEqual(existingTables, [], "rehearsal database must be newly created and empty");
    await client.query(`
      CREATE TABLE "Users" ("id" INTEGER PRIMARY KEY);
      CREATE TABLE "Classrooms" ("id" INTEGER PRIMARY KEY);
      CREATE TABLE "XpTransactions" (
        "id" SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
        "amount" INTEGER NOT NULL CHECK ("amount" <> 0),
        "kind" VARCHAR(40) NOT NULL,
        "referenceType" VARCHAR(40) NOT NULL,
        "referenceId" VARCHAR(160) NOT NULL,
        "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE ("userId", "kind", "referenceType", "referenceId")
      );
      INSERT INTO "Users" ("id") VALUES (1), (2);
      INSERT INTO "Classrooms" ("id") VALUES (10), (11);
    `);
    await client.query(historySql);
    const incompatibleSession = await client.query(`
      INSERT INTO "GameInterruptionSessions"
        ("studentId", "classroomId", "levelKey", "sessionKey",
         "scoreDeductionSnapshot", "xpDeductionSnapshot")
      VALUES (1, 10, '${PLAYABLE_LEVEL_KEYS[0]}', 'incompatible_session', 1, 10)
      RETURNING "id"
    `);
    await client.query(`
      INSERT INTO "GameInterruptionEvents"
        ("sessionId", "studentId", "eventKey", "eventType", "appliedAt",
         "appliedScoreDeduction", "appliedXpDeduction")
      VALUES ($1, 1, 'incompatible_event', 'hidden', NOW(), 0, 0)
    `, [incompatibleSession.rows[0].id]);
    await assert.rejects(client.query(sql), /check constraint|violates check/i);
    await client.query("ROLLBACK");
    await client.query('DELETE FROM "GameInterruptionEvents" WHERE "eventKey" = \'incompatible_event\'');
    await client.query('DELETE FROM "GameInterruptionSessions" WHERE "sessionKey" = \'incompatible_session\'');
    await client.query(sql);
    await client.query(sql);

    const session = await client.query(`
      INSERT INTO "GameInterruptionSessions"
        ("studentId", "classroomId", "levelKey", "sessionKey",
         "scoreDeductionSnapshot", "xpDeductionSnapshot")
      VALUES (1, 10, '${PLAYABLE_LEVEL_KEYS[0]}', 'session_key_1234', 1, 10)
      RETURNING "id"
    `);
    const event = await client.query(`
      INSERT INTO "GameInterruptionEvents"
        ("sessionId", "studentId", "eventKey", "eventType")
      VALUES ($1, 1, 'event_key_123456', 'hidden') RETURNING "id"
    `, [session.rows[0].id]);
    const evidence = await client.query(`
      INSERT INTO "GameInterruptionCompletionEvidence"
        ("studentId", "classroomId", "levelKey", "policyVersion",
         "appliedEventCount", "baseScore", "scoreDeduction", "finalScore",
         "grossCompletionXp", "xpDeduction", "netCompletionXp", "completedAt")
      VALUES (1, 10, '${PLAYABLE_LEVEL_KEYS[0]}', 'game-interruption-deduction/v1',
        1, 95, 1, 94, 25, 10, 15, NOW()) RETURNING "id"
    `);
    const evidenceId = evidence.rows[0].id;
    await client.query(`
      UPDATE "GameInterruptionEvents"
      SET "completionEvidenceId" = $1, "appliedAt" = NOW(),
          "appliedScoreDeduction" = 0, "appliedXpDeduction" = 0
      WHERE "id" = $2
    `, [evidenceId, event.rows[0].id]);
    await client.query(`
      INSERT INTO "XpTransactions"
        ("userId", "amount", "kind", "referenceType", "referenceId", "completionEvidenceId")
      VALUES (1, 15, 'level_completion', 'level', '${PLAYABLE_LEVEL_KEYS[0]}', $1)
    `, [evidenceId]);

    await assert.rejects(client.query(`
      INSERT INTO "GameInterruptionCompletionEvidence"
        ("studentId", "classroomId", "levelKey", "policyVersion",
         "appliedEventCount", "baseScore", "scoreDeduction", "finalScore",
         "grossCompletionXp", "xpDeduction", "netCompletionXp", "completedAt")
      VALUES (1, 11, '${PLAYABLE_LEVEL_KEYS[0]}', 'game-interruption-deduction/v1',
        0, 95, 0, 95, 25, 0, 25, NOW())
    `), /duplicate key/i);
    await assert.rejects(client.query(
      'UPDATE "GameInterruptionCompletionEvidence" SET "appliedEventCount" = 2 WHERE "id" = $1',
      [evidenceId],
    ), /immutable/i);
    await assert.rejects(client.query(
      'DELETE FROM "GameInterruptionCompletionEvidence" WHERE "id" = $1',
      [evidenceId],
    ), /immutable/i);

    const otherEvidence = await client.query(`
      INSERT INTO "GameInterruptionCompletionEvidence"
        ("studentId", "classroomId", "levelKey", "policyVersion",
         "appliedEventCount", "baseScore", "scoreDeduction", "finalScore",
         "grossCompletionXp", "xpDeduction", "netCompletionXp", "completedAt")
      VALUES (2, 11, '${PLAYABLE_LEVEL_KEYS[1]}', 'game-interruption-deduction/v1',
        0, 95, 0, 95, 25, 0, 25, NOW()) RETURNING "id"
    `);
    await assert.rejects(client.query(`
      UPDATE "GameInterruptionEvents"
      SET "completionEvidenceId" = $1, "appliedAt" = NOW(),
          "appliedScoreDeduction" = 1, "appliedXpDeduction" = 10
      WHERE "id" = $2
    `, [otherEvidence.rows[0].id, event.rows[0].id]), /immutable|does not match/i);
    await assert.rejects(client.query(`
      UPDATE "GameInterruptionEvents"
      SET "completionEvidenceId" = NULL, "appliedAt" = NULL,
          "appliedScoreDeduction" = NULL, "appliedXpDeduction" = NULL
      WHERE "id" = $1
    `, [event.rows[0].id]), /immutable/i);
    await assert.rejects(client.query(`
      INSERT INTO "XpTransactions"
        ("userId", "amount", "kind", "referenceType", "referenceId", "completionEvidenceId")
      VALUES (2, 25, 'level_completion', 'level', '${PLAYABLE_LEVEL_KEYS[1]}', $1)
    `, [evidenceId]), /does not match/i);
    await assert.rejects(client.query(`
      INSERT INTO "XpTransactions"
        ("userId", "amount", "kind", "referenceType", "referenceId", "completionEvidenceId")
      VALUES (1, -15, 'detailed_hint_purchase', 'level', '${PLAYABLE_LEVEL_KEYS[0]}', $1)
    `, [otherEvidence.rows[0].id]), /does not match|level-completion/i);
    await assert.rejects(client.query(
      'UPDATE "XpTransactions" SET "completionEvidenceId" = NULL WHERE "completionEvidenceId" = $1',
      [evidenceId],
    ), /immutable/i);
    await assert.rejects(client.query('DELETE FROM "Users" WHERE "id" = 1'), /foreign key/i);
    await assert.rejects(client.query('DELETE FROM "Classrooms" WHERE "id" = 10'), /foreign key/i);
  } finally {
    await client.end();
  }
});
