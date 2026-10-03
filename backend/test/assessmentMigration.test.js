const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const models = require("../src/models");
const { migrations } = require("../src/services/migrationService");

const migrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/20260925000000_lesson_assessments.sql",
);
const codingMigrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/20261001000000_coding_assessments.sql",
);
const gradingLeaseMigrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/20261001020000_assessment_grading_lease.sql",
);
const executionModeMigrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/20261002000000_coding_execution_modes.sql",
);
const parameterNamesMigrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/20261003000000_method_parameter_names.sql",
);

test("assessment models keep results normalized and out of level progress", () => {
  for (const name of [
    "LessonAssessment",
    "AssessmentQuestion",
    "AssessmentChoice",
    "AssessmentAttempt",
    "AssessmentResponse",
    "AssessmentCodingTestCase",
  ]) {
    assert.ok(models[name], `${name} must be registered`);
  }

  const expectedFields = {
    LessonAssessment: [
      "classroomId", "lessonKey", "type", "title", "instructions", "isRequired",
      "isPublished", "publishedAt", "passingPercentage", "maxAttempts",
      "gradeCalculation", "requirePassingForCompletion", "showScoreAfterSubmission",
      "answerReviewPolicy", "shuffleQuestions", "shuffleChoices", "createdBy", "version",
    ],
    AssessmentQuestion: [
      "assessmentId", "questionText", "questionType", "displayOrder", "points",
      "explanation", "objectiveKey",
      "starterCode", "codingTypeName", "codingMethodName", "codingParameterTypes",
      "codingParameterNames", "codingReturnType", "codingExecutionMode",
    ],
    AssessmentChoice: ["questionId", "choiceText", "displayOrder", "isCorrect"],
    AssessmentAttempt: [
      "assessmentId", "classroomId", "studentId", "attemptNumber", "status",
      "assessmentVersion", "startedAt", "submittedAt", "pointsEarned", "maxPoints",
      "percentage", "correctCount", "questionCount", "passed",
      "passingPercentageApplied", "questionOrder", "choiceOrder", "submissionKey",
      "gradingLeaseToken", "gradingLeaseExpiresAt",
    ],
    AssessmentResponse: [
      "attemptId", "questionId", "selectedChoiceId", "sourceCode", "isCorrect", "pointsAwarded",
    ],
    AssessmentCodingTestCase: [
      "questionId", "displayOrder", "visibility", "input", "expectedOutput", "weight",
    ],
  };
  for (const [name, fields] of Object.entries(expectedFields)) {
    for (const field of fields) {
      assert.ok(models[name].rawAttributes[field], `${name}.${field} must be modeled`);
    }
  }

  for (const forbidden of ["preTestScore", "postTestScore", "assessmentId"]) {
    assert.equal(models.UserProgress.rawAttributes[forbidden], undefined);
    assert.equal(models.ClassroomLessonProgress.rawAttributes[forbidden], undefined);
  }
});

test("assessment associations preserve submitted history", () => {
  assert.equal(models.LessonAssessment.associations.questions.options.onDelete, "CASCADE");
  assert.equal(models.LessonAssessment.associations.attempts.options.onDelete, "RESTRICT");
  assert.equal(models.AssessmentQuestion.associations.responses.options.onDelete, "RESTRICT");
  assert.equal(models.AssessmentChoice.associations.responses.options.onDelete, "RESTRICT");
  assert.equal(models.AssessmentAttempt.associations.responses.options.onDelete, "RESTRICT");
  assert.equal(models.AssessmentQuestion.associations.codingTestCases.options.onDelete, "CASCADE");
  assert.equal(models.User.associations.assessmentAttempts.options.onDelete, "RESTRICT");
  assert.equal(models.Classroom.associations.assessments.options.onDelete, "RESTRICT");
});

