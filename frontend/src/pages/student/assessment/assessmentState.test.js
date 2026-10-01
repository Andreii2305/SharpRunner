import assert from "node:assert/strict";
import test from "node:test";
import {
  assessmentReducer,
  classifyAssessmentDiscovery,
  createAssessmentState,
  getAnswerSummary,
  getAttemptControllerIdentity,
  getCurrentQuestion,
  getSubmissionReadiness,
  parseAssessmentRoute,
} from "./assessmentState.js";

const context = { routeKey: "47:arrays:post", requestGeneration: 4 };
const action = (type, payload = {}) => ({ type, ...context, ...payload });

const activeEnvelope = Object.freeze({
  attempt: Object.freeze({
    attemptId: 312,
    attemptNumber: 2,
    assessmentVersion: 7,
    status: "IN_PROGRESS",
    startedAt: "2026-09-29T00:00:00.000Z",
    resumed: true,
    attemptsUsed: 1,
    attemptsRemaining: 1,
    responses: Object.freeze([
      Object.freeze({ questionId: 102, selectedChoiceId: 1004 }),
    ]),
  }),
  assessment: Object.freeze({
    id: 91,
    lessonKey: "arrays",
    type: "POST",
    title: "Arrays post-test",
    instructions: "Choose the best answer.",
    version: 7,
    questions: Object.freeze([
      Object.freeze({
        id: 101,
        questionText: "Which declaration creates an array?",
        questionType: "MULTIPLE_CHOICE",
        points: 1,
        objectiveKey: "declare-arrays",
        choices: Object.freeze([
          Object.freeze({ id: 1001, choiceText: "int[] values" }),
          Object.freeze({ id: 1002, choiceText: "int values" }),
        ]),
      }),
      Object.freeze({
        id: 102,
        questionText: "Array indexes start at zero.",
        questionType: "TRUE_FALSE",
        points: 1,
        objectiveKey: "index-arrays",
        choices: Object.freeze([
          Object.freeze({ id: 1003, choiceText: "False" }),
          Object.freeze({ id: 1004, choiceText: "True" }),
        ]),
      }),
    ]),
  }),
});

const activeState = () => assessmentReducer(
  createAssessmentState(context),
  action("ATTEMPT_LOADED", { payload: activeEnvelope }),
);

test("route parsing accepts only canonical Phase F assessment routes", () => {
  assert.deepEqual(parseAssessmentRoute({
    classroomId: "47",
    lessonKey: "functions-with-arrays",
    type: "post",
    attemptId: "312",
  }), {
    classroomId: 47,
    lessonKey: "functions-with-arrays",
    type: "POST",
    attemptId: 312,
    routeKey: "47:functions-with-arrays:post",
  });

  for (const invalid of [
    { classroomId: "0", lessonKey: "arrays", type: "pre" },
    { classroomId: "7junk", lessonKey: "arrays", type: "post" },
    { classroomId: "7", lessonKey: "tutorial", type: "pre" },
    { classroomId: "7", lessonKey: "arrays", type: "mid" },
    { classroomId: "7", lessonKey: "arrays", type: "pre", attemptId: "0" },
  ]) {
    assert.equal(parseAssessmentRoute(invalid), null);
  }
});

test("discovery classification distinguishes unavailable, locked, resumable, result, and ready states", () => {
  assert.equal(classifyAssessmentDiscovery({ assessment: null, status: { available: false } }), "unavailable");
  assert.equal(classifyAssessmentDiscovery({ assessment: { id: 91 }, status: { available: true, unlocked: false } }), "locked");
  assert.equal(classifyAssessmentDiscovery({ assessment: { id: 91 }, status: { available: true, unlocked: true, activeAttemptId: 312 } }), "active");
  assert.equal(classifyAssessmentDiscovery({ assessment: { id: 91 }, status: { available: true, unlocked: true, latestSubmittedAttemptId: 311 } }), "result");
  assert.equal(classifyAssessmentDiscovery({ assessment: { id: 91 }, status: { available: true, unlocked: true } }), "ready");
});

