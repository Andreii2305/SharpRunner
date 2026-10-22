const assert = require("node:assert/strict");
const { test } = require("node:test");

const sequelize = require("../src/config/database");
const { migrations } = require("../src/services/migrationService");

test("requestedAt migration is registered and adds a nullable column without backfilling rows", async () => {
  const migration = migrations.find(([name]) => (
    name === "20261022000000_classroom_membership_requested_at"
  ));
  assert.ok(migration, "requestedAt migration must be registered");

  const originalQuery = sequelize.query;
  const queries = [];
  sequelize.query = async (sql) => { queries.push(sql); };
  try {
    await migration[1]();
  } finally {
    sequelize.query = originalQuery;
  }

  assert.equal(queries.length, 1);
  assert.match(queries[0], /ALTER TABLE "ClassroomMemberships"/);
  assert.match(queries[0], /ADD COLUMN IF NOT EXISTS "requestedAt" TIMESTAMPTZ/);
  assert.doesNotMatch(queries[0], /UPDATE\s+"ClassroomMemberships"/i);
});