test("assessment migration defines five protected normalized tables", () => {
  assert.equal(fs.existsSync(migrationPath), true, "assessment migration must exist");
  const sql = fs.readFileSync(migrationPath, "utf8");

  for (const table of [
    "LessonAssessments",
    "AssessmentQuestions",
    "AssessmentChoices",
    "AssessmentAttempts",
    "AssessmentResponses",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
    assert.match(sql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`REVOKE ALL PRIVILEGES ON TABLE "${table}" FROM PUBLIC`));
  }

  assert.match(sql, /REFERENCES "Classrooms"\("id"\) ON DELETE RESTRICT/);
  assert.match(sql, /REFERENCES "Users"\("id"\) ON DELETE RESTRICT/);
  assert.match(sql, /REFERENCES "AssessmentQuestions"\("id"\) ON DELETE RESTRICT/);
  assert.match(sql, /REFERENCES "AssessmentChoices"\("id"\) ON DELETE RESTRICT/);
  assert.match(sql, /lesson_assessments_classroom_lesson_type/);
  assert.match(sql, /assessment_questions_assessment_order/);
  assert.match(sql, /assessment_choices_question_order/);
  assert.match(sql, /assessment_attempts_assessment_student_number/);
  assert.match(sql, /assessment_responses_attempt_question/);
});

test("attempt migration enforces active-attempt, idempotency, and analytics indexes", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "assessment_attempts_one_in_progress"[\s\S]*WHERE "status" = 'IN_PROGRESS'/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "assessment_attempts_submission_key"[\s\S]*WHERE "submissionKey" IS NOT NULL/);
  assert.match(sql, /assessment_attempts_classroom_student_submitted/);
  assert.match(sql, /assessment_attempts_assessment_status_submitted/);
  assert.match(sql, /assessment_questions_assessment_objective/);
});

test("assessment migration includes domain checks and revokes client roles", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  for (const constraint of [
    "lesson_assessment_type_valid",
    "lesson_assessment_lesson_key_valid",
    "lesson_assessment_pre_invariants",
    "lesson_assessment_post_invariants",
    "assessment_question_type_valid",
    "assessment_question_points_positive",
    "assessment_attempt_status_valid",
    "assessment_attempt_percentage_valid",
    "assessment_response_points_nonnegative",
  ]) {
    assert.match(sql, new RegExp(constraint));
  }
  assert.match(sql, /ARRAY\['anon', 'authenticated'\]/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM %I/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON SEQUENCE public\.%I FROM %I/);
});

test("every table check is applied defensively after sequelize sync", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  for (const constraint of [
    "lesson_assessment_type_valid",
    "lesson_assessment_lesson_key_valid",
    "lesson_assessment_title_present",
    "lesson_assessment_version_positive",
    "lesson_assessment_attempts_valid",
    "lesson_assessment_review_policy_valid",
    "lesson_assessment_pre_invariants",
    "lesson_assessment_post_invariants",
    "assessment_question_type_valid",
    "assessment_question_text_present",
    "assessment_question_order_nonnegative",
    "assessment_question_points_positive",
    "assessment_choice_text_present",
    "assessment_choice_order_nonnegative",
    "assessment_attempt_status_valid",
    "assessment_attempt_number_positive",
    "assessment_attempt_version_positive",
    "assessment_attempt_points_valid",
    "assessment_attempt_percentage_valid",
    "assessment_attempt_counts_valid",
    "assessment_attempt_passing_valid",
    "assessment_attempt_submission_state_valid",
    "assessment_response_points_nonnegative",
  ]) {
    const occurrences = sql.match(new RegExp(constraint, "g")) || [];
    assert.ok(occurrences.length >= 2, `${constraint} must exist in CREATE TABLE and defensive ALTER TABLE SQL`);
  }
});

test("assessment migration is explicitly registered after the previous migration", () => {
  const names = migrations.map(([name]) => name);
  const assessmentIndex = names.indexOf("20260925000000_lesson_assessments");
  assert.notEqual(assessmentIndex, -1);
  assert.equal(names[assessmentIndex - 1], "20260922000000_hint_purchase_event_cost");
});

