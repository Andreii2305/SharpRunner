const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const models = require("../src/models");
const {
  ASSESSMENT_TARGET_KINDS,
  ASSESSMENT_TYPES,
} = require("../src/constants/assessmentConfig");
const {
  createAssessmentTargetService,
} = require("../src/services/assessmentTargetService");
const {
  createAssessmentAuthorizationService,
} = require("../src/services/assessmentAuthorizationService");
const { migrations } = require("../src/services/migrationService");

const migrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/20261017000000_custom_lesson_assessment_foundation.sql",
);
const lifecycleMigrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/20261018000000_custom_lesson_lifecycle.sql",
);

const validAssessment = (overrides = {}) => models.LessonAssessment.build({
  classroomId: 7,
  lessonKey: "arrays",
  type: ASSESSMENT_TYPES.PRE,
  title: "Arrays pre-test",
  maxAttempts: 1,
  gradeCalculation: "FIRST",
  requirePassingForCompletion: false,
  answerReviewPolicy: "NEVER",
  ...overrides,
});

test("assessment targets accept only an exclusive built-in or placement identity", async () => {
  await validAssessment().validate();
  assert.equal(validAssessment().targetKind, ASSESSMENT_TARGET_KINDS.BUILT_IN);

  await validAssessment({
    targetKind: ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT,
    lessonKey: null,
    classroomLessonPlacementId: 41,
    targetLessonVersion: 3,
  }).validate();

  for (const overrides of [
    { targetKind: "UNKNOWN" },
    { classroomLessonPlacementId: 41 },
    { targetLessonVersion: 3 },
    {
      targetKind: ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT,
      lessonKey: "arrays",
      classroomLessonPlacementId: 41,
      targetLessonVersion: 3,
    },
    {
      targetKind: ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT,
      lessonKey: null,
      classroomLessonPlacementId: 41,
      targetLessonVersion: null,
    },
  ]) {
    await assert.rejects(validAssessment(overrides).validate(), /assessment target/i);
  }
});

test("revision-specific reading acknowledgements are modeled separately from legacy progress", () => {
  assert.ok(models.ClassroomLessonContentAccess);
  assert.ok(models.ClassroomLessonReadingCompletion);
  assert.ok(models.ClassroomLesson.rawAttributes.contentVersion);
  for (const field of [
    "classroomLessonPlacementId",
    "classroomId",
    "lessonId",
    "studentId",
    "lessonVersion",
    "completedAt",
  ]) {
    assert.ok(models.ClassroomLessonReadingCompletion.rawAttributes[field], field);
  }
  assert.ok(models.ClassroomLessonPlacement.rawAttributes.archivedAt);
  assert.equal(models.ClassroomLessonProgress.rawAttributes.lessonVersion, undefined);
});

test("content access evidence is immutable and scoped to an exact placement revision", () => {
  for (const field of [
    "classroomLessonPlacementId",
    "classroomId",
    "lessonId",
    "studentId",
    "lessonVersion",
    "accessedAt",
  ]) {
    assert.ok(models.ClassroomLessonContentAccess.rawAttributes[field], field);
  }
  assert.equal(models.ClassroomLessonPlacement.associations.contentAccesses.options.onDelete, "RESTRICT");
  assert.equal(models.ClassroomLesson.associations.contentAccesses.options.onDelete, "RESTRICT");
});

test("placement assessment and reading history relationships are restrictive", () => {
  assert.equal(models.ClassroomLesson.associations.placements.options.onDelete, "RESTRICT");
  assert.equal(models.ClassroomLessonPlacement.associations.assessments.options.onDelete, "RESTRICT");
  assert.equal(models.ClassroomLessonPlacement.associations.readingCompletions.options.onDelete, "RESTRICT");
  assert.equal(models.ClassroomLesson.associations.readingCompletions.options.onDelete, "RESTRICT");
  assert.equal(models.Classroom.associations.lessonReadingCompletions.options.onDelete, "RESTRICT");
  assert.equal(models.User.associations.lessonReadingCompletions.options.onDelete, "RESTRICT");
});

