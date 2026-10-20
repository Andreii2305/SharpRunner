const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Sequelize } = require("sequelize");

const databaseUrl = process.env.CUSTOM_ASSESSMENT_REHEARSAL_DATABASE_URL;
const run = databaseUrl ? test : test.skip;

const assertDisposableDatabase = (value) => {
  const parsed = new URL(value);
  assert.match(parsed.protocol, /^postgres(?:ql)?:$/, "rehearsal database must use PostgreSQL");
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname), "rehearsal database must be local-only");
  assert.match(parsed.pathname.slice(1), /^sharprunner_custom_(?:predecessor_)?rehearsal$/, "rehearsal database name must be disposable");
};

const assertDatabaseIsEmpty = async (value) => {
  const probe = new Sequelize(value, { logging: false });
  try {
    const [[row]] = await probe.query(`SELECT COUNT(*)::int AS "tableCount"
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'`);
    assert.equal(Number(row.tableCount), 0, "rehearsal database must be newly created and empty");
  } finally {
    await probe.close();
  }
};

run("ordered custom-assessment migrations preserve predecessor data and enforce publication constraints", async () => {
  assertDisposableDatabase(databaseUrl);
  await assertDatabaseIsEmpty(databaseUrl);
  process.env.DATABASE_URL = databaseUrl;
  process.env.DB_SSL = "false";
  require("../src/models");
  const db = require("../src/config/database");
  const { migrations } = require("../src/services/migrationService");
  const foundationIndex = migrations.findIndex(([name]) => name === "20261017000000_custom_lesson_assessment_foundation");
  assert.ok(foundationIndex > 0);

  try {
    for (const [, migrate] of migrations.slice(0, foundationIndex)) await migrate();

    // sequelize.sync() reflects current models. Remove only the additive custom
    // foundation so this database represents the real pre-20261017 shape while
    // retaining every preceding repository migration.
    await db.query(`
      DROP TABLE IF EXISTS "ClassroomLessonContentAccesses" CASCADE;
      DROP TABLE IF EXISTS "ClassroomLessonReadingCompletions" CASCADE;
      ALTER TABLE "LessonAssessments"
        DROP COLUMN IF EXISTS "accessGateEstablishedAt" CASCADE,
        DROP COLUMN IF EXISTS "targetLessonVersion" CASCADE,
        DROP COLUMN IF EXISTS "classroomLessonPlacementId" CASCADE,
        DROP COLUMN IF EXISTS "targetKind" CASCADE;
      ALTER TABLE "LessonAssessments" ALTER COLUMN "lessonKey" SET NOT NULL;
      ALTER TABLE "ClassroomLessonPlacements"
        DROP COLUMN IF EXISTS "accessPolicyEstablishedAt" CASCADE,
        DROP COLUMN IF EXISTS "archivedAt" CASCADE;
      ALTER TABLE "ClassroomLessons" DROP COLUMN IF EXISTS "contentVersion" CASCADE;
    `);

    await db.query(`
      INSERT INTO "Users" ("id", "firstName", "lastName", "username", "email", "role", "status", "createdAt", "updatedAt")
      VALUES (900001, 'Fixture', 'Teacher', 'fixture_teacher', 'teacher@fixture.test', 'teacher', 'active', NOW(), NOW()),
             (900002, 'Fixture', 'Student', 'fixture_student', 'student@fixture.test', 'student', 'active', NOW(), NOW());
      INSERT INTO "Classrooms" ("id", "teacherId", "className", "section", "schoolYear", "classCode", "isActive", "createdAt", "updatedAt")
      VALUES (900001, 900001, 'Fixture class', 'A', '2026', 'FIXTURE900001', TRUE, NOW(), NOW());
      INSERT INTO "ClassroomLessons" ("id", "teacherId", "title", "contentType", "isPublished", "version", "createdAt", "updatedAt")
      VALUES (900001, 900001, 'Fixture lesson', 'lesson', TRUE, 4, NOW(), NOW());
      INSERT INTO "ClassroomLessonPlacements" ("id", "lessonId", "classroomId", "displayOrder", "createdAt", "updatedAt")
      VALUES (900001, 900001, 900001, 0, NOW(), NOW());
      INSERT INTO "LessonAssessments"
        ("id", "classroomId", "lessonKey", "type", "title", "isRequired", "isPublished", "publishedAt",
         "passingPercentage", "maxAttempts", "gradeCalculation", "requirePassingForCompletion",
         "answerReviewPolicy", "version", "createdAt", "updatedAt")
      VALUES
        (900001, 900001, 'arrays', 'POST', 'Existing built-in', TRUE, TRUE, NOW(), 75, 3, 'HIGHEST', TRUE,
         'AFTER_FINAL_ATTEMPT', 1, NOW(), NOW());
    `);

    for (const [, migrate] of migrations.slice(foundationIndex)) await migrate();

    const [[builtIn]] = await db.query(`SELECT "targetKind", "lessonKey", "classroomLessonPlacementId"
      FROM "LessonAssessments" WHERE "id" = 900001`);
    assert.deepEqual(builtIn, { targetKind: "BUILT_IN", lessonKey: "arrays", classroomLessonPlacementId: null });

    const [[historicalPlacement]] = await db.query(`SELECT "accessPolicyEstablishedAt", "contentVersion"
      FROM "ClassroomLessonPlacements" p JOIN "ClassroomLessons" l ON l."id" = p."lessonId"
      WHERE p."id" = 900001`);
    assert.equal(historicalPlacement.accessPolicyEstablishedAt, null);
    assert.equal(Number(historicalPlacement.contentVersion), 4);

    await db.query(`INSERT INTO "ClassroomLessons"
      ("id", "teacherId", "title", "contentType", "isPublished", "version", "contentVersion", "createdAt", "updatedAt")
      VALUES (900002, 900001, 'Independent fixture lesson', 'lesson', TRUE, 4, 4, NOW(), NOW())`);
    await db.query(`INSERT INTO "ClassroomLessonPlacements"
      ("id", "lessonId", "classroomId", "displayOrder", "accessPolicyEstablishedAt", "createdAt", "updatedAt")
      VALUES (900002, 900002, 900001, 1, '2026-10-19T00:00:00Z', NOW(), NOW())`);
    await db.query(`INSERT INTO "LessonAssessments"
      ("id", "classroomId", "targetKind", "lessonKey", "classroomLessonPlacementId", "targetLessonVersion",
       "type", "title", "isRequired", "isPublished", "publishedAt", "passingPercentage", "maxAttempts",
       "gradeCalculation", "requirePassingForCompletion", "answerReviewPolicy", "version", "createdAt", "updatedAt")
      VALUES (900002, 900001, 'CLASSROOM_LESSON_PLACEMENT', NULL, 900002, 4,
       'PRE', 'Fixture PRE', TRUE, FALSE, NULL, NULL, 1, 'FIRST', FALSE, 'NEVER', 1, NOW(), NOW())`);

    await assert.rejects(db.query(`INSERT INTO "LessonAssessments"
      ("classroomId", "targetKind", "lessonKey", "classroomLessonPlacementId", "targetLessonVersion",
       "type", "title", "isPublished", "publishedAt", "passingPercentage", "maxAttempts", "gradeCalculation",
       "requirePassingForCompletion", "answerReviewPolicy", "createdAt", "updatedAt")
      VALUES (900001, 'CLASSROOM_LESSON_PLACEMENT', 'arrays', 900002, 4, 'POST', 'Invalid mixed target',
       FALSE, NULL, 75, 3, 'HIGHEST', TRUE, 'AFTER_SUBMISSION', NOW(), NOW())`));
    await assert.rejects(db.query(`UPDATE "LessonAssessments" SET "isPublished" = TRUE WHERE "id" = 900002`));
    await assert.rejects(db.query(`INSERT INTO "LessonAssessments"
      ("classroomId", "targetKind", "lessonKey", "classroomLessonPlacementId", "targetLessonVersion",
       "type", "title", "isPublished", "publishedAt", "passingPercentage", "maxAttempts", "gradeCalculation",
       "requirePassingForCompletion", "answerReviewPolicy", "createdAt", "updatedAt")
      VALUES (900001, 'CLASSROOM_LESSON_PLACEMENT', NULL, 900002, 4, 'PRE', 'Duplicate PRE',
       FALSE, NULL, NULL, 1, 'FIRST', FALSE, 'NEVER', NOW(), NOW())`));

    const rollback = await db.transaction();
    try {
      await db.query(`UPDATE "LessonAssessments" SET "accessGateEstablishedAt" = '2026-10-19T01:00:00Z',
        "isPublished" = TRUE, "publishedAt" = NOW() WHERE "id" = 900002`, { transaction: rollback });
      throw new Error("fixture rollback");
    } catch {
      await rollback.rollback();
    }
    const [[rolledBack]] = await db.query(`SELECT "isPublished", "accessGateEstablishedAt"
      FROM "LessonAssessments" WHERE "id" = 900002`);
    assert.equal(rolledBack.isPublished, false);
    assert.equal(rolledBack.accessGateEstablishedAt, null);

    const first = new Sequelize(databaseUrl, { logging: false });
    const second = new Sequelize(databaseUrl, { logging: false });
    const transactionA = await first.transaction();
    const transactionB = await second.transaction();
    try {
      await first.query(`UPDATE "LessonAssessments" SET "accessGateEstablishedAt" = COALESCE("accessGateEstablishedAt", '2026-10-19T02:00:00Z') WHERE "id" = 900002`, { transaction: transactionA });
      const competing = second.query(`UPDATE "LessonAssessments" SET "accessGateEstablishedAt" = COALESCE("accessGateEstablishedAt", '2026-10-19T03:00:00Z') WHERE "id" = 900002`, { transaction: transactionB });
      await new Promise((resolve) => setTimeout(resolve, 50));
      await transactionA.commit();
      await competing;
      await transactionB.commit();
    } finally {
      if (!transactionA.finished) await transactionA.rollback();
      if (!transactionB.finished) await transactionB.rollback();
      await first.close();
      await second.close();
    }
    const [[activated]] = await db.query(`SELECT "accessGateEstablishedAt" FROM "LessonAssessments" WHERE "id" = 900002`);
    assert.equal(new Date(activated.accessGateEstablishedAt).toISOString(), "2026-10-19T02:00:00.000Z");
    await assert.rejects(db.query(`UPDATE "LessonAssessments" SET "accessGateEstablishedAt" = '2026-10-19T04:00:00Z' WHERE "id" = 900002`));
    await assert.rejects(db.query(`DELETE FROM "ClassroomLessonPlacements" WHERE "id" = 900002`));

    await db.query(`UPDATE "LessonAssessments" SET "isPublished" = TRUE, "publishedAt" = NOW() WHERE "id" = 900002`);
    const [[published]] = await db.query(`SELECT "isPublished", "publishedAt" FROM "LessonAssessments" WHERE "id" = 900002`);
    assert.equal(published.isPublished, true);
    assert.ok(published.publishedAt);
  } finally {
    await db.close();
  }
});