test("coding assessment migration is additive, protected, and registered after the base assessment schema", () => {
  const sql = fs.readFileSync(codingMigrationPath, "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "sourceCode" TEXT/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "starterCode" TEXT/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "AssessmentCodingTestCases"/);
  assert.match(sql, /REFERENCES "AssessmentQuestions"\("id"\) ON DELETE CASCADE/);
  assert.match(sql, /'MULTIPLE_CHOICE', 'TRUE_FALSE', 'CODING'/);
  assert.match(sql, /assessment_coding_test_visibility_valid/);
  assert.match(sql, /assessment_coding_test_weight_positive/);
  assert.match(sql, /assessment_response_answer_shape_valid/);
  assert.match(sql, /assessment_response_source_size_valid/);
  assert.match(sql, /octet_length\("sourceCode"\) <= 16384/);
  assert.match(sql, /assessment_coding_tests_question_order/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  const names = migrations.map(([name]) => name);
  assert.equal(names.at(-5), "20261001000000_coding_assessments");
  assert.equal(names.at(-6), "20260925000000_lesson_assessments");
});

test("teacher-only coding reference solution migration is additive and size-bounded", () => {
  const path = require("path").join(__dirname, "../../supabase/migrations/20261001010000_coding_reference_solution.sql");
  const sql = fs.readFileSync(path, "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "referenceSolution" TEXT/);
  assert.match(sql, /octet_length\("referenceSolution"\) <= 16384/);
  assert.doesNotMatch(sql, /DROP COLUMN|DROP TABLE/i);
  const names = migrations.map(([name]) => name);
  assert.equal(names.at(-4), "20261001010000_coding_reference_solution");
  assert.equal(names.at(-5), "20261001000000_coding_assessments");
});

test("grading lease migration is additive, constrained, and registered last", () => {
  assert.equal(fs.existsSync(gradingLeaseMigrationPath), true);
  const sql = fs.readFileSync(gradingLeaseMigrationPath, "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "gradingLeaseToken" VARCHAR\(96\)/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "gradingLeaseExpiresAt" TIMESTAMPTZ/);
  assert.match(sql, /'IN_PROGRESS', 'GRADING', 'SUBMITTED'/);
  assert.match(sql, /assessment_attempt_grading_state_valid/);
  assert.match(sql, /"status" = 'GRADING'[\s\S]*"submissionKey" IS NOT NULL[\s\S]*"gradingLeaseToken" IS NOT NULL[\s\S]*"gradingLeaseExpiresAt" IS NOT NULL/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
  const names = migrations.map(([name]) => name);
  assert.equal(names.at(-3), "20261001020000_assessment_grading_lease");
  assert.equal(names.at(-4), "20261001010000_coding_reference_solution");
});

test("coding execution mode migration backfills CODING as METHOD without changing non-coding rows", () => {
  assert.equal(fs.existsSync(executionModeMigrationPath), true);
  const sql = fs.readFileSync(executionModeMigrationPath, "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "codingExecutionMode" VARCHAR\(8\)/);
  assert.match(sql, /UPDATE "AssessmentQuestions"[\s\S]*SET "codingExecutionMode" = 'METHOD'[\s\S]*"questionType" = 'CODING'/);
  assert.match(sql, /'METHOD', 'PROGRAM'/);
  assert.match(sql, /"questionType" <> 'CODING'[\s\S]*"codingExecutionMode" IS NULL/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
  const names = migrations.map(([name]) => name);
  assert.equal(names.at(-2), "20261002000000_coding_execution_modes");
});

test("METHOD parameter-name migration is nullable additive and registered last", () => {
  assert.equal(fs.existsSync(parameterNamesMigrationPath), true);
  const sql = fs.readFileSync(parameterNamesMigrationPath, "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "codingParameterNames" JSONB/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|TRUNCATE|DROP)\b/i);
  assert.doesNotMatch(sql, /NOT NULL|DEFAULT/i);
  const names = migrations.map(([name]) => name);
  assert.equal(names.at(-1), "20261003000000_method_parameter_names");
  assert.equal(names.at(-2), "20261002000000_coding_execution_modes");
});
