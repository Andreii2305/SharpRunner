const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { Client } = require("pg");

const models = require("../src/models");
const sequelize = require("../src/config/database");
const { PLAYABLE_LEVEL_KEYS } = require("../src/constants/progressDefaults");
const { migrations } = require("../src/services/migrationService");

const migrationName = "20261030000000_game_interruption_history";
const migrationPath = path.resolve(
  __dirname,
  `../../supabase/migrations/${migrationName}.sql`,
);

const sessionInput = (extra = {}) => ({
  studentId: 11,
  classroomId: 25,
  levelKey: PLAYABLE_LEVEL_KEYS[0],
  sessionKey: "session_key_1234",
  scoreDeductionSnapshot: "1.25",
  xpDeductionSnapshot: 10,
  startedAt: new Date("2026-10-29T00:00:00.000Z"),
  ...extra,
});

const eventInput = (extra = {}) => ({
  sessionId: 7,
  studentId: 11,
  eventKey: "event_key_123456",
  eventType: "hidden",
  receivedAt: new Date("2026-10-29T00:01:00.000Z"),
  ...extra,
});

test("game interruption session model enforces identity, rate, and lifecycle invariants", async () => {
  const Session = models.GameInterruptionSession;
  assert.ok(Session, "GameInterruptionSession must be registered");
  assert.equal(Session.rawAttributes.studentId.allowNull, false);
  assert.equal(Session.rawAttributes.classroomId.allowNull, false);
  assert.equal(Session.rawAttributes.scoreDeductionSnapshot.type.key, "DECIMAL");
  assert.equal(Session.rawAttributes.scoreDeductionSnapshot.allowNull, false);
  assert.equal(Session.rawAttributes.xpDeductionSnapshot.type.key, "INTEGER");
  assert.equal(Session.rawAttributes.xpDeductionSnapshot.allowNull, false);
  assert.equal(Session.rawAttributes.lifecycleStatus.defaultValue, "CURRENT");

  await assert.doesNotReject(Session.build(sessionInput()).validate());
  await assert.doesNotReject(Session.build(sessionInput({
    lifecycleStatus: "SUPERSEDED",
    supersededAt: new Date("2026-10-29T00:02:00.000Z"),
  })).validate());
  await assert.doesNotReject(Session.build(sessionInput({
    lifecycleStatus: "COMPLETED",
    completedAt: new Date("2026-10-29T00:02:00.000Z"),
  })).validate());

  for (const extra of [
    { levelKey: "not-a-canonical-level" },
    { sessionKey: "short" },
    { scoreDeductionSnapshot: "1.234" },
    { scoreDeductionSnapshot: -1 },
    { scoreDeductionSnapshot: 101 },
    { xpDeductionSnapshot: 0.25 },
    { xpDeductionSnapshot: -1 },
    { xpDeductionSnapshot: 101 },
    { lifecycleStatus: "CURRENT", completedAt: new Date("2026-10-29T00:02:00.000Z") },
    { lifecycleStatus: "SUPERSEDED" },
    { lifecycleStatus: "COMPLETED" },
    {
      lifecycleStatus: "COMPLETED",
      completedAt: new Date("2026-10-28T23:59:00.000Z"),
    },
  ]) {
    await assert.rejects(Session.build(sessionInput(extra)).validate());
  }
});

test("game interruption event model distinguishes unapplied from applied zero deductions", async () => {
  const Event = models.GameInterruptionEvent;
  assert.ok(Event, "GameInterruptionEvent must be registered");
  assert.equal(Event.rawAttributes.sessionId.allowNull, false);
  assert.equal(Event.rawAttributes.studentId.allowNull, false);
  assert.equal(Event.rawAttributes.appliedScoreDeduction.allowNull, true);
  assert.equal(Event.rawAttributes.appliedScoreDeduction.defaultValue, null);
  assert.equal(Event.rawAttributes.appliedXpDeduction.allowNull, true);
  assert.equal(Event.rawAttributes.appliedXpDeduction.defaultValue, null);
  assert.equal(Event.rawAttributes.appliedXpDeduction.type.key, "INTEGER");

  await assert.doesNotReject(Event.build(eventInput()).validate());
  await assert.doesNotReject(Event.build(eventInput({
    completionEvidenceId: 9,
    appliedAt: new Date("2026-10-29T00:02:00.000Z"),
    appliedScoreDeduction: "0.00",
    appliedXpDeduction: 0,
  })).validate());

  for (const extra of [
    { eventKey: "short" },
    { eventType: "blur" },
    { appliedAt: new Date("2026-10-29T00:02:00.000Z") },
    { appliedScoreDeduction: "1.00", appliedXpDeduction: 10 },
    {
      appliedAt: new Date("2026-10-29T00:02:00.000Z"),
      appliedScoreDeduction: "1.234",
      appliedXpDeduction: 10,
    },
    {
      appliedAt: new Date("2026-10-29T00:02:00.000Z"),
      appliedScoreDeduction: "1.00",
      appliedXpDeduction: 0.5,
    },
    {
      appliedAt: new Date("2026-10-28T23:59:00.000Z"),
      appliedScoreDeduction: "1.00",
      appliedXpDeduction: 10,
    },
  ]) {
    await assert.rejects(Event.build(eventInput(extra)).validate());
  }
});