test("managed custom targets require ownership, exact placement scope, and current revision", async () => {
  const calls = [];
  const placement = {
    id: 41,
    classroomId: 7,
    lessonId: 91,
    archivedAt: null,
    lesson: { id: 91, contentType: "lesson", archivedAt: null, version: 8, contentVersion: 3 },
  };
  const service = createAssessmentTargetService({
    models: {
      ClassroomLessonPlacement: {
        findOne: async (options) => {
          calls.push(options);
          return options.where.id === 41 && options.where.classroomId === 7 ? placement : null;
        },
      },
      ClassroomLesson: {},
    },
    authorization: {
      requireManagedClassroom: async (input) => {
        calls.push(input);
        return { id: input.classroomId, teacherId: input.actorId };
      },
      requireActiveStudentMembership: async () => ({ id: 1 }),
      assertAcademicLessonKey: (lessonKey) => lessonKey,
    },
  });

  const resolved = await service.resolveManagedTarget({
    classroomId: 7,
    actorId: 12,
    actorRole: "teacher",
    targetKind: ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT,
    classroomLessonPlacementId: 41,
    targetLessonVersion: 3,
  });

  assert.equal(resolved.lessonId, 91);
  assert.equal(calls[1].where.id, 41);
  assert.equal(calls[1].where.classroomId, 7);

  await assert.rejects(service.resolveManagedTarget({
    classroomId: 8,
    actorId: 12,
    actorRole: "teacher",
    targetKind: ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT,
    classroomLessonPlacementId: 41,
    targetLessonVersion: 3,
  }), (error) => error.code === "ASSESSMENT_TARGET_NOT_FOUND");

  await assert.rejects(service.resolveManagedTarget({
    classroomId: 7,
    actorId: 12,
    actorRole: "teacher",
    targetKind: ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT,
    classroomLessonPlacementId: 41,
    targetLessonVersion: 2,
  }), (error) => error.code === "LESSON_VERSION_CONFLICT");
});

test("student target resolution requires active membership and exact placement scope", async () => {
  const memberships = [];
  const service = createAssessmentTargetService({
    models: {
      ClassroomLessonPlacement: {
        findOne: async ({ where }) => where.id === 41 && where.classroomId === 7
          ? {
            id: 41,
            classroomId: 7,
            lessonId: 91,
            archivedAt: null,
            lesson: { id: 91, contentType: "lesson", archivedAt: null, version: 8, contentVersion: 3 },
          }
          : null,
      },
      ClassroomLesson: {},
    },
    authorization: {
      requireManagedClassroom: async () => ({ id: 7 }),
      requireActiveStudentMembership: async (input) => {
        memberships.push(input);
        return { id: 5 };
      },
      assertAcademicLessonKey: (lessonKey) => lessonKey,
    },
  });

  const resolved = await service.resolveStudentTarget({
    classroomId: 7,
    studentId: 22,
    targetKind: ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT,
    classroomLessonPlacementId: 41,
    targetLessonVersion: 3,
  });
  assert.equal(resolved.classroomLessonPlacementId, 41);
  assert.deepEqual(memberships[0], { classroomId: 7, studentId: 22, transaction: undefined });
});

test("existing assessment-id authorization keeps custom targets dormant", async () => {
  const service = createAssessmentAuthorizationService({
    models: {
      Classroom: {},
      ClassroomMembership: {},
      LessonAssessment: {
        findOne: async () => ({
          id: 55,
          classroomId: 7,
          targetKind: ASSESSMENT_TARGET_KINDS.CLASSROOM_LESSON_PLACEMENT,
          classroomLessonPlacementId: 41,
        }),
      },
    },
  });

  await assert.rejects(service.requireAssessmentInClassroom({
    classroomId: 7,
    assessmentId: 55,
  }), (error) => error.code === "ASSESSMENT_NOT_FOUND");
});

