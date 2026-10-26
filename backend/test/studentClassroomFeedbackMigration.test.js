const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { Client } = require("pg");

const models = require("../src/models");
const appSequelize = require("../src/config/database");
const { migrations, runMigrations } = require("../src/services/migrationService");

const migrationName = "20261026000000_student_classroom_feedback";
const migrationPath = path.resolve(
  __dirname,
  `../../supabase/migrations/${migrationName}.sql`,
);

const validValues = {
  classroomId: 33,
  studentId: 22,
  message: "The pacing helped me understand the lesson.",
  idempotencyKey: "feedback_key_123",
};

test("classroom feedback model validates required trimmed Unicode-aware fields", async () => {
  const { StudentClassroomFeedback } = models;
  assert.ok(StudentClassroomFeedback, "classroom feedback model must be registered");

  const record = StudentClassroomFeedback.build({
    ...validValues,
    message: "  Thank you for the examples.  ",
  });
  await record.validate();
  assert.equal(record.message, "Thank you for the examples.");

  for (const field of ["classroomId", "studentId", "message", "idempotencyKey"]) {
    const values = { ...validValues };
    delete values[field];
    await assert.rejects(
      StudentClassroomFeedback.build(values).validate(),
      (error) => error?.errors?.some((item) => item.path === field),
      `${field} must be required`,
    );
  }

  await assert.rejects(
    StudentClassroomFeedback.build({ ...validValues, message: "   " }).validate(),
    /Validation notEmpty on message failed/,
  );
  await assert.doesNotReject(
    StudentClassroomFeedback.build({ ...validValues, message: "🙂".repeat(1000) }).validate(),
  );
  await assert.rejects(
    StudentClassroomFeedback.build({ ...validValues, message: "🙂".repeat(1001) }).validate(),
    /Validation len on message failed/,
  );
  for (const idempotencyKey of ["short", "invalid key", "x".repeat(97)]) {
    await assert.rejects(
      StudentClassroomFeedback.build({ ...validValues, idempotencyKey }).validate(),
      /Validation is on idempotencyKey failed/,
    );
  }
});

test("classroom feedback model exposes retention-safe associations and listing indexes", () => {
  const { Classroom, StudentClassroomFeedback, TeacherStudentCheckIn, User } = models;

  assert.equal(User.associations.submittedClassroomFeedback.target, StudentClassroomFeedback);
  assert.equal(User.associations.submittedClassroomFeedback.options.onDelete, "RESTRICT");
  assert.equal(Classroom.associations.studentFeedback.target, StudentClassroomFeedback);
  assert.equal(Classroom.associations.studentFeedback.options.onDelete, "RESTRICT");
  assert.equal(StudentClassroomFeedback.associations.student.as, "student");
  assert.equal(StudentClassroomFeedback.associations.classroom.as, "classroom");

  const indexes = StudentClassroomFeedback.options.indexes;
  assert.ok(indexes.some((index) => (
    index.name === "student_classroom_feedback_student_key"
      && index.unique === true
      && index.fields.join(",") === "studentId,idempotencyKey"
  )));
  assert.ok(indexes.some((index) => (
    index.name === "student_classroom_feedback_classroom_created_id"
      && index.fields.join(",") === "classroomId,createdAt,id"
  )));
  assert.ok(indexes.some((index) => (
    index.name === "student_classroom_feedback_student_created_id"
      && index.fields.join(",") === "studentId,createdAt,id"
  )));

  assert.equal(TeacherStudentCheckIn.rawAttributes.senderRole.validate.isIn[0].includes("student"), false);
  assert.equal(Classroom.rawAttributes.className.allowNull, false);
});