test("history models register retained associations and database-oriented indexes", () => {
  const { Classroom, GameInterruptionEvent: Event, GameInterruptionSession: Session, User } = models;
  assert.equal(User.associations.gameInterruptionSessions.target, Session);
  assert.equal(Classroom.associations.gameInterruptionSessions.target, Session);
  assert.equal(Session.associations.events.target, Event);
  assert.equal(Event.associations.session.target, Session);
  assert.equal(Event.associations.student.target, User);
  assert.equal(Event.associations.session.options.onDelete, "RESTRICT");

  const sessionIndexes = Session.options.indexes;
  assert.ok(sessionIndexes.some((index) => index.unique
    && index.fields.join(",") === "studentId,sessionKey"));
  assert.ok(sessionIndexes.some((index) => index.unique
    && index.fields.join(",") === "studentId,classroomId,levelKey"
    && index.where?.lifecycleStatus === "CURRENT"));
  assert.ok(sessionIndexes.some((index) => index.fields.join(",")
    === "classroomId,studentId,levelKey,createdAt,id"));

  const eventIndexes = Event.options.indexes;
  assert.ok(eventIndexes.some((index) => index.unique
    && index.fields.join(",") === "studentId,eventKey"));
  assert.ok(eventIndexes.some((index) => index.fields.join(",")
    === "sessionId,receivedAt,id" && index.where?.appliedAt === null));
});

