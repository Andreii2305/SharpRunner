const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { Client } = require("pg");

const models = require("../src/models");
const appSequelize = require("../src/config/database");
const { migrations, runMigrations } = require("../src/services/migrationService");

const migrationName = "20261025000000_teacher_student_check_ins";
const migrationPath = path.resolve(
  __dirname,
  `../../supabase/migrations/${migrationName}.sql`,
);

const validValues = {
  senderId: 11,
  senderRole: "teacher",
  recipientStudentId: 22,
  classroomId: 33,
  message: "Could we check in after class?",
  idempotencyKey: "checkin_key_123",
};

test("private check-in model validates and normalizes its durable message contract", async () => {
  const { TeacherStudentCheckIn } = models;
  assert.ok(TeacherStudentCheckIn, "private check-in model must be registered");

  const record = TeacherStudentCheckIn.build({
    ...validValues,
    senderRole: "admin",
    message: "  A neutral check-in.  ",
  });
  await record.validate();
  assert.equal(record.senderRole, "admin");
  assert.equal(record.message, "A neutral check-in.");

  for (const field of [
    "senderId",
    "senderRole",
    "recipientStudentId",
    "classroomId",
    "message",
    "idempotencyKey",
  ]) {
    const values = { ...validValues };
    delete values[field];
    await assert.rejects(
      models.TeacherStudentCheckIn.build(values).validate(),
      (error) => error?.errors?.some((item) => item.path === field),
      `${field} must be required`,
    );
  }

  await assert.rejects(
    TeacherStudentCheckIn.build({ ...validValues, senderRole: "student" }).validate(),
    /Validation isIn on senderRole failed/,
  );
  await assert.rejects(
    TeacherStudentCheckIn.build({ ...validValues, message: "   " }).validate(),
    /Validation notEmpty on message failed/,
  );
  await assert.rejects(
    TeacherStudentCheckIn.build({ ...validValues, message: "x".repeat(1001) }).validate(),
    /Validation len on message failed/,
  );
  await assert.rejects(
    TeacherStudentCheckIn.build({ ...validValues, idempotencyKey: "short" }).validate(),
    /Validation is on idempotencyKey failed/,
  );
});

test("private check-in model exposes retention-safe associations and indexes", () => {
  const { Classroom, TeacherStudentCheckIn, User } = models;

  assert.equal(User.associations.sentStudentCheckIns.target, TeacherStudentCheckIn);
  assert.equal(User.associations.sentStudentCheckIns.options.onDelete, "RESTRICT");
  assert.equal(User.associations.receivedTeacherCheckIns.target, TeacherStudentCheckIn);
  assert.equal(User.associations.receivedTeacherCheckIns.options.onDelete, "RESTRICT");
  assert.equal(Classroom.associations.teacherStudentCheckIns.target, TeacherStudentCheckIn);
  assert.equal(Classroom.associations.teacherStudentCheckIns.options.onDelete, "RESTRICT");
  assert.equal(TeacherStudentCheckIn.associations.sender.as, "sender");
  assert.equal(TeacherStudentCheckIn.associations.recipientStudent.as, "recipientStudent");
  assert.equal(TeacherStudentCheckIn.associations.classroom.as, "classroom");

  const indexes = TeacherStudentCheckIn.options.indexes;
  assert.ok(indexes.some((index) => (
    index.name === "teacher_student_check_ins_sender_key"
      && index.unique === true
      && index.fields.join(",") === "senderId,idempotencyKey"
  )));
  assert.ok(indexes.some((index) => (
    index.name === "teacher_student_check_ins_recipient_created"
      && index.fields.join(",") === "recipientStudentId,createdAt"
  )));
});