test("route changes clear all prior attempt data and stale async actions cannot mutate state", () => {
  const previous = activeState();
  const changed = assessmentReducer(previous, {
    type: "ROUTE_CHANGED",
    routeKey: "47:functions:pre",
    requestGeneration: 5,
  });

  assert.equal(changed.screen, "loading");
  assert.equal(changed.routeKey, "47:functions:pre");
  assert.equal(changed.requestGeneration, 5);
  assert.equal(changed.assessment, null);
  assert.equal(changed.attempt, null);
  assert.deepEqual(changed.selectedByQuestion, {});

  const staleDiscovery = assessmentReducer(changed, action("DISCOVERY_SUCCEEDED", {
    payload: { assessment: { id: 91 }, status: { available: true, unlocked: true } },
  }));
  const staleAttempt = assessmentReducer(changed, action("ATTEMPT_LOADED", {
    payload: activeEnvelope,
  }));
  const staleResult = assessmentReducer(changed, action("RESULT_LOADED", {
    payload: { attemptId: 312, result: { passed: true } },
  }));
  const staleSave = assessmentReducer(changed, action("SAVE_SUCCEEDED", {
    questionId: 101,
    selectedChoiceId: 1001,
    revision: 1,
  }));
  assert.strictEqual(staleDiscovery, changed);
  assert.strictEqual(staleAttempt, changed);
  assert.strictEqual(staleResult, changed);
  assert.strictEqual(staleSave, changed);
});

test("attempt hydration preserves server question/choice order and canonical saved responses", () => {
  const state = activeState();
  assert.equal(state.screen, "active");
  assert.strictEqual(state.assessment, activeEnvelope.assessment);
  assert.strictEqual(state.attempt, activeEnvelope.attempt);
  assert.deepEqual(state.orderedQuestions.map(({ id }) => id), [101, 102]);
  assert.deepEqual(state.orderedQuestions[0].choices.map(({ id }) => id), [1001, 1002]);
  assert.deepEqual(state.selectedByQuestion, { 102: 1004 });
  assert.deepEqual(state.savedByQuestion, { 102: 1004 });
  assert.equal(JSON.stringify(state).match(/isCorrect|correctChoiceId|answerKey|explanation/g), null);
});

test("question navigation supports next, previous, direct review, and hard boundaries", () => {
  const loaded = activeState();
  assert.strictEqual(getCurrentQuestion(loaded), activeEnvelope.assessment.questions[0]);

  const previousAtStart = assessmentReducer(loaded, action("PREVIOUS_QUESTION"));
  assert.strictEqual(previousAtStart, loaded);

  const next = assessmentReducer(loaded, action("NEXT_QUESTION"));
  assert.equal(next.currentQuestionIndex, 1);
  assert.strictEqual(getCurrentQuestion(next), activeEnvelope.assessment.questions[1]);

  const nextAtEnd = assessmentReducer(next, action("NEXT_QUESTION"));
  assert.strictEqual(nextAtEnd, next);

  const previous = assessmentReducer(next, action("PREVIOUS_QUESTION"));
  assert.equal(previous.currentQuestionIndex, 0);

  const reviewed = assessmentReducer(previous, action("QUESTION_CHANGED", { index: 99 }));
  assert.equal(reviewed.currentQuestionIndex, 1);
});

test("local choices become dirty and only the matching save acknowledgement becomes canonical", () => {
  const loaded = activeState();
  const first = assessmentReducer(loaded, action("CHOICE_SELECTED", {
    questionId: 101,
    selectedChoiceId: 1001,
  }));
  assert.deepEqual(first.saveStateByQuestion[101], {
    status: "dirty",
    revision: 1,
    error: null,
  });

  const second = assessmentReducer(first, action("CHOICE_SELECTED", {
    questionId: 101,
    selectedChoiceId: 1002,
  }));
  const staleAck = assessmentReducer(second, action("SAVE_SUCCEEDED", {
    questionId: 101,
    selectedChoiceId: 1001,
    revision: 1,
  }));
  assert.strictEqual(staleAck, second);

  const saving = assessmentReducer(second, action("SAVE_STARTED", {
    questionId: 101,
    selectedChoiceId: 1002,
    revision: 2,
  }));
  const saved = assessmentReducer(saving, action("SAVE_SUCCEEDED", {
    questionId: 101,
    selectedChoiceId: 1002,
    revision: 2,
  }));
  assert.equal(saved.savedByQuestion[101], 1002);
  assert.deepEqual(saved.saveStateByQuestion[101], {
    status: "clean",
    revision: 2,
    error: null,
  });

  const unknownChoice = assessmentReducer(saved, action("CHOICE_SELECTED", {
    questionId: 101,
    selectedChoiceId: 9999,
  }));
  assert.strictEqual(unknownChoice, saved);
});

