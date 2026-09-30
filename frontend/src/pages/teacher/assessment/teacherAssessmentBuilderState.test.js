import assert from "node:assert/strict";
import test from "node:test";
import {
  ACADEMIC_LESSONS, addChoice, addQuestion, assessmentStatus, buildSaveGraph,
  createAssessmentDraft, moveChoice, moveQuestion, publishIssues, removeChoice,
  removeQuestion, selectCorrectChoice, updateQuestionType,
} from "./teacherAssessmentBuilderState.js";

test("academic lesson scope exactly follows backend policy", () => {
  assert.deepEqual(ACADEMIC_LESSONS.map(({ key }) => key), ["arrays", "functions", "functions-with-arrays", "final"]);
});

test("statuses distinguish missing, draft, published, and locked", () => {
  assert.equal(assessmentStatus({ exists: false }), "Not created");
  assert.equal(assessmentStatus({ exists: true, published: false }), "Draft");
  assert.equal(assessmentStatus({ exists: true, published: true }), "Published");
  assert.equal(assessmentStatus({ exists: true, attemptsExist: true }), "Locked");
});

test("PRE and POST drafts preserve their distinct backend semantics", () => {
  const pre = createAssessmentDraft("PRE", "arrays");
  const post = createAssessmentDraft("POST", "arrays");
  assert.deepEqual([pre.maxAttempts, pre.passingPercentage, pre.requirePassingForCompletion, pre.answerReviewPolicy], [1, null, false, "NEVER"]);
  assert.deepEqual([post.maxAttempts, post.passingPercentage, post.requirePassingForCompletion, post.answerReviewPolicy], [3, 75, true, "AFTER_FINAL_ATTEMPT"]);
});

test("MCQ and true/false editing supports add, remove, reorder, and exactly one correct choice", () => {
  let questions = addQuestion([], "MULTIPLE_CHOICE");
  questions = addChoice(questions, questions[0].clientId);
  questions = selectCorrectChoice(questions, questions[0].clientId, questions[0].choices[2].clientId);
  questions = moveChoice(questions, questions[0].clientId, 2, -1);
  assert.equal(questions[0].choices.length, 3);
  assert.equal(questions[0].choices.filter((choice) => choice.isCorrect).length, 1);
  questions = removeChoice(questions, questions[0].clientId, questions[0].choices[2].clientId);
  questions = addQuestion(questions, "TRUE_FALSE");
  questions = updateQuestionType(questions, questions[1].clientId, "TRUE_FALSE");
  assert.deepEqual(questions[1].choices.map((choice) => choice.choiceText), ["True", "False"]);
  questions = moveQuestion(questions, 1, -1);
  assert.equal(questions[0].questionType, "TRUE_FALSE");
  questions = removeQuestion(questions, questions[0].clientId);
  assert.equal(questions.length, 1);
});

test("save graph emits only backend DTO fields and canonical display order", () => {
  const draft = createAssessmentDraft("POST", "functions");
  draft.questions = addQuestion([], "MULTIPLE_CHOICE");
  draft.questions[0].questionText = "Which declaration is valid?";
  draft.questions[0].choices[0].choiceText = "int[] values";
  draft.questions[0].choices[1].choiceText = "int values[]()";
  const graph = buildSaveGraph({ ...draft, version: 2 });
  assert.equal(graph.version, 2);
  assert.equal(graph.questions[0].displayOrder, undefined);
  assert.deepEqual(Object.keys(graph.questions[0]).sort(), ["choices", "explanation", "objectiveKey", "points", "questionText", "questionType"].sort());
  assert.deepEqual(Object.keys(graph.questions[0].choices[0]).sort(), ["choiceText", "isCorrect"].sort());
});

test("publish summary catches obvious incompleteness without replacing backend validation", () => {
  const draft = createAssessmentDraft("POST", "arrays");
  assert.deepEqual(publishIssues(draft), ["Add at least one question."]);
  draft.questions = addQuestion([], "MULTIPLE_CHOICE");
  assert.equal(publishIssues(draft).some((issue) => issue.includes("question text")), true);
  draft.questions[0].questionText = "Ready?";
  draft.questions[0].choices.forEach((choice, index) => { choice.choiceText = `Choice ${index + 1}`; });
  assert.deepEqual(publishIssues(draft), []);
});
