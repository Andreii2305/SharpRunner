const assert = require("node:assert/strict");
const { test } = require("node:test");

const { createAssessmentAttemptAllowanceService } = require("../src/services/assessmentAttemptAllowanceService");

const submitted = (attemptNumber, overrides = {}) => ({
  id: attemptNumber,
  attemptNumber,
  status: "SUBMITTED",
  passed: false,
  ...overrides,
});

test("allowance preserves historical recovery attempts without fabricating grants", () => {
  const service = createAssessmentAttemptAllowanceService({ models: {} });
  assert.deepEqual(service.summarizeAllowance({
    assessment: { maxAttempts: 3 },
    attempts: [submitted(1), submitted(2), submitted(3), submitted(4)],
    grants: [],
  }), {
    standardAttemptAllowance: 3,
    additionalAttemptsGranted: 0,
    additionalAttemptsAvailable: 0,
    totalAttemptAllowance: 4,
    attemptsUsed: 4,
    attemptsRemaining: 0,
    activeAttempt: null,
  });
});

test("a new grant adds one attempt after a historical recovery without double-counting consumed grants", () => {
  const service = createAssessmentAttemptAllowanceService({ models: {} });
  const assessment = { maxAttempts: 3 };
  const historical = [1, 2, 3, 4].map((attemptNumber) => ({ attemptNumber, status: "SUBMITTED" }));
  const unused = [{ id: 8, consumedByAttemptId: null }];
  assert.equal(service.summarizeAllowance({ assessment, attempts: historical, grants: unused }).totalAttemptAllowance, 5);

  const consumed = [{ id: 8, consumedByAttemptId: 104 }];
  assert.equal(service.summarizeAllowance({ assessment, attempts: historical, grants: consumed }).totalAttemptAllowance, 4);
});

test("one unused grant adds exactly one available attempt and active work consumes availability", () => {
  const service = createAssessmentAttemptAllowanceService({ models: {} });
  const grant = { id: 9, consumedByAttemptId: null };
  const available = service.summarizeAllowance({
    assessment: { maxAttempts: 1 }, attempts: [submitted(1)], grants: [grant],
  });
  assert.equal(available.totalAttemptAllowance, 2);
  assert.equal(available.additionalAttemptsAvailable, 1);
  assert.equal(available.attemptsRemaining, 1);

  const active = service.summarizeAllowance({
    assessment: { maxAttempts: 1 },
    attempts: [submitted(1), { id: 22, attemptNumber: 2, status: "IN_PROGRESS" }],
    grants: [{ ...grant, consumedByAttemptId: 22 }],
  });
  assert.equal(active.additionalAttemptsAvailable, 0);
  assert.equal(active.totalAttemptAllowance, 2);
  assert.equal(active.attemptsRemaining, 0);
  assert.equal(active.activeAttempt.id, 22);
});

test("answer review eligibility is monotonic across a grant", () => {
  const service = createAssessmentAttemptAllowanceService({ models: {} });
  const attempts = [submitted(1)];
  assert.equal(service.isAnswerReviewEligible({
    assessment: { answerReviewPolicy: "AFTER_FINAL_ATTEMPT", maxAttempts: 1 }, attempts, grants: [],
  }), true);
  assert.equal(service.isAnswerReviewEligible({
    assessment: { answerReviewPolicy: "AFTER_FINAL_ATTEMPT", maxAttempts: 1 },
    attempts,
    grants: [{ id: 2, consumedByAttemptId: null, answerReviewWasEligibleAtGrant: true }],
  }), true);
  assert.equal(service.isAnswerReviewEligible({
    assessment: { answerReviewPolicy: "NEVER", maxAttempts: 1 },
    attempts,
    grants: [{ id: 2, answerReviewWasEligibleAtGrant: true }],
  }), false);
});