test("returning to the server-saved choice clears dirty state without grading", () => {
  const loaded = activeState();
  const changed = assessmentReducer(loaded, action("CHOICE_SELECTED", {
    questionId: 102,
    selectedChoiceId: 1003,
  }));
  assert.equal(changed.saveStateByQuestion[102].status, "dirty");

  const restored = assessmentReducer(changed, action("CHOICE_SELECTED", {
    questionId: 102,
    selectedChoiceId: 1004,
  }));
  assert.equal(restored.saveStateByQuestion[102].status, "clean");
  assert.equal(restored.selectedByQuestion[102], 1004);
  assert.equal(restored.savedByQuestion[102], 1004);
});

test("save failures preserve local answers and readiness waits for all dirty or saving responses", () => {
  const selected = assessmentReducer(activeState(), action("CHOICE_SELECTED", {
    questionId: 101,
    selectedChoiceId: 1001,
  }));
  assert.deepEqual(getAnswerSummary(selected), {
    total: 2,
    answered: 2,
    unansweredQuestionIds: [],
  });
  assert.deepEqual(getSubmissionReadiness(selected), {
    ready: false,
    dirtyQuestionIds: [101],
    savingQuestionIds: [],
    failedQuestionIds: [],
  });

  const failure = { code: "NETWORK_ERROR", message: "Save failed" };
  const failed = assessmentReducer(selected, action("SAVE_FAILED", {
    questionId: 101,
    selectedChoiceId: 1001,
    revision: 1,
    error: failure,
  }));
  assert.equal(failed.selectedByQuestion[101], 1001);
  assert.strictEqual(failed.saveStateByQuestion[101].error, failure);
  assert.deepEqual(getSubmissionReadiness(failed), {
    ready: false,
    dirtyQuestionIds: [101],
    savingQuestionIds: [],
    failedQuestionIds: [101],
  });

  const saved = assessmentReducer(failed, action("SAVE_SUCCEEDED", {
    questionId: 101,
    selectedChoiceId: 1001,
    revision: 1,
  }));
  assert.equal(getSubmissionReadiness(saved).ready, true);
});

test("result and progression payloads remain server-authoritative objects", () => {
  const result = Object.freeze({
    attemptId: 312,
    result: Object.freeze({ passed: true, percentage: 80 }),
    officialGrade: Object.freeze({ percentage: 80 }),
  });
  const progression = Object.freeze({ classroomId: 47, lessons: Object.freeze([]) });
  const withResult = assessmentReducer(activeState(), action("SUBMIT_SUCCEEDED", { payload: result }));
  const withProgress = assessmentReducer(withResult, action("PROGRESSION_REFRESHED", { payload: progression }));

  assert.equal(withProgress.screen, "result");
  assert.strictEqual(withProgress.result, result);
  assert.strictEqual(withProgress.progression, progression);
  assert.equal(withProgress.submitStatus, "succeeded");
});

test("submission failure preserves active answers while progression refresh failure preserves the result", () => {
  const before = activeState();
  const submitting = assessmentReducer(before, action("SUBMIT_STARTED"));
  assert.equal(submitting.submitStatus, "submitting");
  assert.equal(submitting.submitReviewOpen, false);

  const submitError = { code: "NETWORK_ERROR" };
  const failed = assessmentReducer(submitting, action("SUBMIT_FAILED", { error: submitError }));
  assert.equal(failed.screen, "active");
  assert.equal(failed.submitStatus, "error");
  assert.strictEqual(failed.assessment, before.assessment);
  assert.deepEqual(failed.selectedByQuestion, before.selectedByQuestion);

  const resultEnvelope = Object.freeze({
    result: Object.freeze({ attemptId: 312, type: "POST", passed: false }),
    reviewAvailable: false,
  });
  const succeeded = assessmentReducer(failed, action("SUBMIT_SUCCEEDED", { payload: resultEnvelope }));
  const progressionError = { code: "NETWORK_ERROR" };
  const refreshFailed = assessmentReducer(
    succeeded,
    action("PROGRESSION_REFRESH_FAILED", { error: progressionError }),
  );
  assert.equal(refreshFailed.screen, "result");
  assert.strictEqual(refreshFailed.result, resultEnvelope);
  assert.strictEqual(refreshFailed.progressionError, progressionError);
});

