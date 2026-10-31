const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const jwt = require("jsonwebtoken");
const { Client } = require("pg");

process.env.JWT_SECRET = "game-interruption-settings-test-secret";

const app = require("../src/app");
const Classroom = require("../src/models/Classroom");
const LevelContentOverride = require("../src/models/LevelContentOverride");
const User = require("../src/models/User");
const sequelize = require("../src/config/database");
const { PLAYABLE_LEVEL_KEYS } = require("../src/constants/progressDefaults");
const {
  DEFAULT_INTERRUPTION_SCORE_DEDUCTION,
  DEFAULT_INTERRUPTION_XP_DEDUCTION,
  getClassroomLevelSettings,
} = require("../src/services/classroomLevelSettingsService");
const { migrations } = require("../src/services/migrationService");
const {
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
} = require("../src/constants/policyVersions");

const migrationName = "20261029000000_game_interruption_deduction_settings";
const migrationPath = path.resolve(
  __dirname,
  `../../supabase/migrations/${migrationName}.sql`,
);

let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve, reject) => {
  if (!server) return resolve();
  server.close((error) => (error ? reject(error) : resolve()));
}));

const authToken = (id, role) => jwt.sign(
  { id, role, tokenVersion: 0 },
  process.env.JWT_SECRET,
  { expiresIn: "5m" },
);

const activeTeacher = (id = 7) => ({
  id,
  role: "teacher",
  status: "active",
  tokenVersion: 0,
  termsVersionAccepted: TERMS_VERSION,
  privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
});

const apiRequest = async (route, { token, body } = {}) => {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { response, payload: await response.json() };
};

const withStubs = async (stubs, callback) => {
  const originals = stubs.map(([target, property]) => [target, property, target[property]]);
  for (const [target, property, replacement] of stubs) target[property] = replacement;
  try {
    return await callback();
  } finally {
    for (const [target, property, original] of originals) target[property] = original;
  }
};

const settingInput = (levelKey, extra = {}) => ({
  levelKey,
  isEnabled: true,
  unlockAt: null,
  dueAt: null,
  hintsEnabled: true,
  hintUnlockThreshold: 3,
  wrongAttemptDeduction: 5,
  lateDeductionPerDay: 3,
  ...extra,
});

test("level override model validates independent interruption deduction bounds and defaults", async () => {
  const score = LevelContentOverride.rawAttributes.interruptionScoreDeduction;
  const xp = LevelContentOverride.rawAttributes.interruptionXpDeduction;

  assert.equal(score.allowNull, false);
  assert.equal(score.defaultValue, 1);
  assert.equal(score.validate.min, 0);
  assert.equal(score.validate.max, 100);
  assert.equal(xp.allowNull, false);
  assert.equal(xp.defaultValue, 10);
  assert.equal(xp.type.key, "INTEGER");
  assert.equal(xp.validate.isInt, true);
  assert.equal(xp.validate.min, 0);
  assert.equal(xp.validate.max, 100);

  await assert.doesNotReject(LevelContentOverride.build({
    classroomId: 25,
    levelKey: "tutorial-level-1",
    interruptionScoreDeduction: 0,
    interruptionXpDeduction: 0,
  }).validate());
  await assert.rejects(LevelContentOverride.build({
    classroomId: 25,
    levelKey: "tutorial-level-1",
    interruptionScoreDeduction: -0.01,
  }).validate(), /Validation min on interruptionScoreDeduction failed/);
  await assert.rejects(LevelContentOverride.build({
    classroomId: 25,
    levelKey: "tutorial-level-1",
    interruptionXpDeduction: 100.01,
  }).validate(), /Validation max on interruptionXpDeduction failed/);
  await assert.rejects(LevelContentOverride.build({
    classroomId: 25,
    levelKey: "tutorial-level-1",
    interruptionXpDeduction: 0.25,
  }).validate(), /Validation isInt on interruptionXpDeduction failed/);
});

test("classroom settings resolver preserves zero and supplies interruption defaults", async () => {
  await withStubs([[LevelContentOverride, "findAll", async () => [
    {
      levelKey: PLAYABLE_LEVEL_KEYS[0],
      interruptionScoreDeduction: 0,
      interruptionXpDeduction: "0.00",
    },
    {
      levelKey: PLAYABLE_LEVEL_KEYS[1],
      interruptionScoreDeduction: "2.50",
      interruptionXpDeduction: "14.00",
    },
  ]]], async () => {
    const settings = await getClassroomLevelSettings(25);
    assert.deepEqual(
      settings.slice(0, 3).map((row) => ({
        score: row.interruptionScoreDeduction,
        xp: row.interruptionXpDeduction,
      })),
      [
        { score: 0, xp: 0 },
        { score: 2.5, xp: 14 },
        { score: 1, xp: 10 },
      ],
    );
    assert.equal(DEFAULT_INTERRUPTION_SCORE_DEDUCTION, 1);
    assert.equal(DEFAULT_INTERRUPTION_XP_DEDUCTION, 10);
  });
});

