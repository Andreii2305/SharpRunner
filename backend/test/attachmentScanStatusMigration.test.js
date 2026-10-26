const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { Client } = require("pg");

const models = require("../src/models");
const appSequelize = require("../src/config/database");
const { migrations } = require("../src/services/migrationService");

const migrationName = "20261023000000_attachment_scan_status_compatibility";
const migrationPath = path.resolve(
  __dirname,
  `../../supabase/migrations/${migrationName}.sql`,
);

test("attachment scan-status migration matches the model contract and is registered after table creation", async () => {
  const names = migrations.map(([name]) => name);
  const migrationIndex = names.indexOf(migrationName);
  const legacySchemaIndex = names.indexOf("001_legacy_schema_upgrade");
  const lessonBuilderIndex = names.indexOf("20260917000000_lesson_builder");

  assert.notEqual(migrationIndex, -1, "scan-status compatibility migration must be registered");
  assert.ok(migrationIndex > legacySchemaIndex, "migration must follow legacy table creation");
  assert.ok(migrationIndex > lessonBuilderIndex, "migration must follow lesson attachment schema setup");
  const originalQuery = appSequelize.query;
  const queries = [];
  appSequelize.query = async (sql) => { queries.push(sql); };
  try {
    await migrations[migrationIndex][1]();
  } finally {
    appSequelize.query = originalQuery;
  }
  assert.deepEqual(queries, [fs.readFileSync(migrationPath, "utf8")]);

  for (const model of [
    models.ClassroomLessonAttachment,
    models.ClassroomLessonSubmissionAttachment,
  ]) {
    const attribute = model.rawAttributes.scanStatus;
    assert.ok(attribute);
    assert.equal(attribute.type.toString(), "VARCHAR(20)");
    assert.equal(attribute.allowNull, false);
    assert.equal(attribute.defaultValue, "not_configured");
  }
});

test("attachment scan-status migration repairs missing and nullable columns without promoting statuses", () => {
  assert.equal(fs.existsSync(migrationPath), true, "scan-status migration SQL must exist");
  const sql = fs.readFileSync(migrationPath, "utf8");

  for (const table of [
    "ClassroomLessonAttachments",
    "ClassroomLessonSubmissionAttachments",
  ]) {
    const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      sql,
      new RegExp(`ALTER TABLE "${escapedTable}"\\s+ADD COLUMN IF NOT EXISTS "scanStatus" VARCHAR\\(20\\)`),
    );
    assert.match(
      sql,
      new RegExp(`UPDATE "${escapedTable}"\\s+SET "scanStatus" = 'not_configured'\\s+WHERE "scanStatus" IS NULL`),
    );
    assert.match(
      sql,
      new RegExp(`ALTER TABLE "${escapedTable}"[\\s\\S]*ALTER COLUMN "scanStatus" SET DEFAULT 'not_configured'[\\s\\S]*ALTER COLUMN "scanStatus" SET NOT NULL`),
    );
  }

  assert.doesNotMatch(sql, /ALTER TABLE IF EXISTS/i, "missing dependency tables must fail");
  assert.doesNotMatch(sql, /SET\s+"scanStatus"\s*=\s*'(?:clean|signature_checked)'/i);
  assert.doesNotMatch(sql, /CREATE TYPE|\bENUM\b/i);
  assert.match(sql, /^\s*(?:--[^\n]*\n)*\s*BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
});

const databaseUrl = process.env.ATTACHMENT_SCAN_STATUS_MIGRATION_DATABASE_URL;
const postgresTest = databaseUrl ? test : test.skip;

const assertDisposableDatabase = (value) => {
  const parsed = new URL(value);
  assert.match(parsed.protocol, /^postgres(?:ql)?:$/);
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
  assert.equal(parsed.pathname.slice(1), "sharprunner_attachment_scan_status_rehearsal");
};

const describeScanStatus = async (client, table) => {
  const { rows } = await client.query(`
    SELECT data_type AS "dataType", character_maximum_length AS "maxLength",
           is_nullable AS "isNullable", column_default AS "columnDefault"
    FROM information_schema.columns
    WHERE table_schema = (SELECT nspname FROM pg_namespace WHERE oid = pg_my_temp_schema())
      AND table_name = $1 AND column_name = 'scanStatus'
  `, [table]);
  return rows[0];
};

postgresTest("scan-status migration upgrades both attachment tables safely and is rerunnable on PostgreSQL", async () => {
  assertDisposableDatabase(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  const sql = fs.readFileSync(migrationPath, "utf8");
  await client.connect();

  try {
    await client.query(`
      CREATE TEMP TABLE "ClassroomLessonAttachments" (
        "id" INTEGER PRIMARY KEY,
        "scanStatus" VARCHAR(20)
      );
      CREATE TEMP TABLE "ClassroomLessonSubmissionAttachments" (
        "id" INTEGER PRIMARY KEY
      );
      INSERT INTO "ClassroomLessonAttachments" ("id", "scanStatus") VALUES
        (1, NULL), (2, 'clean'), (3, 'signature_checked'), (4, 'legacy_unknown');
      INSERT INTO "ClassroomLessonSubmissionAttachments" ("id") VALUES (1);
    `);

    await client.query(sql);
    await client.query(sql);

    const { rows: lessonRows } = await client.query(
      `SELECT "id", "scanStatus" FROM "ClassroomLessonAttachments" ORDER BY "id"`,
    );
    assert.deepEqual(lessonRows, [
      { id: 1, scanStatus: "not_configured" },
      { id: 2, scanStatus: "clean" },
      { id: 3, scanStatus: "signature_checked" },
      { id: 4, scanStatus: "legacy_unknown" },
    ]);

    const { rows: submissionRows } = await client.query(
      `SELECT "id", "scanStatus" FROM "ClassroomLessonSubmissionAttachments" ORDER BY "id"`,
    );
    assert.deepEqual(submissionRows, [{ id: 1, scanStatus: "not_configured" }]);

    for (const table of [
      "ClassroomLessonAttachments",
      "ClassroomLessonSubmissionAttachments",
    ]) {
      const column = await describeScanStatus(client, table);
      assert.deepEqual(column, {
        dataType: "character varying",
        maxLength: 20,
        isNullable: "NO",
        columnDefault: "'not_configured'::character varying",
      });
    }

    await assert.rejects(
      client.query('INSERT INTO "ClassroomLessonAttachments" ("id", "scanStatus") VALUES (5, NULL)'),
    );
  } finally {
    await client.end();
  }
});