test("failed immutable result recovery keeps the attempt locked for result-only retry", () => {
  const before = activeState();
  const recovering = assessmentReducer(before, action("SUBMIT_RECOVERY_STARTED"));
  assert.equal(recovering.submitStatus, "recovering-result");

  const error = { code: "NETWORK_ERROR" };
  const failed = assessmentReducer(recovering, action("SUBMIT_RECOVERY_FAILED", { error }));
  assert.equal(failed.screen, "active");
  assert.equal(failed.submitStatus, "recovery-error");
  assert.strictEqual(failed.error, error);
  assert.equal(failed.submitReviewOpen, false);
});

test("submission result keeps the same attempt-controller identity until route or attempt changes", () => {
  const active = activeState();
  const identity = getAttemptControllerIdentity(active);
  const submitted = assessmentReducer(active, action("SUBMIT_SUCCEEDED", {
    payload: { result: { attemptId: 312, type: "POST", status: "SUBMITTED" } },
  }));
  assert.equal(getAttemptControllerIdentity(submitted), identity);

  const changedRoute = assessmentReducer(submitted, {
    type: "ROUTE_CHANGED",
    routeKey: "47:functions:pre",
    requestGeneration: 5,
  });
  assert.equal(getAttemptControllerIdentity(changedRoute), null);
});

test("submit success clears pre-submit progression until exact-classroom refresh succeeds", () => {
  const active = {
    ...activeState(),
    progression: {
      classroomId: 47,
      lessons: [{ lessonKey: "arrays", postAttemptsRemaining: 2, nextAction: "RETRY_POST" }],
    },
  };
  const submitted = assessmentReducer(active, action("SUBMIT_SUCCEEDED", {
    payload: { result: { attemptId: 312, type: "POST", status: "SUBMITTED" } },
  }));
  assert.equal(submitted.progression, null);
});

test("external invalidation closes submission review and blocks edits until authoritative hydration", () => {
  const active = assessmentReducer(activeState(), action("SUBMIT_REVIEW_OPENED"));
  const invalidated = assessmentReducer(active, action("SERVER_STATE_INVALIDATED", {
    reason: "remote-change",
  }));
  assert.equal(invalidated.externalSyncRequired, true);
  assert.equal(invalidated.externalSyncStatus, "required");
  assert.equal(invalidated.submitReviewOpen, false);

  const checking = assessmentReducer(invalidated, action("SERVER_SYNC_STARTED"));
  assert.equal(checking.externalSyncStatus, "checking");

  const refreshed = assessmentReducer(checking, action("ATTEMPT_LOADED", {
    payload: activeEnvelope,
  }));
  assert.equal(refreshed.externalSyncRequired, false);
  assert.equal(refreshed.externalSyncStatus, "idle");
  assert.notEqual(
    getAttemptControllerIdentity(refreshed),
    getAttemptControllerIdentity(active),
  );
});

test("failed background revalidation keeps clean work editable and exposes retry state", () => {
  const active = activeState();
  const checking = assessmentReducer(active, action("SERVER_SYNC_STARTED"));
  const error = new Error("Offline");
  const failed = assessmentReducer(checking, action("SERVER_SYNC_FAILED", { error }));
  assert.equal(failed.externalSyncRequired, false);
  assert.equal(failed.externalSyncStatus, "error");
  assert.strictEqual(failed.externalSyncError, error);
});

const codingEnvelope = (responses = []) => ({
  attempt: {
    ...activeEnvelope.attempt,
    responses,
  },
  assessment: {
    ...activeEnvelope.assessment,
    questions: [{
      id: 201,
      questionText: "Return the array length.",
      questionType: "CODING",
      points: 3,
      objectiveKey: "array-length",
      starterCode: "return 0;",
      language: "csharp",
    }],
  },
});