test("classroom feedback migration is forward-only, registered after check-ins, and enforces privacy", async () => {
  assert.equal(fs.existsSync(migrationPath), true, "classroom feedback migration SQL must exist");
  const sql = fs.readFileSync(migrationPath, "utf8");
  const names = migrations.map(([name]) => name);
  const migrationIndex = names.indexOf(migrationName);

  assert.notEqual(migrationIndex, -1, "classroom feedback migration must be registered");
  assert.equal(migrationIndex, names.length - 1, "forward migration must remain ordered last");
  assert.ok(migrationIndex > names.indexOf("20261025000000_teacher_student_check_ins"));
  assert.match(sql, /^\s*(?:--[^\n]*\n)*\s*BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "StudentClassroomFeedbacks"/);
  assert.match(sql, /"classroomId" INTEGER NOT NULL/);
  assert.match(sql, /"studentId" INTEGER NOT NULL/);
  assert.match(sql, /"message" VARCHAR\(1000\) NOT NULL/);
  assert.match(sql, /"idempotencyKey" VARCHAR\(96\) NOT NULL/);
  assert.match(sql, /FOREIGN KEY \("studentId"\) REFERENCES "Users"\("id"\) ON DELETE RESTRICT/);
  assert.match(sql, /FOREIGN KEY \("classroomId"\) REFERENCES "Classrooms"\("id"\) ON DELETE RESTRICT/);
  assert.match(sql, /length\(trim\("message"\)\) BETWEEN 1 AND 1000/);
  assert.match(sql, /"idempotencyKey" ~ '\^\[A-Za-z0-9_-\]\{8,96\}\$'/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "student_classroom_feedback_student_key"[\s\S]*\("studentId", "idempotencyKey"\)/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS "student_classroom_feedback_classroom_created_id"[\s\S]*\("classroomId", "createdAt", "id"\)/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS "student_classroom_feedback_student_created_id"[\s\S]*\("studentId", "createdAt", "id"\)/);
  assert.match(sql, /ALTER TABLE "StudentClassroomFeedbacks" ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE "StudentClassroomFeedbacks" FROM PUBLIC/);
  assert.match(sql, /ARRAY\['anon', 'authenticated'\]/);
  assert.doesNotMatch(sql, /"recipientTeacherId"/);
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

test("migration runner records classroom feedback once and skips registered reruns", async () => {
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
  assert.equal(firstRun.find(({ statement }) => /INSERT INTO "SharpRunnerMigrations"/.test(statement))?.options?.replacements?.name, migrationName);

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

const databaseUrl = process.env.STUDENT_CLASSROOM_FEEDBACK_MIGRATION_DATABASE_URL;
const postgresTest = databaseUrl ? test : test.skip;

const assertDisposableDatabase = (value) => {
  const parsed = new URL(value);
  assert.match(parsed.protocol, /^postgres(?:ql)?:$/);
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
  assert.equal(parsed.pathname.slice(1), "sharprunner_student_classroom_feedback_rehearsal");
};

postgresTest("classroom feedback migration is rerunnable and enforces constraints on PostgreSQL", async () => {
  assertDisposableDatabase(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  const sql = fs.readFileSync(migrationPath, "utf8");
  await client.connect();

  try {
    const { rows: existingTables } = await client.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'");
    assert.deepEqual(existingTables, [], "rehearsal database must be newly created and empty");
    await client.query(`
      CREATE TABLE "Users" ("id" INTEGER PRIMARY KEY);
      CREATE TABLE "Classrooms" ("id" INTEGER PRIMARY KEY);
      INSERT INTO "Users" ("id") VALUES (1), (2);
      INSERT INTO "Classrooms" ("id") VALUES (10), (11);
    `);
    await client.query(sql);
    await client.query(sql);

    await client.query(`
      INSERT INTO "StudentClassroomFeedbacks"
        ("studentId", "classroomId", "message", "idempotencyKey", "createdAt", "updatedAt")
      VALUES
        (1, 10, 'First feedback', 'shared_key_1', NOW(), NOW()),
        (2, 10, 'Second student', 'shared_key_1', NOW(), NOW())
    `);
    await assert.rejects(client.query(`
      INSERT INTO "StudentClassroomFeedbacks"
        ("studentId", "classroomId", "message", "idempotencyKey", "createdAt", "updatedAt")
      VALUES (1, 11, 'Conflicting key', 'shared_key_1', NOW(), NOW())
    `));
    await assert.doesNotReject(client.query(`
      INSERT INTO "StudentClassroomFeedbacks"
        ("studentId", "classroomId", "message", "idempotencyKey", "createdAt", "updatedAt")
      VALUES (1, 10, $1, 'unicode_ok_1', NOW(), NOW())
    `, ["🙂".repeat(1000)]));
    await assert.rejects(client.query(`
      INSERT INTO "StudentClassroomFeedbacks"
        ("studentId", "classroomId", "message", "idempotencyKey", "createdAt", "updatedAt")
      VALUES (1, 10, $1, 'unicode_bad_1', NOW(), NOW())
    `, ["🙂".repeat(1001)]));
    await assert.rejects(client.query('DELETE FROM "Users" WHERE "id" = 1'));
    await assert.rejects(client.query('DELETE FROM "Classrooms" WHERE "id" = 10'));

    const { rows: tableState } = await client.query(`
      SELECT relrowsecurity FROM pg_class WHERE oid = 'public."StudentClassroomFeedbacks"'::regclass
    `);
    assert.equal(tableState[0].relrowsecurity, true);
    const { rows: indexes } = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'StudentClassroomFeedbacks'
    `);
    for (const expected of [
      "student_classroom_feedback_student_key",
      "student_classroom_feedback_classroom_created_id",
      "student_classroom_feedback_student_created_id",
    ]) assert.ok(indexes.some(({ indexname }) => indexname === expected));
  } finally {
    await client.end();
  }
});