test("private check-in migration is transactional, ordered before feedback, and enforces the schema contract", async () => {
  assert.equal(fs.existsSync(migrationPath), true, "private check-in migration SQL must exist");
  const sql = fs.readFileSync(migrationPath, "utf8");
  const names = migrations.map(([name]) => name);
  const migrationIndex = names.indexOf(migrationName);

  assert.notEqual(migrationIndex, -1, "private check-in migration must be registered");
  assert.equal(
    names[migrationIndex + 1],
    "20261026000000_student_classroom_feedback",
    "classroom feedback migration must follow the check-in foundation",
  );
  assert.ok(migrationIndex > names.indexOf("000_schema_baseline"));
  assert.match(sql, /^\s*(?:--[^\n]*\n)*\s*BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "TeacherStudentCheckIns"/);
  assert.match(sql, /"senderId" INTEGER NOT NULL REFERENCES "Users"\("id"\) ON DELETE RESTRICT/);
  assert.match(sql, /"recipientStudentId" INTEGER NOT NULL REFERENCES "Users"\("id"\) ON DELETE RESTRICT/);
  assert.match(sql, /"classroomId" INTEGER NOT NULL REFERENCES "Classrooms"\("id"\) ON DELETE RESTRICT/);
  assert.match(sql, /"senderRole" VARCHAR\(16\) NOT NULL/);
  assert.match(sql, /"message" VARCHAR\(1000\) NOT NULL/);
  assert.match(sql, /"idempotencyKey" VARCHAR\(96\) NOT NULL/);
  assert.match(sql, /CHECK \("senderRole" IN \('teacher', 'admin'\)\)/);
  assert.match(sql, /length\(trim\("message"\)\) BETWEEN 1 AND 1000/);
  assert.match(sql, /"idempotencyKey" ~ '\^\[A-Za-z0-9_-\]\{8,96\}\$'/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "teacher_student_check_ins_sender_key"[\s\S]*\("senderId", "idempotencyKey"\)/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS "teacher_student_check_ins_recipient_created"[\s\S]*\("recipientStudentId", "createdAt"\)/);
  assert.doesNotMatch(sql, /ON DELETE CASCADE|ON DELETE SET NULL/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);

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

test("migration runner records the check-in migration once and skips it after registration", async () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const migrationNames = migrations.map(([name]) => name);
  const previousNames = migrationNames.filter((name) => name !== migrationName);
  const originalQuery = appSequelize.query;
  const firstRunQueries = [];

  appSequelize.query = async (statement, options = {}) => {
    firstRunQueries.push({ statement, options });
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

  assert.equal(firstRunQueries.filter(({ statement }) => statement === sql).length, 1);
  const registration = firstRunQueries.find(({ statement }) => (
    /INSERT INTO "SharpRunnerMigrations"/.test(statement)
  ));
  assert.equal(registration.options.replacements.name, migrationName);

  const secondRunQueries = [];
  appSequelize.query = async (statement) => {
    secondRunQueries.push(statement);
    if (/SELECT "name" FROM "SharpRunnerMigrations"/.test(statement)) {
      return [migrationNames.map((name) => ({ name }))];
    }
    return [[], undefined];
  };
  try {
    await runMigrations();
  } finally {
    appSequelize.query = originalQuery;
  }

  assert.equal(secondRunQueries.includes(sql), false);
  assert.equal(secondRunQueries.some((statement) => (
    /INSERT INTO "SharpRunnerMigrations"/.test(statement)
  )), false);
});

const databaseUrl = process.env.PRIVATE_CHECK_IN_MIGRATION_DATABASE_URL;
const postgresTest = databaseUrl ? test : test.skip;

const assertDisposableDatabase = (value) => {
  const parsed = new URL(value);
  assert.match(parsed.protocol, /^postgres(?:ql)?:$/);
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
  assert.equal(parsed.pathname.slice(1), "sharprunner_private_check_in_rehearsal");
};

postgresTest("private check-in migration is rerunnable and enforces constraints on PostgreSQL", async () => {
  assertDisposableDatabase(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  const sql = fs.readFileSync(migrationPath, "utf8");
  await client.connect();

  try {
    const { rows: existingTables } = await client.query(`
      SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'
    `);
    assert.deepEqual(existingTables, [], "rehearsal database must be newly created and empty");

    await client.query(`
      CREATE TABLE "Users" ("id" INTEGER PRIMARY KEY);
      CREATE TABLE "Classrooms" ("id" INTEGER PRIMARY KEY);
      INSERT INTO "Users" ("id") VALUES (1), (2), (3);
      INSERT INTO "Classrooms" ("id") VALUES (10), (11);
    `);
    await client.query(sql);
    await client.query(sql);

    await client.query(`
      INSERT INTO "TeacherStudentCheckIns"
        ("senderId", "senderRole", "recipientStudentId", "classroomId", "message", "idempotencyKey", "createdAt", "updatedAt")
      VALUES
        (1, 'teacher', 3, 10, 'First check-in', 'shared_key_1', NOW(), NOW()),
        (2, 'admin', 3, 10, 'Administrator check-in', 'shared_key_1', NOW(), NOW());
    `);

    await assert.rejects(client.query(`
      INSERT INTO "TeacherStudentCheckIns"
        ("senderId", "senderRole", "recipientStudentId", "classroomId", "message", "idempotencyKey", "createdAt", "updatedAt")
      VALUES (1, 'teacher', 3, 11, 'Conflicting key', 'shared_key_1', NOW(), NOW())
    `));
    await assert.rejects(client.query(`
      INSERT INTO "TeacherStudentCheckIns"
        ("senderId", "senderRole", "recipientStudentId", "classroomId", "message", "idempotencyKey", "createdAt", "updatedAt")
      VALUES (1, 'student', 3, 10, 'Invalid sender', 'invalid_role_1', NOW(), NOW())
    `));
    await assert.rejects(client.query(`
      INSERT INTO "TeacherStudentCheckIns"
        ("senderId", "senderRole", "recipientStudentId", "classroomId", "message", "idempotencyKey", "createdAt", "updatedAt")
      VALUES (1, 'teacher', 3, 10, '   ', 'blank_msg_1', NOW(), NOW())
    `));
    await assert.rejects(client.query('DELETE FROM "Users" WHERE "id" = 1'));
    await assert.rejects(client.query('DELETE FROM "Users" WHERE "id" = 3'));
    await assert.rejects(client.query('DELETE FROM "Classrooms" WHERE "id" = 10'));

    const { rows: indexes } = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'TeacherStudentCheckIns'
    `);
    assert.ok(indexes.some(({ indexname }) => indexname === "teacher_student_check_ins_sender_key"));
    assert.ok(indexes.some(({ indexname }) => indexname === "teacher_student_check_ins_recipient_created"));
  } finally {
    await client.end();
  }
});