test("forward migration precedes interruption history and enforces compatible setting columns", async () => {
  assert.equal(fs.existsSync(migrationPath), true, "interruption settings migration SQL must exist");
  const sql = fs.readFileSync(migrationPath, "utf8");
  const names = migrations.map(([name]) => name);
  const migrationIndex = names.indexOf(migrationName);

  assert.equal(names[migrationIndex + 1], "20261030000000_game_interruption_history");
  assert.ok(migrationIndex > names.indexOf("20261026000000_student_classroom_feedback"));
  assert.match(sql, /^\s*(?:--[^\n]*\n)*\s*BEGIN;/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "interruptionScoreDeduction" NUMERIC\(5, 2\)/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "interruptionXpDeduction" INTEGER/);
  assert.match(sql, /ALTER COLUMN "interruptionScoreDeduction" SET DEFAULT 1/);
  assert.match(sql, /ALTER COLUMN "interruptionXpDeduction" SET DEFAULT 10/);
  assert.match(sql, /fractional interruptionXpDeduction values cannot be converted to INTEGER/);
  assert.match(sql, /CHECK \("interruptionScoreDeduction" >= 0 AND "interruptionScoreDeduction" <= 100\)/);
  assert.match(sql, /CHECK \("interruptionXpDeduction" >= 0 AND "interruptionXpDeduction" <= 100\)/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);

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

test("teacher level settings preserve omitted deductions and accept independent explicit zeros", async () => {
  const classroomId = 25;
  const existingRows = new Map([
    [PLAYABLE_LEVEL_KEYS[0], {
      classroomId,
      levelKey: PLAYABLE_LEVEL_KEYS[0],
      interruptionScoreDeduction: 4,
      interruptionXpDeduction: 17,
      dueAt: null,
      save: async () => undefined,
    }],
    [PLAYABLE_LEVEL_KEYS[1], {
      classroomId,
      levelKey: PLAYABLE_LEVEL_KEYS[1],
      interruptionScoreDeduction: 8,
      interruptionXpDeduction: 22,
      dueAt: null,
      save: async () => undefined,
    }],
  ]);
  let findAllCalls = 0;

  await withStubs([
    [User, "findByPk", async () => activeTeacher()],
    [Classroom, "findByPk", async () => ({ id: classroomId, teacherId: 7 })],
    [LevelContentOverride, "findAll", async () => {
      findAllCalls += 1;
      return [...existingRows.values()];
    }],
    [LevelContentOverride, "findOrCreate", async ({ where, defaults }) => {
      let row = existingRows.get(where.levelKey);
      if (!row) {
        row = { ...defaults, dueAt: null, save: async () => undefined };
        existingRows.set(where.levelKey, row);
      }
      return [row, false];
    }],
  ], async () => {
    const settings = PLAYABLE_LEVEL_KEYS.map((levelKey, index) => settingInput(levelKey, {
      ...(index === 1
        ? { interruptionScoreDeduction: 0, interruptionXpDeduction: 0 }
        : {}),
      ...(index === 2
        ? { interruptionScoreDeduction: "1.236", interruptionXpDeduction: "100" }
        : {}),
    }));
    const { response, payload } = await apiRequest(
      `/api/teacher/classrooms/${classroomId}/level-settings`,
      { token: authToken(7, "teacher"), body: { settings } },
    );

    assert.equal(response.status, 200);
    assert.equal(findAllCalls, 2);
    assert.deepEqual(
      payload.settings.slice(0, 4).map((row) => ({
        score: Number(row.interruptionScoreDeduction),
        xp: Number(row.interruptionXpDeduction),
      })),
      [
        { score: 4, xp: 17 },
        { score: 0, xp: 0 },
        { score: 1.24, xp: 100 },
        { score: 1, xp: 10 },
      ],
    );
  });
});

test("teacher level settings reject invalid interruption deductions", async () => {
  await withStubs([
    [User, "findByPk", async () => activeTeacher()],
    [Classroom, "findByPk", async () => ({ id: 25, teacherId: 7 })],
    [LevelContentOverride, "findAll", async () => []],
    [LevelContentOverride, "findOrCreate", async ({ defaults }) => [{
      ...defaults,
      dueAt: null,
      save: async () => undefined,
    }]],
  ], async () => {
    for (const [field, value] of [
      ["interruptionScoreDeduction", -1],
      ["interruptionScoreDeduction", 100.01],
      ["interruptionScoreDeduction", "100.001"],
      ["interruptionScoreDeduction", "0x10"],
      ["interruptionScoreDeduction", "1e2"],
      ["interruptionScoreDeduction", null],
      ["interruptionScoreDeduction", ""],
      ["interruptionXpDeduction", 0.25],
      ["interruptionXpDeduction", "0.25"],
      ["interruptionXpDeduction", "0x10"],
      ["interruptionXpDeduction", "1e2"],
      ["interruptionXpDeduction", true],
      ["interruptionXpDeduction", []],
      ["interruptionXpDeduction", {}],
      ["interruptionXpDeduction", "Infinity"],
      ["interruptionXpDeduction", "not-a-number"],
    ]) {
      const settings = PLAYABLE_LEVEL_KEYS.map((levelKey, index) => settingInput(
        levelKey,
        index === 0 ? { [field]: value } : {},
      ));
      const { response, payload } = await apiRequest(
        "/api/teacher/classrooms/25/level-settings",
        { token: authToken(7, "teacher"), body: { settings } },
      );
      assert.equal(response.status, 400);
      assert.equal(payload.message, `${field} must be between 0 and 100`);
    }
  });
});

test("foreign teachers remain denied before level-setting rows are read", async () => {
  let settingReads = 0;
  await withStubs([
    [User, "findByPk", async () => activeTeacher(8)],
    [Classroom, "findByPk", async () => ({ id: 25, teacherId: 7 })],
    [LevelContentOverride, "findAll", async () => { settingReads += 1; return []; }],
  ], async () => {
    const { response, payload } = await apiRequest(
      "/api/teacher/classrooms/25/level-settings",
      {
        token: authToken(8, "teacher"),
        body: { settings: PLAYABLE_LEVEL_KEYS.map(settingInput) },
      },
    );
    assert.equal(response.status, 403);
    assert.deepEqual(payload, { message: "Access denied" });
    assert.equal(settingReads, 0);
  });
});

const databaseUrl = process.env.GAME_INTERRUPTION_SETTINGS_MIGRATION_DATABASE_URL;
const postgresTest = databaseUrl ? test : test.skip;

postgresTest("interruption deduction migration is rerunnable on a dedicated local PostgreSQL database", async () => {
  const parsed = new URL(databaseUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
  assert.equal(parsed.pathname.slice(1), "sharprunner_game_interruption_settings_rehearsal");
  const client = new Client({ connectionString: databaseUrl });
  const sql = fs.readFileSync(migrationPath, "utf8");
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE "LevelContentOverrides" (
        "id" SERIAL PRIMARY KEY,
        "classroomId" INTEGER NOT NULL,
        "levelKey" VARCHAR(255) NOT NULL,
        "interruptionXpDeduction" NUMERIC(5, 2)
      )
    `);
    await client.query(`
      INSERT INTO "LevelContentOverrides"
        ("classroomId", "levelKey", "interruptionXpDeduction")
      VALUES (25, 'tutorial-level-1', 0.25)
    `);
    await assert.rejects(
      client.query(sql),
      /fractional interruptionXpDeduction values cannot be converted to INTEGER/,
    );
    await client.query("ROLLBACK");
    await client.query(`
      UPDATE "LevelContentOverrides"
      SET "interruptionXpDeduction" = 100
    `);
    await client.query(sql);
    await client.query(sql);
    const { rows } = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'LevelContentOverrides'
        AND column_name IN ('interruptionScoreDeduction', 'interruptionXpDeduction')
      ORDER BY column_name
    `);
    assert.deepEqual(rows.map((row) => ({
      name: row.column_name,
      dataType: row.data_type,
      nullable: row.is_nullable,
      defaultValue: row.column_default,
    })), [
      {
        name: "interruptionScoreDeduction", dataType: "numeric", nullable: "NO", defaultValue: "1",
      },
      {
        name: "interruptionXpDeduction", dataType: "integer", nullable: "NO", defaultValue: "10",
      },
    ]);
    const converted = await client.query(`
      SELECT "interruptionXpDeduction"
      FROM "LevelContentOverrides"
      WHERE "classroomId" = 25
        AND "levelKey" = 'tutorial-level-1'
    `);
    assert.equal(converted.rows[0].interruptionXpDeduction, 100);
  } finally {
    await client.end();
  }
});