test("forward migration is registered after deduction settings and encodes history constraints", async () => {
  assert.equal(fs.existsSync(migrationPath), true, "history migration SQL must exist");
  const sql = fs.readFileSync(migrationPath, "utf8");
  const names = migrations.map(([name]) => name);
  const migrationIndex = names.indexOf(migrationName);

  assert.equal(
    names[migrationIndex + 1],
    "20261031000000_game_interruption_completion_evidence",
  );
  assert.ok(migrationIndex > names.indexOf("20261029000000_game_interruption_deduction_settings"));
  assert.match(sql, /^\s*(?:--[^\n]*\n)*\s*BEGIN;/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "GameInterruptionSessions"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "GameInterruptionEvents"/);
  assert.match(sql, /NUMERIC\(5, 2\)/);
  assert.match(sql, /"xpDeductionSnapshot" INTEGER/);
  assert.match(sql, /"appliedXpDeduction" INTEGER/);
  assert.match(sql, /WHERE "lifecycleStatus" = 'CURRENT'/);
  assert.match(sql, /UNIQUE \("studentId", "eventKey"\)/);
  assert.match(sql, /FOREIGN KEY \("sessionId", "studentId"\)/);
  assert.match(sql, /ON DELETE RESTRICT/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON SEQUENCE/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM/i);

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

const databaseUrl = process.env.GAME_INTERRUPTION_HISTORY_MIGRATION_DATABASE_URL;
const postgresTest = databaseUrl ? test : test.skip;

postgresTest("history migration constraints are rerunnable on a dedicated local PostgreSQL database", async () => {
  const parsed = new URL(databaseUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
  assert.equal(parsed.pathname.slice(1), "sharprunner_game_interruption_history_rehearsal");
  const client = new Client({ connectionString: databaseUrl });
  const sql = fs.readFileSync(migrationPath, "utf8");
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Users" ("id" INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS "Classrooms" ("id" INTEGER PRIMARY KEY);
    `);
    await client.query(sql);
    await client.query(sql);
    await client.query('DELETE FROM "GameInterruptionEvents" WHERE "studentId" IN (710011, 710012)');
    await client.query('DELETE FROM "GameInterruptionSessions" WHERE "studentId" IN (710011, 710012)');
    await client.query('INSERT INTO "Users" ("id") VALUES (710011), (710012) ON CONFLICT DO NOTHING');
    await client.query('INSERT INTO "Classrooms" ("id") VALUES (710025), (710026) ON CONFLICT DO NOTHING');
    const inserted = await client.query(`
      INSERT INTO "GameInterruptionSessions"
        ("studentId", "classroomId", "levelKey", "sessionKey",
         "scoreDeductionSnapshot", "xpDeductionSnapshot")
      VALUES (710011, 710025, '${PLAYABLE_LEVEL_KEYS[0]}', 'session_key_1234', 1.25, 10)
      RETURNING "id"
    `);
    const sessionId = inserted.rows[0].id;
    await assert.rejects(client.query(`
      INSERT INTO "GameInterruptionSessions"
        ("studentId", "classroomId", "levelKey", "sessionKey",
         "scoreDeductionSnapshot", "xpDeductionSnapshot")
      VALUES (710011, 710025, '${PLAYABLE_LEVEL_KEYS[0]}', 'session_key_5678', 1, 10)
    `), /duplicate key/);
    await assert.rejects(client.query(`
      INSERT INTO "GameInterruptionSessions"
        ("studentId", "classroomId", "levelKey", "sessionKey",
         "scoreDeductionSnapshot", "xpDeductionSnapshot", "lifecycleStatus", "completedAt")
      VALUES (710011, 710026, '${PLAYABLE_LEVEL_KEYS[1]}', 'session_key_1234',
        1, 10, 'COMPLETED', NOW())
    `), /duplicate key/);
    const historical = await client.query(`
      INSERT INTO "GameInterruptionSessions"
        ("studentId", "classroomId", "levelKey", "sessionKey",
         "scoreDeductionSnapshot", "xpDeductionSnapshot", "lifecycleStatus", "supersededAt")
      VALUES (710011, 710025, '${PLAYABLE_LEVEL_KEYS[1]}', 'session_key_history',
        2.50, 20, 'SUPERSEDED', NOW())
      RETURNING "id"
    `);
    const historicalSessionId = historical.rows[0].id;
    await client.query(`
      INSERT INTO "GameInterruptionEvents"
        ("sessionId", "studentId", "eventKey", "eventType")
      VALUES (${sessionId}, 710011, 'event_key_123456', 'fullscreen_exit')
    `);
    await assert.rejects(client.query(`
      INSERT INTO "GameInterruptionEvents"
        ("sessionId", "studentId", "eventKey", "eventType")
      VALUES (${historicalSessionId}, 710011, 'event_key_123456', 'hidden')
    `), /duplicate key/);
    await assert.rejects(client.query(`
      INSERT INTO "GameInterruptionEvents"
        ("sessionId", "studentId", "eventKey", "eventType")
      VALUES (${sessionId}, 710012, 'event_key_123457', 'hidden')
    `), /foreign key/);
    await assert.rejects(client.query(`
      INSERT INTO "GameInterruptionEvents"
        ("sessionId", "studentId", "eventKey", "eventType", "appliedAt")
      VALUES (${sessionId}, 710011, 'event_key_123458', 'hidden', NOW())
    `), /check constraint|violates check/i);
    await client.query(`
      INSERT INTO "GameInterruptionEvents"
        ("sessionId", "studentId", "eventKey", "eventType", "appliedAt",
         "appliedScoreDeduction", "appliedXpDeduction")
      VALUES (${sessionId}, 710011, 'event_key_123459', 'hidden', NOW(), 0, 0)
    `);
    await assert.rejects(
      client.query('DELETE FROM "Users" WHERE "id" = 710011'),
      /foreign key/,
    );
    await assert.rejects(
      client.query('DELETE FROM "Classrooms" WHERE "id" = 710025'),
      /foreign key/,
    );
    await assert.rejects(
      client.query('DELETE FROM "GameInterruptionSessions" WHERE "id" = $1', [sessionId]),
      /foreign key/,
    );
    const rls = await client.query(`
      SELECT relname, relrowsecurity
      FROM pg_class
      WHERE relname IN ('GameInterruptionSessions', 'GameInterruptionEvents')
      ORDER BY relname
    `);
    assert.deepEqual(rls.rows, [
      { relname: "GameInterruptionEvents", relrowsecurity: true },
      { relname: "GameInterruptionSessions", relrowsecurity: true },
    ]);
  } finally {
    await client.end();
  }
});
