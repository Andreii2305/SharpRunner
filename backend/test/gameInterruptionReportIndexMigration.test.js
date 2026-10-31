const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { Client } = require("pg");

const sequelize = require("../src/config/database");
const models = require("../src/models");
const { migrations } = require("../src/services/migrationService");

const migrationName = "20261031120000_game_interruption_report_index";
const migrationPath = path.resolve(__dirname, `../../supabase/migrations/${migrationName}.sql`);

test("report history index is forward-only registered after interruption evidence and matches the model", async () => {
  assert.equal(fs.existsSync(migrationPath), true);
  const sql = fs.readFileSync(migrationPath, "utf8");
  const names = migrations.map(([name]) => name);
  const migrationIndex = names.indexOf(migrationName);
  assert.ok(migrationIndex > names.indexOf("20261031000000_game_interruption_completion_evidence"));
  assert.match(sql, /^\s*(?:--[^\n]*\n)*\s*BEGIN;/);
  assert.match(
    sql,
    /CREATE INDEX IF NOT EXISTS "game_interruption_events_session_history"\s+ON "GameInterruptionEvents" \("sessionId", "receivedAt" DESC, "id" DESC\)/,
  );
  assert.doesNotMatch(sql, /\bWHERE\b/i);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /DROP|TRUNCATE|DELETE|UPDATE|INSERT/i);

  const index = models.GameInterruptionEvent.options.indexes.find(
    (candidate) => candidate.name === "game_interruption_events_session_history",
  );
  assert.deepEqual(index.fields, [
    "sessionId",
    { name: "receivedAt", order: "DESC" },
    { name: "id", order: "DESC" },
  ]);
  assert.equal(index.where, undefined);

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

const databaseUrl = process.env.GAME_INTERRUPTION_REPORT_INDEX_DATABASE_URL;
const postgresTest = databaseUrl
  && process.env.RUN_GAME_INTERRUPTION_REPORT_INDEX_POSTGRES === "1"
  ? test
  : test.skip;

postgresTest("report history index is rerunnable against the registered schema on guarded PostgreSQL", async () => {
  const target = new URL(databaseUrl);
  const databaseName = target.pathname.replace(/^\//, "");
  assert.ok(["127.0.0.1", "localhost", "::1", "[::1]"].includes(target.hostname));
  assert.match(databaseName, /_test$/);
  assert.notEqual(databaseName, "sharprunner_browser_test");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const identity = await client.query(
      "SELECT current_database() AS database, inet_server_addr()::text AS address",
    );
    assert.equal(identity.rows[0].database, databaseName);
    assert.ok(["127.0.0.1", "::1"].includes(identity.rows[0].address));
    const prerequisite = await client.query(`
      SELECT to_regclass('public."GameInterruptionEvents"') AS events_table
    `);
    assert.equal(prerequisite.rows[0].events_table, "GameInterruptionEvents");

    const sql = fs.readFileSync(migrationPath, "utf8");
    await client.query(sql);
    await client.query(sql);
    const index = await client.query(`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'GameInterruptionEvents'
        AND indexname = 'game_interruption_events_session_history'
    `);
    assert.equal(index.rowCount, 1);
    assert.match(index.rows[0].indexdef, /"sessionId", "receivedAt" DESC, id DESC/);
    assert.doesNotMatch(index.rows[0].indexdef, / WHERE /i);
  } finally {
    await client.end();
  }
});
