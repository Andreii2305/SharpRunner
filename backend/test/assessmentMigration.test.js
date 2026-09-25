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

test("assessment models keep results normalized and out of level progress", () => {
  for (const name of [
    "LessonAssessment",
    "AssessmentQuestion",
    "AssessmentChoice",
    "AssessmentAttempt",
    "AssessmentResponse",
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
    ],
    AssessmentChoice: ["questionId", "choiceText", "displayOrder", "isCorrect"],
    AssessmentAttempt: [
      "assessmentId", "classroomId", "studentId", "attemptNumber", "status",
      "assessmentVersion", "startedAt", "submittedAt", "pointsEarned", "maxPoints",
      "percentage", "correctCount", "questionCount", "passed",
      "passingPercentageApplied", "questionOrder", "choiceOrder", "submissionKey",
    ],
    AssessmentResponse: [
      "attemptId", "questionId", "selectedChoiceId", "isCorrect", "pointsAwarded",
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
