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

const assertReportIndexTargetIdentity = (identity, expectedDatabase) => {
  assert.deepEqual(identity, {
    database: expectedDatabase,
    address: identity.address,
  });
  assert.ok(["127.0.0.1", "::1"].includes(identity.address));
};

test("report-index PostgreSQL identity accepts only normalized loopback results", () => {
  const identity = {
    database: "sharprunner_game_interruption_full_rehearsal_test",
    address: "127.0.0.1",
  };

  assert.doesNotThrow(() => assertReportIndexTargetIdentity(identity, identity.database));
  assert.doesNotThrow(() => assertReportIndexTargetIdentity(
    { ...identity, address: "::1" },
    identity.database,
  ));

  for (const address of [
    "10.0.0.4",
    null,
    undefined,
    "",
    "127.0.0.1/32",
    "::1/128",
    "localhost",
  ]) {
    assert.throws(() => assertReportIndexTargetIdentity(
      { ...identity, address },
      identity.database,
    ));
  }
  for (const malformed of [null, undefined, {}, []]) {
    assert.throws(() => assertReportIndexTargetIdentity(malformed, identity.database));
  }
  assert.throws(() => assertReportIndexTargetIdentity(
    { ...identity, database: "sharprunner_browser_test" },
    identity.database,
  ));
});

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
      "SELECT current_database() AS database, host(inet_server_addr()) AS address",
    );
    assertReportIndexTargetIdentity(identity.rows[0], databaseName);
    const prerequisite = await client.query(`
      SELECT to_regclass('public."GameInterruptionEvents"') IS NOT NULL
        AS table_exists
    `);
    assert.equal(prerequisite.rows[0].table_exists, true);

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