test("foundation migration backfills built-ins and enforces target and history constraints", () => {
  assert.equal(fs.existsSync(migrationPath), true);
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /ADD COLUMN IF NOT EXISTS "targetKind"[\s\S]*DEFAULT 'BUILT_IN'/);
  assert.match(sql, /UPDATE "LessonAssessments"[\s\S]*SET "targetKind" = 'BUILT_IN'/);
  assert.match(sql, /lesson_assessment_target_shape_valid/);
  assert.match(sql, /"targetLessonVersion" IS NOT NULL\s+AND "targetLessonVersion" > 0/);
  assert.match(sql, /lesson_assessments_custom_placement_type/);
  assert.match(sql, /UNIQUE \("id", "classroomId"\)/);
  assert.match(sql, /UNIQUE USING INDEX "classroom_lesson_placements_id_classroom_unique"/);
  assert.match(sql, /UNIQUE USING INDEX "classroom_lesson_placements_id_classroom_lesson_unique"/);
  assert.match(sql, /FOREIGN KEY \("classroomLessonPlacementId", "classroomId"\)/);
  assert.match(sql, /REFERENCES "ClassroomLessonPlacements" \("id", "classroomId"\)\s+ON DELETE RESTRICT/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ClassroomLessonReadingCompletions"/);
  assert.match(sql, /UNIQUE \("classroomLessonPlacementId", "studentId", "lessonVersion"\)/);
  assert.match(sql, /UNIQUE USING INDEX "classroom_lesson_reading_completion_revision"/);
  for (const constraint of [
    "classroom_lesson_reading_completion_version_positive",
    "classroom_lesson_reading_completion_placement_fkey",
    "classroom_lesson_reading_completion_revision",
  ]) {
    assert.ok((sql.match(new RegExp(constraint, "g")) || []).length >= 2, constraint);
  }
  assert.match(sql, /prevent_classroom_lesson_reading_completion_mutation/);
  assert.match(sql, /RAISE EXCEPTION 'Classroom lesson reading completions are immutable'/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE "ClassroomLessonReadingCompletions" FROM PUBLIC/);
  assert.doesNotMatch(sql, /UPDATE "ClassroomLessonProgresses"/);

  const names = migrations.map(([name]) => name);
  assert.equal(names.at(-2), "20261017000000_custom_lesson_assessment_foundation");
  assert.equal(names.at(-3), "20261016000000_assessment_attempt_grants");
});

test("lifecycle migration adds current content revisions and immutable exact access evidence", () => {
  assert.equal(fs.existsSync(lifecycleMigrationPath), true);
  const sql = fs.readFileSync(lifecycleMigrationPath, "utf8");

  assert.match(sql, /ADD COLUMN IF NOT EXISTS "contentVersion" INTEGER/);
  assert.doesNotMatch(sql, /ADD COLUMN IF NOT EXISTS "contentVersion" INTEGER DEFAULT/);
  assert.match(sql, /SET "contentVersion" = COALESCE\(NULLIF\("version", 0\), 1\)/);
  assert.match(sql, /ALTER COLUMN "contentVersion" SET NOT NULL/);
  assert.doesNotMatch(sql, /UPDATE "ClassroomLessonProgresses"/);
  assert.doesNotMatch(sql, /INSERT INTO "ClassroomLessonReadingCompletions"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ClassroomLessonContentAccesses"/);
  assert.match(sql, /classroom_lesson_placements_lesson_restrict_fkey/);
  assert.match(sql, /FOREIGN KEY \("classroomLessonPlacementId", "classroomId", "lessonId"\)/);
  assert.match(sql, /REFERENCES "ClassroomLessonPlacements" \("id", "classroomId", "lessonId"\)\s+ON DELETE RESTRICT/);
  assert.match(sql, /UNIQUE \("classroomLessonPlacementId", "studentId", "lessonVersion"\)/);
  assert.match(sql, /prevent_classroom_lesson_content_access_mutation/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON "ClassroomLessonContentAccesses"/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE "ClassroomLessonContentAccesses" FROM PUBLIC/);

  const names = migrations.map(([name]) => name);
  assert.equal(names.at(-1), "20261018000000_custom_lesson_lifecycle");
  assert.equal(names.at(-2), "20261017000000_custom_lesson_assessment_foundation");
});