test("coding hydration distinguishes unsaved starter code from persisted empty source", () => {
  const starter = assessmentReducer(
    createAssessmentState(context),
    action("ATTEMPT_LOADED", { payload: codingEnvelope() }),
  );
  assert.equal(starter.sourceByQuestion[201], "return 0;");
  assert.equal(starter.savedSourceByQuestion[201], undefined);
  assert.equal(starter.responseExistsByQuestion[201], undefined);
  assert.deepEqual(getAnswerSummary(starter), {
    total: 1,
    answered: 0,
    unansweredQuestionIds: [201],
  });
  assert.deepEqual(getSubmissionReadiness(starter).dirtyQuestionIds, [201]);

  const persistedEmpty = assessmentReducer(
    createAssessmentState(context),
    action("ATTEMPT_LOADED", {
      payload: codingEnvelope([{ questionId: 201, sourceCode: "" }]),
    }),
  );
  assert.equal(persistedEmpty.sourceByQuestion[201], "");
  assert.equal(persistedEmpty.savedSourceByQuestion[201], "");
  assert.equal(persistedEmpty.responseExistsByQuestion[201], true);
  assert.equal(getSubmissionReadiness(persistedEmpty).ready, true);
  assert.equal(getAnswerSummary(persistedEmpty).answered, 0);
});

test("coding source becomes answered only after its matching server save succeeds", () => {
  const loaded = assessmentReducer(
    createAssessmentState(context),
    action("ATTEMPT_LOADED", { payload: codingEnvelope() }),
  );
  const changed = assessmentReducer(loaded, action("SOURCE_CHANGED", {
    questionId: 201,
    sourceCode: "return values.Length;",
  }));
  assert.equal(changed.saveStateByQuestion[201].status, "dirty");
  assert.equal(getAnswerSummary(changed).answered, 0);

  const stale = assessmentReducer(changed, action("SAVE_SUCCEEDED", {
    questionId: 201,
    sourceCode: "return old;",
    revision: 1,
  }));
  assert.strictEqual(stale, changed);

  const saved = assessmentReducer(changed, action("SAVE_SUCCEEDED", {
    questionId: 201,
    sourceCode: "return values.Length;",
    revision: 1,
  }));
  assert.equal(saved.savedSourceByQuestion[201], "return values.Length;");
  assert.equal(saved.responseExistsByQuestion[201], true);
  assert.equal(getAnswerSummary(saved).answered, 1);
  assert.equal(getSubmissionReadiness(saved).ready, true);
});

test("editing coding source clears public-run feedback for the previous source", () => {
  const loaded = assessmentReducer(
    createAssessmentState(context),
    action("ATTEMPT_LOADED", { payload: codingEnvelope([{ questionId: 201, sourceCode: "return 1;" }]) }),
  );
  const withRun = assessmentReducer(loaded, action("CODING_RUN_SUCCEEDED", {
    questionId: 201,
    result: { status: "SUCCESS", tests: [{ passed: true }] },
  }));
  assert.equal(withRun.codingRunByQuestion[201].status, "succeeded");

  const edited = assessmentReducer(withRun, action("SOURCE_CHANGED", {
    questionId: 201,
    sourceCode: "return 2;",
  }));
  assert.equal(edited.codingRunByQuestion[201], undefined);
});

test("grading state is immutable, refresh-recoverable, and can return to retryable in-progress", () => {
  const loaded = activeState();
  const grading = assessmentReducer(loaded, action("SUBMIT_GRADING_STARTED"));
  assert.equal(grading.submitStatus, "grading");
  assert.equal(grading.attempt.status, "GRADING");

  const pending = assessmentReducer(grading, action("SUBMIT_GRADING_PENDING"));
  assert.equal(pending.submitStatus, "grading-pending");
  const pollFailed = assessmentReducer(pending, action("SUBMIT_GRADING_POLL_FAILED", {
    error: { code: "NETWORK_ERROR" },
  }));
  assert.equal(pollFailed.submitStatus, "grading-error");
  assert.equal(pollFailed.attempt.status, "GRADING");

  const released = assessmentReducer(pollFailed, action("SUBMIT_GRADING_RELEASED", {
    error: { code: "ATTEMPT_IN_PROGRESS" },
  }));
  assert.equal(released.submitStatus, "error");
  assert.equal(released.attempt.status, "IN_PROGRESS");

  const refreshed = assessmentReducer(
    createAssessmentState(context),
    action("ATTEMPT_LOADED", {
      payload: {
        ...activeEnvelope,
        attempt: { ...activeEnvelope.attempt, status: "GRADING" },
      },
    }),
  );
  assert.equal(refreshed.submitStatus, "grading");
});
