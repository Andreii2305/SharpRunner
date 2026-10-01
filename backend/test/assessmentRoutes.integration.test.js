const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const http = require("node:http");
const { after, afterEach, before, test } = require("node:test");

process.env.JWT_SECRET = "assessment-route-integration-secret";

const models = require("../src/models");
const User = require("../src/models/User");
const assessmentAttemptService = require("../src/services/assessmentAttemptService");
const lessonProgressionService = require("../src/services/lessonProgressionService");
const { canExposeAnswerReview } = require("../src/services/assessmentReadService");
const sequelize = require("../src/config/database");
const productionApp = require("../src/app");
const { createAssessmentAuthorizationService } = require("../src/services/assessmentAuthorizationService");
const { TERMS_VERSION, PRIVACY_POLICY_VERSION } = require("../src/constants/policyVersions");

const restorations = [];
let server;
let baseUrl;

const stub = (target, property, replacement) => {
  restorations.push([target, property, target[property]]);
  target[property] = replacement;
};

const activeUser = (id, role = "student") => ({
  id,
  role,
  status: "active",
  tokenVersion: 0,
  termsVersionAccepted: TERMS_VERSION,
  privacyVersionAcknowledged: PRIVACY_POLICY_VERSION,
});

const token = (id, role = "student") => jwt.sign(
  { id, role, tokenVersion: 0 },
  process.env.JWT_SECRET,
  { expiresIn: "5m" },
);

const request = async (path, { authToken, method = "GET", body, headers = {} } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { response, payload: await response.json() };
};

const assessment = (overrides = {}) => ({
  id: 12,
  classroomId: 7,
  lessonKey: "arrays",
  type: "POST",
  title: "Arrays post-test",
  instructions: "Choose one answer.",
  isRequired: true,
  isPublished: true,
  maxAttempts: 3,
  showScoreAfterSubmission: true,
  passingPercentage: 75,
  gradeCalculation: "HIGHEST",
  answerReviewPolicy: "AFTER_FINAL_ATTEMPT",
  createdBy: 5,
  version: 3,
  questions: [{
    id: 101,
    questionText: "Which declaration is valid?",
    questionType: "MULTIPLE_CHOICE",
    displayOrder: 0,
    points: "2.00",
    explanation: "Arrays use brackets.",
    objectiveKey: "array-declaration",
    choices: [
      { id: 1001, choiceText: "int[] values", displayOrder: 0, isCorrect: true },
      { id: 1002, choiceText: "int values[]()", displayOrder: 1, isCorrect: false },
    ],
  }],
  ...overrides,
});

// Exercise the real router, authorization, serializers and Phase B mutations.
// Only persistence is replaced; the transaction queue models serialized row locks.
const mutationHarness = (overrides = {}, {
  progressionGuard = async () => ({ allowed: true, reason: null }),
} = {}) => {
  const graph = assessment({ shuffleQuestions: true, shuffleChoices: true,
    requirePassingForCompletion: true, ...overrides });
  const store = { assessments: [graph], attempts: [], responses: [],
    memberships: [{ classroomId: 7, studentId: 42, status: "active" }], saves: 0,
    graphReads: 0, responseReads: 0, siblingQueries: [] };
  let tail = Promise.resolve();
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => row[key] === value);
  const persisted = (value, isAttempt = false) => {
    if (!value) return null;
    Object.defineProperty(value, "save", { configurable: true, enumerable: false,
      value: async () => { if (isAttempt) store.saves += 1; return value; } });
    return value;
  };
  stub(User, "findByPk", async (id) => activeUser(Number(id), Number(id) === 5 ? "teacher" : "student"));
  stub(lessonProgressionService, "assertAssessmentInteractionAllowed", progressionGuard);
  stub(lessonProgressionService, "getLessonProgressionState", async () => ({
    curriculumPrerequisiteSatisfied: true,
    preRequired: false,
    preCompleted: false,
    gameCompleted: true,
    postUnlocked: true,
    postPassed: false,
  }));
  stub(sequelize, "transaction", (callback) => {
    const pending = tail.then(() => callback({ LOCK: { UPDATE: "UPDATE" } }));
    tail = pending.catch(() => {});
    return pending;
  });
  stub(models.Classroom, "findByPk", async (id) => (
    Number(id) === graph.classroomId ? { id: graph.classroomId, teacherId: 5 } : null
  ));
  stub(models.ClassroomMembership, "findOne", async ({ where }) => store.memberships.find((row) => matches(row, where)) || null);
  stub(models.LessonAssessment, "findByPk", async (id, options = {}) => {
    if (options.include) store.graphReads += 1;
    return store.assessments.find((row) => row.id === Number(id)) || null;
  });
  stub(models.LessonAssessment, "findOne", async ({ where }) => store.assessments.find((row) => matches(row, where)) || null);
  stub(models.AssessmentAttempt, "findByPk", async (id) => persisted(store.attempts.find((row) => row.id === Number(id)), true));
  stub(models.AssessmentAttempt, "findOne", async ({ where }) => persisted(store.attempts.find((row) => matches(row, where)), true));
  stub(models.AssessmentAttempt, "findAll", async (options) => {
    store.siblingQueries.push(options);
    return store.attempts.filter((row) => matches(row, options.where)).map((row) => persisted(row, true));
  });
  stub(models.AssessmentAttempt, "create", async (values) => {
    const row = persisted({ id: store.attempts.length + 1, ...values }, true);
    store.attempts.push(row);
    return row;
  });
  stub(models.AssessmentResponse, "findOne", async ({ where }) => persisted(store.responses.find((row) => matches(row, where))));
  stub(models.AssessmentResponse, "findAll", async ({ where }) => {
    store.responseReads += 1;
    return store.responses.filter((row) => matches(row, where)).map((row) => persisted(row));
  });
  stub(models.AssessmentResponse, "create", async (values) => {
    const row = persisted({ id: store.responses.length + 1, ...values });
    store.responses.push(row);
    return row;
  });
  stub(models.AssessmentQuestion, "findAll", async ({ where }) => {
    store.graphReads += 1;
    return store.assessments.find((row) => row.id === where.assessmentId)?.questions || [];
  });
  const call = (path, options = {}) => request(`/api/assessments${path}`, { authToken: token(42), ...options });
  const start = () => call(`/${graph.id}/attempts`, { method: "POST", body: {} });
  const save = (id, choice = 1001) => call(`/attempts/${id}/responses/101`, { method: "PUT", body: { selectedChoiceId: choice } });
  const submit = (id, key = `submit_key_${id}`) => call(`/attempts/${id}/submit`, { method: "POST", headers: { "Idempotency-Key": key } });
  const teacherGrant = () => request(
    `/api/teacher/classrooms/${graph.classroomId}/assessments/${graph.id}/students/42/additional-attempt`,
    { authToken: token(5, "teacher"), method: "POST" },
  );
  const seedActive = () => {
    const row = {
      id: store.attempts.length + 1,
      assessmentId: graph.id,
      classroomId: graph.classroomId,
      studentId: 42,
      attemptNumber: 1,
      status: "IN_PROGRESS",
      assessmentVersion: graph.version,
      startedAt: new Date("2026-09-24T00:00:00.000Z"),
      submittedAt: null,
      questionOrder: graph.questions.map((question) => question.id),
      choiceOrder: Object.fromEntries(graph.questions.map((question) => [
        question.id,
        question.choices.map((choice) => choice.id),
      ])),
    };
    store.attempts.push(row);
    return row;
  };
  const completed = async (choice = 1001) => {
    const begun = await start();
    assert.equal(begun.response.status, 201);
    const id = begun.payload.attempt.attemptId;
    assert.equal((await save(id, choice)).response.status, 200);
    const result = await submit(id);
    assert.equal(result.response.status, 200);
    return { id, ...result };
  };
  return { graph, store, call, start, save, submit, teacherGrant, seedActive, completed };
};

test("start returns 201 and resume returns 200 with the same attempt and order", async () => {
  const h = mutationHarness();
  const started = await h.start();
  assert.equal(started.response.status, 201);
  assert.equal(started.payload.attempt.resumed, false);
  assert.equal(started.payload.attempt.attemptsUsed, 0);
  assert.equal(started.payload.attempt.attemptsRemaining, 2);
  assert.deepEqual(started.payload.attempt.responses, []);
  const resumed = await h.start();
  assert.equal(resumed.response.status, 200);
  assert.equal(resumed.payload.attempt.resumed, true);
  assert.equal(resumed.payload.attempt.attemptId, started.payload.attempt.attemptId);
  assert.deepEqual(resumed.payload.assessment, started.payload.assessment);
  assert.equal(h.store.attempts.length, 1);
  assertNoForbiddenKeys(started.payload);
  assertNoForbiddenKeys(resumed.payload);
});

test("autosave accepts one selectedChoiceId or null and returns no grading fields", async () => {
  const h = mutationHarness();
  const started = await h.start();
  assert.equal(started.response.status, 201);
  const id = started.payload.attempt.attemptId;
  for (const selectedChoiceId of [1001, null]) {
    const saved = await h.save(id, selectedChoiceId);
    assert.equal(saved.response.status, 200);
    assert.deepEqual(saved.payload, { response: { attemptId: id, questionId: 101, selectedChoiceId } });
    assert.equal(h.store.responses[0].selectedChoiceId, selectedChoiceId);
    const resumed = await h.start();
    assert.deepEqual(resumed.payload.attempt.responses, [{ questionId: 101, selectedChoiceId }]);
    assertNoForbiddenKeys(resumed.payload);
  }
  const foreignQuestion = await h.call(`/attempts/${id}/responses/999`, { method: "PUT", body: { selectedChoiceId: 1001 } });
  assert.equal(foreignQuestion.response.status, 400);
  assert.equal(foreignQuestion.payload.code, "INVALID_QUESTION");
  const foreignChoice = await h.save(id, 9999);
  assert.equal(foreignChoice.response.status, 400);
  assert.equal(foreignChoice.payload.code, "INVALID_CHOICE");
});

test("mutation bodies reject unknown and score-like fields", async () => {
  const h = mutationHarness();
  for (const field of ["studentId", "classroomId", "percentage", "passed", "isCorrect", "pointsEarned", "submissionKey"]) {
    for (const [path, method, body] of [
      ["/12/attempts", "POST", { [field]: 7 }],
      ["/attempts/1/submit", "POST", { [field]: 7 }],
      ["/attempts/1/responses/101", "PUT", { selectedChoiceId: 1001, [field]: 7 }],
    ]) {
      const result = await h.call(path, { method, body, headers: { "Idempotency-Key": "valid_key_123" } });
      assert.equal(result.response.status, 400, `${path}: ${field}`);
      assert.equal(result.payload.code, "INVALID_REQUEST");
    }
  }
  for (const body of [{}, [], { selectedChoiceId: "1001" }, { selectedChoiceId: true }, { selectedChoiceId: 0 }, { selectedChoiceId: 1.5 }]) {
    const result = await h.call("/attempts/1/responses/101", { method: "PUT", body });
    assert.equal(result.response.status, 400);
    assert.equal(result.payload.code, "INVALID_REQUEST");
  }
  for (const path of ["/12/attempts?studentId=99", "/attempts/1/submit?percentage=100", "/attempts/1/responses/101?isCorrect=true"]) {
    const result = await h.call(path, { method: path.includes("responses") ? "PUT" : "POST", body: path.includes("responses") ? { selectedChoiceId: 1001 } : {} });
    assert.equal(result.response.status, 400);
    assert.equal(result.payload.code, "INVALID_REQUEST");
  }
  assert.equal(h.store.attempts.length, 0);
});

test("submission requires one valid Idempotency-Key header", async () => {
  const h = mutationHarness();
  for (const key of [undefined, "", "short", "a".repeat(97), "invalid.key", "valid_key,other_key"]) {
    const result = await h.call("/attempts/1/submit", { method: "POST", headers: key === undefined ? {} : { "Idempotency-Key": key } });
    assert.equal(result.response.status, 400);
    assert.equal(result.payload.code, "INVALID_SUBMISSION_KEY");
  }
  const repeated = await new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}/api/assessments/attempts/1/submit`, {
      method: "POST", headers: ["Host", new URL(baseUrl).host, "Content-Length", "0", "Authorization", `Bearer ${token(42)}`, "Idempotency-Key", "valid_key_123", "idempotency-key", "valid_key_123"],
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, payload: JSON.parse(body) }); } catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(repeated.status, 400);
  assert.equal(repeated.payload.code, "INVALID_SUBMISSION_KEY");
});

test("mutation routes reject unparsed nonempty bodies instead of treating them as absent", async () => {
  const h = mutationHarness();
  for (const path of ["/12/attempts", "/attempts/1/submit"]) {
    const response = await fetch(`${baseUrl}/api/assessments${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token(42)}`, "Content-Type": "text/plain", "Idempotency-Key": "valid_key_123" },
      body: '{"percentage":100}',
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_REQUEST");
  }
  assert.equal(h.store.attempts.length, 0);
});

test("submission maps the header to Phase B submissionKey and returns the result envelope", async () => {
  const h = mutationHarness();
  const original = assessmentAttemptService.submitAttempt;
  let forwarded;
  stub(assessmentAttemptService, "submitAttempt", async (args) => { forwarded = args; return original(args); });
  const { id, payload } = await h.completed();
  assert.deepEqual(forwarded, { attemptId: id, studentId: 42, submissionKey: `submit_key_${id}` });
  assert.deepEqual(payload.result, { attemptId: id, type: "POST", status: "SUBMITTED", attemptNumber: 1,
    submittedAt: h.store.attempts[0].submittedAt.toISOString(), scoreVisible: true,
    pointsEarned: 2, maxPoints: 2, percentage: 100, passed: true });
  assert.deepEqual(payload.attempts, { used: 1, max: 3, remaining: 2 });
  assert.equal(payload.reviewAvailable, false);
  assert.equal("review" in payload, false);
  assertNoForbiddenKeys(payload);
});

test("same-key retry returns 200 with the immutable result", async () => {
  let progressionAllowed = true;
  const h = mutationHarness({}, {
    progressionGuard: async () => {
      if (!progressionAllowed) {
        throw new lessonProgressionService.LessonProgressionError({
          code: "POST_ASSESSMENT_LOCKED",
          message: "locked after submission",
          lessonKey: "arrays",
          nextAction: "PLAY_GAME",
        });
      }
      return { allowed: true, reason: null };
    },
  });
  const first = await h.completed();
  progressionAllowed = false;
  const retry = await h.submit(first.id);
  assert.equal(retry.response.status, 200);
  assert.deepEqual(retry.payload, first.payload);
  assert.equal(h.store.saves, 1);
  const saveAfter = await h.save(first.id, 1002);
  assert.equal(saveAfter.response.status, 409);
  assert.equal(saveAfter.payload.code, "ATTEMPT_ALREADY_SUBMITTED");
  assert.equal(h.store.responses[0].selectedChoiceId, 1001);
});

test("different-key retry and cross-attempt key reuse return distinct 409 codes", async () => {
  const h = mutationHarness();
  const first = await h.completed();
  const different = await h.submit(first.id, "different_key");
  assert.equal(different.response.status, 409);
  assert.equal(different.payload.code, "ATTEMPT_ALREADY_SUBMITTED");
  const next = await h.start();
  const reused = await h.submit(next.payload.attempt.attemptId, `submit_key_${first.id}`);
  assert.equal(reused.response.status, 409);
  assert.equal(reused.payload.code, "SUBMISSION_CONFLICT");
  assert.equal(h.store.saves, 1);
});

test("PRE result is diagnostic and omits passed", async () => {
  const h = mutationHarness({ type: "PRE", maxAttempts: 1, passingPercentage: null,
    gradeCalculation: "FIRST", requirePassingForCompletion: false, answerReviewPolicy: "NEVER" });
  const { payload } = await h.completed();
  assert.equal(payload.result.type, "PRE");
  assert.equal(payload.result.diagnosticCompleted, true);
  assert.equal("passed" in payload.result, false);
  assert.equal("officialGrade" in payload, false);
  assert.deepEqual(payload.attempts, { used: 1, max: 1, remaining: 0 });
  assertNoForbiddenKeys(payload);
  const exhausted = await h.start();
  assert.equal(exhausted.response.status, 409);
  assert.equal(exhausted.payload.code, "MAX_ATTEMPTS_REACHED");
});

test("POST result marks highest official attempt and computes gain from first POST", async () => {
  const h = mutationHarness();
  h.store.assessments.push(assessment({ id: 11, type: "PRE" }));
  h.store.attempts.push({ id: 50, assessmentId: 11, classroomId: 7, studentId: 42, status: "SUBMITTED", attemptNumber: 1, percentage: 40 });
  const first = await h.completed(1002);
  const second = await h.completed(1001);
  assert.deepEqual(second.payload.officialGrade, { attemptId: second.id, attemptNumber: 2, percentage: 100, submittedAt: h.store.attempts[2].submittedAt.toISOString() });
  assert.deepEqual(second.payload.firstPost, { attemptId: first.id, attemptNumber: 1, percentage: 0 });
  assert.equal(second.payload.prePercentage, 40);
  assert.deepEqual(second.payload.learningGain, { value: -40, unit: "percentage points", label: "-40 percentage points", prePercentage: 40, firstPostPercentage: 0 });
  const fetched = await h.call(`/attempts/${first.id}/result`);
  assert.equal(fetched.payload.result.attemptId, first.id);
  assert.deepEqual(fetched.payload.officialGrade, second.payload.officialGrade);
  const third = await h.completed(1001);
  assert.equal(third.payload.officialGrade.attemptId, second.id);
  assert.equal(third.payload.reviewAvailable, true);
  const fourth = await h.start();
  assert.equal(fourth.response.status, 409);
  assert.equal(fourth.payload.code, "MAX_ATTEMPTS_REACHED");
});

test("hidden PRE score stays private through visible POST submission and result retrieval", async () => {
  const h = mutationHarness();
  h.store.assessments.push(assessment({ id: 11, type: "PRE", maxAttempts: 1,
    showScoreAfterSubmission: false, answerReviewPolicy: "NEVER" }));
  h.store.attempts.push({ id: 50, assessmentId: 11, classroomId: 7, studentId: 42,
    status: "SUBMITTED", attemptNumber: 1, percentage: 40, pointsEarned: 4, maxPoints: 10 });
  const pre = await h.call("/attempts/50/result");
  assert.equal(pre.response.status, 200);
  assert.equal(pre.payload.result.scoreVisible, false);
  for (const key of ["percentage", "pointsEarned", "maxPoints"]) {
    assert.equal(key in pre.payload.result, false);
  }
  const submitted = await h.completed();
  const fetched = await h.call(`/attempts/${submitted.id}/result`);
  assert.equal(fetched.response.status, 200);
  for (const payload of [submitted.payload, fetched.payload]) {
    assert.equal(payload.result.scoreVisible, true);
    assert.equal(payload.result.percentage, 100);
    assert.equal(payload.officialGrade.percentage, 100);
    assert.equal(payload.firstPost.percentage, 100);
    assert.equal("prePercentage" in payload, false);
    assert.equal("learningGain" in payload, false);
    assertNoForbiddenKeys(payload);
  }
});

test("hidden-score POST keeps passed and omits every score and comparison field", async () => {
  const h = mutationHarness({ showScoreAfterSubmission: false });
  h.store.assessments.push(assessment({ id: 11, type: "PRE" }));
  h.store.attempts.push({ id: 50, assessmentId: 11, classroomId: 7, studentId: 42, status: "SUBMITTED", attemptNumber: 1, percentage: 40 });
  const submitted = await h.completed();
  const fetched = await h.call(`/attempts/${submitted.id}/result`);
  for (const payload of [submitted.payload, fetched.payload]) {
    assert.equal(payload.result.scoreVisible, false);
    assert.equal(payload.result.passed, true);
    for (const key of ["pointsEarned", "maxPoints", "percentage", "correctCount", "questionCount"]) assert.equal(key in payload.result, false);
    for (const key of ["officialGrade", "firstPost", "prePercentage", "learningGain"]) assert.equal(key in payload, false);
    assertNoForbiddenKeys(payload);
  }
});

test("former classroom member cannot retrieve a submitted result or answer review", async () => {
  let progressionAllowed = true;
  const h = mutationHarness({ answerReviewPolicy: "AFTER_SUBMISSION" }, {
    progressionGuard: async () => {
      if (!progressionAllowed) {
        throw new lessonProgressionService.LessonProgressionError({
          code: "POST_ASSESSMENT_LOCKED",
          message: "locked after submission",
          lessonKey: "arrays",
          nextAction: "PLAY_GAME",
        });
      }
      return { allowed: true, reason: null };
    },
  });
  const submitted = await h.completed();
  assert.equal(submitted.payload.reviewAvailable, true);
  assert.equal(h.store.attempts.find(({ id }) => id === submitted.id).studentId, 42);
  progressionAllowed = false;
  h.store.memberships.splice(0);
  const { graphReads, responseReads } = h.store;
  for (const result of [await h.call(`/attempts/${submitted.id}/result`), await h.submit(submitted.id)]) {
    assert.equal(result.response.status, 403);
    assert.deepEqual(result.payload, { code: "FORBIDDEN", message: "Forbidden" });
  }
  assert.equal(h.store.graphReads, graphReads);
  assert.equal(h.store.responseReads, responseReads);
});

test("student cannot use a forged classroom body to override persisted attempt identity", async () => {
  const h = mutationHarness();
  const forgedStart = await h.call("/12/attempts", {
    method: "POST",
    body: { classroomId: 8 },
  });
  assert.equal(forgedStart.response.status, 400);
  assert.equal(forgedStart.payload.code, "INVALID_REQUEST");
  assert.equal(h.store.attempts.length, 0);

  const started = await h.start();
  const attemptId = started.payload.attempt.attemptId;
  const forgedSave = await h.call(`/attempts/${attemptId}/responses/101`, {
    method: "PUT",
    body: { selectedChoiceId: 1001, classroomId: 8 },
  });
  const forgedSubmit = await h.call(`/attempts/${attemptId}/submit`, {
    method: "POST",
    body: { classroomId: 8 },
    headers: { "Idempotency-Key": "forged_classroom" },
  });
  for (const result of [forgedSave, forgedSubmit]) {
    assert.equal(result.response.status, 400);
    assert.equal(result.payload.code, "INVALID_REQUEST");
  }
  assert.equal(h.store.attempts[0].classroomId, 7);
  assert.equal(h.store.responses.length, 0);
});

test("student cannot read another student's active selections or submitted result", async () => {
  const h = mutationHarness();
  const started = await h.start();
  const attemptId = started.payload.attempt.attemptId;
  await h.save(attemptId);

  const foreignActive = await h.call(`/attempts/${attemptId}`, {
    authToken: token(99),
  });
  assert.equal(foreignActive.response.status, 403);
  assert.deepEqual(foreignActive.payload, { code: "FORBIDDEN", message: "Forbidden" });

  await h.submit(attemptId);
  const foreignResult = await h.call(`/attempts/${attemptId}/result`, {
    authToken: token(99),
  });
  assert.equal(foreignResult.response.status, 403);
  assert.deepEqual(foreignResult.payload, { code: "FORBIDDEN", message: "Forbidden" });
  assert.equal(JSON.stringify(foreignActive.payload).includes("selectedChoiceId"), false);
  assert.equal(JSON.stringify(foreignResult.payload).includes("percentage"), false);
});

test("result denies foreign owners and in-progress attempts before reading review", async () => {
  const h = mutationHarness({ answerReviewPolicy: "AFTER_SUBMISSION" });
  const started = await h.start();
  assert.equal(started.response.status, 201);
  const id = started.payload.attempt.attemptId;
  const active = await h.call(`/attempts/${id}/result`);
  assert.equal(active.response.status, 409);
  assert.equal(active.payload.code, "ATTEMPT_IN_PROGRESS");
  await h.submit(id);
  const { graphReads, responseReads } = h.store;
  const foreign = await h.call(`/attempts/${id}/result`, { authToken: token(99) });
  assert.equal(foreign.response.status, 403);
  assert.equal(h.store.graphReads, graphReads);
  assert.equal(h.store.responseReads, responseReads);
});

test("NEVER answer review remains unavailable after exhaustion", async () => {
  assert.equal(canExposeAnswerReview({ assessment: { answerReviewPolicy: "NEVER", maxAttempts: 1 }, submittedAttempts: [{ id: 1 }], activeAttempt: null }), false);
  const h = mutationHarness({ answerReviewPolicy: "NEVER", maxAttempts: 1 });
  const submitted = await h.completed();
  const { graphReads, responseReads } = h.store;
  const fetched = await h.call(`/attempts/${submitted.id}/result`);
  assert.equal(fetched.payload.reviewAvailable, false);
  assert.equal("review" in fetched.payload, false);
  assert.equal(h.store.graphReads, graphReads);
  assert.equal(h.store.responseReads, responseReads);
  assertNoForbiddenKeys(fetched.payload);
});

test("AFTER_SUBMISSION answer review joins persisted responses and answer choices", async () => {
  assert.equal(canExposeAnswerReview({ assessment: { answerReviewPolicy: "AFTER_SUBMISSION", maxAttempts: 3 }, submittedAttempts: [{ id: 1 }], activeAttempt: null }), true);
  const h = mutationHarness({ answerReviewPolicy: "AFTER_SUBMISSION" });
  const submitted = await h.completed();
  assert.equal(submitted.payload.reviewAvailable, true);
  assert.deepEqual(submitted.payload.review, [{ questionId: 101, selectedChoiceId: 1001,
    correctChoiceId: 1001, isCorrect: true, pointsAwarded: 2, explanation: "Arrays use brackets." }]);
});

test("AFTER_FINAL_ATTEMPT requires exhaustion and no active attempt", async () => {
  const settings = { answerReviewPolicy: "AFTER_FINAL_ATTEMPT", maxAttempts: 3 };
  const activeAttempt = { id: 4, status: "IN_PROGRESS" };
  assert.equal(canExposeAnswerReview({ assessment: settings, submittedAttempts: [{ id: 1 }], activeAttempt: null }), false);
  assert.equal(canExposeAnswerReview({ assessment: settings, submittedAttempts: [{ id: 1 }, { id: 2 }, { id: 3 }], activeAttempt }), false);
  assert.equal(canExposeAnswerReview({ assessment: settings, submittedAttempts: [{ id: 1 }, { id: 2 }, { id: 3 }], activeAttempt: null }), true);
  const h = mutationHarness();
  const first = await h.completed();
  const latest = await h.call(`/attempts/${first.id}/result`);
  assert.equal(latest.payload.reviewAvailable, false);
  assert.equal("review" in latest.payload, false);
  assertNoForbiddenKeys(latest.payload);
  await h.completed();
  const final = await h.completed();
  assert.equal(final.payload.reviewAvailable, true);
  h.store.attempts.push({ id: 99, assessmentId: 12, classroomId: 7, studentId: 42, status: "IN_PROGRESS", attemptNumber: 4 });
  const active = await h.call(`/attempts/${final.id}/result`);
  assert.equal(active.payload.reviewAvailable, false);
  assert.equal("review" in active.payload, false);
});

test("teacher recovery uses the normal student pipeline and recalculates final-attempt review", async () => {
  const h = mutationHarness();
  const originalMaxAttempts = h.graph.maxAttempts;
  const ordinary = [];
  for (let index = 0; index < 3; index += 1) ordinary.push(await h.completed(1002));
  assert.equal(ordinary[2].payload.reviewAvailable, true);

  const granted = await h.teacherGrant();
  assert.equal(granted.response.status, 201);
  assert.deepEqual(Object.keys(granted.payload), ["attempt"]);
  assert.equal(granted.payload.attempt.attemptNumber, 4);
  assert.equal(granted.payload.attempt.status, "IN_PROGRESS");
  assert.equal(h.graph.maxAttempts, originalMaxAttempts);
  const hiddenDuringRecovery = await h.call(`/attempts/${ordinary[2].id}/result`);
  assert.equal(hiddenDuringRecovery.payload.reviewAvailable, false);

  const resumed = await h.start();
  assert.equal(resumed.response.status, 200);
  assert.equal(resumed.payload.attempt.resumed, true);
  assert.equal(resumed.payload.attempt.attemptId, granted.payload.attempt.id);
  assert.equal(resumed.payload.attempt.attemptsRemaining, 0);
  assert.equal((await h.save(granted.payload.attempt.id, 1002)).response.status, 200);
  const failedRecovery = await h.submit(granted.payload.attempt.id, "recovery_fail_key");
  assert.equal(failedRecovery.response.status, 200);
  assert.equal(failedRecovery.payload.result.passed, false);
  assert.equal(failedRecovery.payload.reviewAvailable, true);

  const concurrentGrants = await Promise.all([h.teacherGrant(), h.teacherGrant()]);
  assert.deepEqual(concurrentGrants.map((result) => result.response.status).sort(), [201, 409]);
  assert.equal(concurrentGrants.find((result) => result.response.status === 409).payload.code,
    "ACTIVE_ATTEMPT_EXISTS");
  const recovery = concurrentGrants.find((result) => result.response.status === 201).payload.attempt;
  assert.equal(recovery.attemptNumber, 5);
  assert.equal(h.store.attempts.filter((row) => row.status === "IN_PROGRESS").length, 1);
  assert.equal((await h.save(recovery.id, 1001)).response.status, 200);
  const passedRecovery = await h.submit(recovery.id, "recovery_pass_key");
  assert.equal(passedRecovery.payload.result.passed, true);
  assert.equal(passedRecovery.payload.officialGrade.attemptId, recovery.id);
  assert.equal(passedRecovery.payload.reviewAvailable, true);
  const retry = await h.submit(recovery.id, "recovery_pass_key");
  assert.deepEqual(retry.payload, passedRecovery.payload);
  assert.equal(h.graph.maxAttempts, originalMaxAttempts);
});

test("teacher recovery and ordinary student start serialize to at most one active attempt", async () => {
  const h = mutationHarness();
  for (let index = 0; index < 3; index += 1) await h.completed(1002);
  const results = await Promise.all([h.teacherGrant(), h.start()]);
  assert.equal(results.some((result) => result.response.status === 201), true);
  assert.equal(h.store.attempts.filter((row) => row.status === "IN_PROGRESS").length, 1);
  const student = results[1];
  if (student.response.status === 200) assert.equal(student.payload.attempt.resumed, true);
  else assert.equal(student.payload.code, "MAX_ATTEMPTS_REACHED");
});

test("concurrent same-key submissions persist one immutable result", async () => {
  const h = mutationHarness();
  const started = await h.start();
  assert.equal(started.response.status, 201);
  const id = started.payload.attempt.attemptId;
  await h.save(id);
  const results = await Promise.all([h.submit(id), h.submit(id)]);
  assert.deepEqual(results.map((result) => result.response.status), [200, 200]);
  assert.deepEqual(results[0].payload, results[1].payload);
  assert.equal(h.store.saves, 1);
  assert.equal(h.store.responses.length, 1);
  assert.equal(h.store.attempts[0].percentage, 100);
});

test("concurrent different-key submissions return one result and one submitted conflict", async () => {
  const h = mutationHarness();
  const started = await h.start();
  assert.equal(started.response.status, 201);
  const id = started.payload.attempt.attemptId;
  await h.save(id);
  const results = await Promise.all([h.submit(id, "first_key"), h.submit(id, "second_key")]);
  assert.deepEqual(results.map((result) => result.response.status).sort(), [200, 409]);
  assert.equal(results.find((result) => result.response.status === 409).payload.code, "ATTEMPT_ALREADY_SUBMITTED");
  assert.equal(h.store.saves, 1);
  assert.equal(h.store.responses.length, 1);
  assert.equal(h.store.attempts[0].percentage, 100);
});

const forbiddenKeys = new Set([
  "isCorrect",
  "correctChoiceId",
  "explanation",
  "passingPercentage",
  "gradeCalculation",
  "answerReviewPolicy",
  "createdBy",
]);

const assertNoForbiddenKeys = (value) => {
  if (Array.isArray(value)) {
    value.forEach(assertNoForbiddenKeys);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbiddenKeys.has(key), false, `student payload exposed ${key}`);
    assertNoForbiddenKeys(child);
  }
};

const assertNoKeys = (value, keys, path = "payload") => {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoKeys(child, keys, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(keys.has(key), false, `${path}.${key} must not be exposed`);
    assertNoKeys(child, keys, `${path}.${key}`);
  }
};

before(async () => {
  server = await new Promise((resolve) => {
    const listener = productionApp.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => {
  while (restorations.length) {
    const [target, property, original] = restorations.pop();
    target[property] = original;
  }
});

after(() => new Promise((resolve, reject) => {
  if (!server) return resolve();
  return server.close((error) => (error ? reject(error) : resolve()));
}));

test("production app maps malformed student assessment JSON to the safe 400 contract", async () => {
  const response = await fetch(`${baseUrl}/api/assessments/12/attempts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token(42)}`,
      "Content-Type": "application/json",
    },
    body: '{"classroomId":',
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    code: "INVALID_REQUEST",
    message: "Malformed JSON request body",
  });
});

test("student assessment routes require authentication and student role", async () => {
  const unauthenticated = await request("/api/assessments/classrooms/7/lessons/arrays/PRE");
  assert.equal(unauthenticated.response.status, 401);

  stub(User, "findByPk", async () => activeUser(5, "teacher"));
  const wrongRole = await request(
    "/api/assessments/classrooms/7/lessons/arrays/PRE",
    { authToken: token(5, "teacher") },
  );
  assert.equal(wrongRole.response.status, 403);
  assert.equal(wrongRole.payload.message, "You are not allowed to access this resource");
});

test("discovery requires membership in the exact classroom", async () => {
  stub(User, "findByPk", async () => activeUser(42));
  let membershipWhere;
  stub(models.ClassroomMembership, "findOne", async (options) => {
    membershipWhere = options.where;
    return null;
  });
  stub(models.LessonAssessment, "findOne", async () => {
    assert.fail("assessment lookup ran before classroom authorization");
  });
  stub(models.AssessmentAttempt, "findAll", async () => {
    assert.fail("attempt lookup ran before classroom authorization");
  });

  const { response, payload } = await request(
    "/api/assessments/classrooms/7/lessons/tutorial/POST",
    { authToken: token(42) },
  );

  assert.equal(response.status, 403);
  assert.deepEqual(payload, { code: "FORBIDDEN", message: "Forbidden" });
  assert.deepEqual(membershipWhere, { classroomId: 7, studentId: 42, status: "active" });
});

test("discovery returns unavailable assessment state without a graph", async () => {
  stub(User, "findByPk", async () => activeUser(42));
  stub(models.ClassroomMembership, "findOne", async () => ({ id: 1 }));
  stub(models.LessonAssessment, "findOne", async () => null);
  stub(lessonProgressionService, "getLessonProgressionState", async () => {
    assert.fail("unavailable assessments must not become progression resources");
  });
  stub(models.AssessmentAttempt, "findAll", async () => {
    assert.fail("attempts must not be queried without an assessment");
  });

  const { response, payload } = await request(
    "/api/assessments/classrooms/7/lessons/arrays/pre",
    { authToken: token(42) },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    assessment: null,
    status: {
      available: false,
      lessonKey: "arrays",
      type: "PRE",
      attemptStatus: "NOT_AVAILABLE",
      attemptsUsed: 0,
      hasSubmittedAttempt: false,
      latestSubmittedAttemptId: null,
      diagnosticCompleted: false,
      unlocked: false,
      lockReason: null,
    },
  });
});

test("discovery returns a null submitted attempt ID while only an active attempt exists", async () => {
  stub(User, "findByPk", async () => activeUser(42));
  stub(models.ClassroomMembership, "findOne", async () => ({
    id: 1, classroomId: 7, studentId: 42, status: "active",
  }));
  stub(models.LessonAssessment, "findOne", async () => assessment());
  stub(models.AssessmentAttempt, "findAll", async ({ where }) => {
    assert.deepEqual(where, { assessmentId: 12, studentId: 42 });
    return [{ id: 31, attemptNumber: 1, status: "IN_PROGRESS" }];
  });
  stub(lessonProgressionService, "getLessonProgressionState", async () => ({
    curriculumPrerequisiteSatisfied: true,
    gameCompleted: true,
    postUnlocked: true,
  }));

  const { response, payload } = await request(
    "/api/assessments/classrooms/7/lessons/arrays/POST",
    { authToken: token(42) },
  );

  assert.equal(response.status, 200);
  assert.equal(payload.status.activeAttemptId, 31);
  assert.equal(payload.status.hasSubmittedAttempt, false);
  assert.equal(payload.status.latestSubmittedAttemptId, null);
});

test("discovery returns hasSubmittedAttempt and PRE diagnosticCompleted without lesson completion fields", async () => {
  stub(User, "findByPk", async () => activeUser(42));
  stub(models.ClassroomMembership, "findOne", async () => ({ id: 1 }));
  stub(models.LessonAssessment, "findOne", async () => assessment({
    id: 11,
    type: "PRE",
    title: "Arrays diagnostic",
    maxAttempts: 1,
    passingPercentage: null,
    gradeCalculation: "FIRST",
    answerReviewPolicy: "NEVER",
  }));
  stub(models.AssessmentAttempt, "findAll", async () => [{
    id: 20,
    assessmentId: 11,
    studentId: 42,
    attemptNumber: 1,
    status: "SUBMITTED",
    percentage: 55,
    passed: null,
    submittedAt: "2026-09-25T12:00:00.000Z",
  }]);
  stub(lessonProgressionService, "getLessonProgressionState", async () => ({
    curriculumPrerequisiteSatisfied: true,
    preUnlocked: true,
  }));

  const { response, payload } = await request(
    "/api/assessments/classrooms/7/lessons/arrays/PRE",
    { authToken: token(42) },
  );

  assert.equal(response.status, 200);
  assert.equal(payload.status.hasSubmittedAttempt, true);
  assert.equal(payload.status.diagnosticCompleted, true);
  assert.equal(payload.status.latestSubmittedAttemptId, 20);
  assert.equal(payload.status.unlocked, true);
  assert.equal(payload.status.lockReason, null);
  assert.equal("completed" in payload.status, false);
  assert.equal("lessonCompleted" in payload.status, false);
  assert.equal("passed" in payload.status, false);
  assert.equal("officialPost" in payload.status, false);
});

test("discovery never exposes questions choices or grading configuration", async () => {
  stub(User, "findByPk", async () => activeUser(42));
  stub(models.ClassroomMembership, "findOne", async () => ({ id: 1 }));
  stub(models.LessonAssessment, "findOne", async () => assessment());
  stub(models.AssessmentAttempt, "findAll", async (options) => {
    assert.deepEqual(options.where, { assessmentId: 12, studentId: 42 });
    return [
      {
        id: 30,
        attemptNumber: 1,
        status: "SUBMITTED",
        percentage: 70,
        passed: false,
        submittedAt: "2026-09-25T12:00:00.000Z",
      },
      {
        id: 32,
        attemptNumber: 3,
        status: "SUBMITTED",
        percentage: 80,
        passed: true,
        submittedAt: "2026-09-26T12:00:00.000Z",
      },
      { id: 31, attemptNumber: 4, status: "IN_PROGRESS" },
    ];
  });
  stub(lessonProgressionService, "getLessonProgressionState", async () => ({
    curriculumPrerequisiteSatisfied: true,
    preRequired: false,
    preCompleted: false,
    gameCompleted: true,
    postUnlocked: true,
    postPassed: false,
  }));

  const { response, payload } = await request(
    "/api/assessments/classrooms/7/lessons/arrays/post",
    { authToken: token(42) },
  );

  assert.equal(response.status, 200);
  assert.equal(payload.status.hasSubmittedAttempt, true);
  assert.equal("completed" in payload.status, false);
  assert.equal("lessonCompleted" in payload.status, false);
  assert.equal("questions" in payload.assessment, false);
  assert.equal("choices" in payload.assessment, false);
  assert.equal(payload.status.attemptStatus, "IN_PROGRESS");
  assert.equal(payload.status.activeAttemptId, 31);
  assert.equal(payload.status.latestSubmittedAttemptId, 32);
  assert.equal(payload.status.attemptsUsed, 2);
  assert.equal(payload.status.attemptsRemaining, 1);
  assert.equal(payload.status.unlocked, true);
  assert.equal(payload.status.lockReason, null);
  assert.deepEqual(payload.status.officialPost, { attemptNumber: 3, percentage: 80 });
  assertNoForbiddenKeys(payload);
});

test("discovery reports exact progression stage without exposing a graph or hidden numeric results", async () => {
  stub(User, "findByPk", async () => activeUser(42));
  stub(models.ClassroomMembership, "findOne", async () => ({
    id: 1, classroomId: 7, studentId: 42, status: "active",
  }));
  let graph = assessment({ showScoreAfterSubmission: false });
  let state = {
    curriculumPrerequisiteSatisfied: true,
    preRequired: false,
    preCompleted: false,
    gameCompleted: false,
    postUnlocked: false,
    postPassed: true,
  };
  let stateReads = 0;
  stub(models.LessonAssessment, "findOne", async ({ where }) => (
    graph && graph.isPublished === true
      && graph.lessonKey === where.lessonKey && graph.type === where.type ? graph : null
  ));
  stub(models.AssessmentAttempt, "findAll", async () => [{
    id: 30,
    assessmentId: 12,
    studentId: 42,
    attemptNumber: 1,
    status: "SUBMITTED",
    pointsEarned: 2,
    maxPoints: 2,
    percentage: 100,
    passed: true,
    submittedAt: "2026-09-25T12:00:00.000Z",
  }]);
  stub(lessonProgressionService, "getLessonProgressionState", async (options) => {
    stateReads += 1;
    assert.equal(options.classroomId, 7);
    assert.equal(options.studentId, 42);
    assert.equal(options.lessonKey, graph.lessonKey);
    assert.equal(options.authorizedMembership.classroomId, 7);
    return state;
  });

  const lockedPost = await request(
    "/api/assessments/classrooms/7/lessons/arrays/POST",
    { authToken: token(42) },
  );
  assert.equal(lockedPost.response.status, 200);
  assert.equal(lockedPost.payload.status.available, true);
  assert.equal(lockedPost.payload.status.unlocked, false);
  assert.equal(lockedPost.payload.status.lockReason, "GAME_INCOMPLETE");
  assert.equal(lockedPost.payload.status.latestSubmittedAttemptId, 30);
  assert.equal("questions" in lockedPost.payload.assessment, false);
  for (const key of ["postPassed", "pointsEarned", "maxPoints", "percentage"]) {
    assert.equal(key in lockedPost.payload.status, false);
  }
  assertNoKeys(lockedPost.payload, new Set([
    "isCorrect", "correctChoiceId", "pointsAwarded", "correctAnswer", "answerKey",
    "explanation", "pointsEarned", "maxPoints", "percentage", "passingPercentage",
    "latestSubmitted", "officialPost",
  ]));

  graph = assessment({
    id: 13,
    lessonKey: "functions",
    type: "PRE",
    maxAttempts: 1,
    showScoreAfterSubmission: false,
  });
  state = {
    curriculumPrerequisiteSatisfied: false,
    preUnlocked: false,
  };
  const lockedPre = await request(
    "/api/assessments/classrooms/7/lessons/functions/PRE",
    { authToken: token(42) },
  );
  assert.equal(lockedPre.payload.status.available, true);
  assert.equal(lockedPre.payload.status.unlocked, false);
  assert.equal(lockedPre.payload.status.lockReason, "LESSON_PREREQUISITE_REQUIRED");

  state = { curriculumPrerequisiteSatisfied: true, preUnlocked: true };
  const unlockedPre = await request(
    "/api/assessments/classrooms/7/lessons/functions/PRE",
    { authToken: token(42) },
  );
  assert.equal(unlockedPre.payload.status.unlocked, true);
  assert.equal(unlockedPre.payload.status.lockReason, null);

  graph = assessment({ id: 14, lessonKey: "functions", type: "PRE", isPublished: false });
  const unavailableDraft = await request(
    "/api/assessments/classrooms/7/lessons/functions/PRE",
    { authToken: token(42) },
  );
  assert.equal(unavailableDraft.payload.status.available, false);
  assert.equal(unavailableDraft.payload.status.unlocked, false);
  assert.equal(unavailableDraft.payload.status.lockReason, null);
  assert.equal(unavailableDraft.payload.assessment, null);
  assert.equal(stateReads, 3);
});

test("discovery submitted-attempt ID supports authorized result revisit without weakening policy", async () => {
  const h = mutationHarness({
    showScoreAfterSubmission: false,
    answerReviewPolicy: "AFTER_SUBMISSION",
  });
  const submitted = await h.completed();
  const discovery = await h.call("/classrooms/7/lessons/arrays/POST");

  assert.equal(discovery.response.status, 200);
  assert.equal(discovery.payload.status.latestSubmittedAttemptId, submitted.id);
  assertNoKeys(discovery.payload, new Set([
    "isCorrect", "correctChoiceId", "pointsAwarded", "correctAnswer", "answerKey",
    "explanation", "pointsEarned", "maxPoints", "percentage", "passingPercentage",
    "latestSubmitted", "officialPost",
  ]));

  const revisited = await h.call(
    `/attempts/${discovery.payload.status.latestSubmittedAttemptId}/result`,
  );
  assert.equal(revisited.response.status, 200);
  assert.equal(revisited.payload.result.attemptId, submitted.id);
  assert.equal(revisited.payload.result.scoreVisible, false);
  assert.equal(revisited.payload.result.passed, true);
  assert.equal(revisited.payload.reviewAvailable, true);
  assert.deepEqual(revisited.payload.review, [{
    questionId: 101,
    selectedChoiceId: 1001,
  }]);
  assertNoKeys(revisited.payload.review, new Set([
    "correctChoiceId", "isCorrect", "pointsAwarded", "explanation",
  ]));
  for (const key of ["pointsEarned", "maxPoints", "percentage"]) {
    assert.equal(key in revisited.payload.result, false);
  }
  for (const key of ["officialGrade", "firstPost", "prePercentage", "learningGain"]) {
    assert.equal(key in revisited.payload, false);
  }

  const foreign = await h.call(`/attempts/${submitted.id}/result`, {
    authToken: token(99),
  });
  assert.equal(foreign.response.status, 403);
  assert.deepEqual(foreign.payload, { code: "FORBIDDEN", message: "Forbidden" });

  h.store.memberships.splice(0);
  const formerMember = await h.call(`/attempts/${submitted.id}/result`);
  assert.equal(formerMember.response.status, 403);
  assert.deepEqual(formerMember.payload, { code: "FORBIDDEN", message: "Forbidden" });
});

test("published player graph is available only to an exact classroom member", async () => {
  stub(User, "findByPk", async () => activeUser(42));
  stub(models.LessonAssessment, "findByPk", async () => assessment());
  let isMember = false;
  const membershipQueries = [];
  stub(models.ClassroomMembership, "findOne", async (options) => {
    membershipQueries.push(options.where);
    return isMember ? { id: 1 } : null;
  });
  stub(lessonProgressionService, "assertAssessmentInteractionAllowed", async () => ({
    allowed: true, reason: null,
  }));

  const denied = await request("/api/assessments/12", { authToken: token(42) });
  assert.equal(denied.response.status, 403);

  isMember = true;
  const allowed = await request("/api/assessments/12", { authToken: token(42) });
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.payload.assessment.id, 12);
  assert.deepEqual(allowed.payload.assessment.questions[0].choices, [
    { id: 1001, choiceText: "int[] values" },
    { id: 1002, choiceText: "int values[]()" },
  ]);
  assert.deepEqual(membershipQueries, [
    { classroomId: 7, studentId: 42, status: "active" },
    { classroomId: 7, studentId: 42, status: "active" },
  ]);
  assertNoForbiddenKeys(allowed.payload);
});

test("player graph cannot bypass POST or PRE stage gates while standalone lessons remain compatible", async () => {
  stub(User, "findByPk", async () => activeUser(42));
  let graph = assessment();
  let membershipChecked = false;
  stub(models.LessonAssessment, "findByPk", async () => graph);
  stub(models.ClassroomMembership, "findOne", async () => {
    membershipChecked = true;
    return { id: 1, classroomId: 7, studentId: 42, status: "active" };
  });
  stub(lessonProgressionService, "assertAssessmentInteractionAllowed", async ({
    assessment: guarded,
    authorizedMembership,
  }) => {
    assert.equal(membershipChecked, true);
    assert.equal(authorizedMembership.classroomId, guarded.classroomId);
    if (guarded.lessonKey === "arrays" && guarded.type === "POST") {
      throw new lessonProgressionService.LessonProgressionError({
        code: "POST_ASSESSMENT_LOCKED",
        message: "private message",
        lessonKey: "arrays",
        nextAction: "PLAY_GAME",
      });
    }
    if (guarded.lessonKey === "functions" && guarded.type === "PRE") {
      throw new lessonProgressionService.LessonProgressionError({
        code: "LESSON_PREREQUISITE_REQUIRED",
        message: "private message",
        lessonKey: "functions",
        prerequisiteLessonKey: "arrays",
        nextAction: "COMPLETE_PREREQUISITE_LESSON",
      });
    }
    return { allowed: true, reason: null };
  });

  const postDenied = await request("/api/assessments/12", { authToken: token(42) });
  assert.equal(postDenied.response.status, 403);
  assert.deepEqual(postDenied.payload, {
    code: "POST_ASSESSMENT_LOCKED",
    message: "Complete the lesson game progression before opening the post-test.",
    lessonKey: "arrays",
    nextAction: "PLAY_GAME",
  });
  assert.equal("assessment" in postDenied.payload, false);

  membershipChecked = false;
  graph = assessment({ id: 13, lessonKey: "functions", type: "PRE" });
  const preDenied = await request("/api/assessments/13", { authToken: token(42) });
  assert.equal(preDenied.response.status, 403);
  assert.equal(preDenied.payload.code, "LESSON_PREREQUISITE_REQUIRED");
  assert.equal("assessment" in preDenied.payload, false);

  for (const lessonKey of ["tutorial", "final"]) {
    membershipChecked = false;
    graph = assessment({ id: lessonKey === "tutorial" ? 14 : 15, lessonKey });
    const allowed = await request(`/api/assessments/${graph.id}`, { authToken: token(42) });
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.payload.assessment.lessonKey, lessonKey);
  }
});

test("attempt start cannot bypass POST or PRE stage gates and creates no attempt", async () => {
  const scenarios = [
    {
      assessment: { type: "POST" },
      error: new lessonProgressionService.LessonProgressionError({
        code: "POST_ASSESSMENT_LOCKED",
        message: "private message",
        lessonKey: "arrays",
        nextAction: "PLAY_GAME",
      }),
    },
    {
      assessment: {
        type: "PRE",
        lessonKey: "functions",
        maxAttempts: 1,
        passingPercentage: null,
        gradeCalculation: "FIRST",
        requirePassingForCompletion: false,
        answerReviewPolicy: "NEVER",
      },
      error: new lessonProgressionService.LessonProgressionError({
        code: "LESSON_PREREQUISITE_REQUIRED",
        message: "private message",
        lessonKey: "functions",
        prerequisiteLessonKey: "arrays",
        nextAction: "COMPLETE_PREREQUISITE_LESSON",
      }),
    },
  ];

  for (const scenario of scenarios) {
    const h = mutationHarness(scenario.assessment, {
      progressionGuard: async ({ authorizedMembership, transaction }) => {
        assert.equal(authorizedMembership.studentId, 42);
        assert.equal(transaction.LOCK.UPDATE, "UPDATE");
        throw scenario.error;
      },
    });
    const denied = await h.start();
    assert.equal(denied.response.status, 403);
    assert.equal(denied.payload.code, scenario.error.code);
    assert.equal(h.store.attempts.length, 0);
    assert.equal(h.store.siblingQueries.length, 0);
  }
});

for (const scenario of [
  { type: "POST", lessonKey: "arrays", code: "POST_ASSESSMENT_LOCKED" },
  {
    type: "PRE",
    lessonKey: "functions",
    maxAttempts: 1,
    passingPercentage: null,
    gradeCalculation: "FIRST",
    requirePassingForCompletion: false,
    answerReviewPolicy: "NEVER",
    code: "LESSON_PREREQUISITE_REQUIRED",
  },
]) {
  for (const interaction of ["get", "save", "submit"]) {
    test(`${scenario.type} active-attempt ${interaction} route denies before unlock without mutation`, async () => {
      let unlocked = false;
      const h = mutationHarness(scenario, {
        progressionGuard: async ({ assessment: guarded, authorizedMembership, transaction }) => {
          assert.equal(guarded.type, scenario.type);
          assert.equal(authorizedMembership.classroomId, 7);
          assert.equal(authorizedMembership.studentId, 42);
          assert.equal(transaction.LOCK.UPDATE, "UPDATE");
          if (!unlocked) {
            throw new lessonProgressionService.LessonProgressionError({
              code: scenario.code,
              message: "private progression details",
              lessonKey: scenario.lessonKey,
              prerequisiteLessonKey: scenario.type === "PRE" ? "arrays" : undefined,
              nextAction: scenario.type === "PRE"
                ? "COMPLETE_PREREQUISITE_LESSON"
                : "PLAY_GAME",
            });
          }
          return { allowed: true, reason: null };
        },
      });
      const seeded = h.seedActive();
      const beforeAttempt = structuredClone(seeded);
      const invoke = () => {
        if (interaction === "get") return h.call(`/attempts/${seeded.id}`);
        if (interaction === "save") return h.save(seeded.id);
        return h.submit(seeded.id, `${scenario.type.toLowerCase()}_locked_submit`);
      };

      const denied = await invoke();
      assert.equal(denied.response.status, 403);
      assert.equal(denied.payload.code, scenario.code);
      assert.equal(JSON.stringify(denied.payload).includes("private progression details"), false);
      assert.deepEqual(h.store.attempts[0], beforeAttempt);
      assert.deepEqual(h.store.responses, []);
      assert.equal(h.store.saves, 0);

      unlocked = true;
      const allowed = await invoke();
      assert.equal(allowed.response.status, 200);
      if (interaction === "get") {
        assert.equal(allowed.payload.attempt.status, "IN_PROGRESS");
      } else if (interaction === "save") {
        assert.equal(allowed.payload.response.selectedChoiceId, 1001);
        assert.equal(h.store.responses.length, 1);
      } else {
        assert.equal(allowed.payload.result.status, "SUBMITTED");
        assert.equal(h.store.attempts[0].submissionKey, `${scenario.type.toLowerCase()}_locked_submit`);
      }
    });
  }
}

test("unpublished and missing player graphs use safe 404 responses", async () => {
  stub(User, "findByPk", async () => activeUser(42));
  let graph = assessment({ isPublished: false });
  stub(models.LessonAssessment, "findByPk", async () => graph);
  stub(models.ClassroomMembership, "findOne", async () => ({ id: 1 }));

  const unpublished = await request("/api/assessments/12", { authToken: token(42) });
  assert.equal(unpublished.response.status, 404);
  assert.deepEqual(unpublished.payload, {
    code: "ASSESSMENT_NOT_PUBLISHED",
    message: "Assessment is not published",
  });

  graph = null;
  const missing = await request("/api/assessments/999", { authToken: token(42) });
  assert.equal(missing.response.status, 404);
  assert.deepEqual(missing.payload, {
    code: "ASSESSMENT_NOT_FOUND",
    message: "Assessment was not found",
  });
});

test("active-attempt GET returns stable order and safe saved selections", async () => {
  stub(User, "findByPk", async () => activeUser(42));
  stub(assessmentAttemptService, "getActiveAttempt", async ({ attemptId, studentId }) => {
    assert.equal(attemptId, 44);
    assert.equal(studentId, 42);
    const graph = assessment();
    graph.questions = [
      graph.questions[0],
      {
        id: 102,
        questionText: "What is Length?",
        questionType: "MULTIPLE_CHOICE",
        points: 1,
        objectiveKey: null,
        choices: [{ id: 2001, choiceText: "Element count" }],
      },
    ];
    return {
      resumed: true,
      assessment: graph,
      attempt: {
        id: 44,
        assessmentId: 12,
        classroomId: 7,
        attemptNumber: 2,
        status: "IN_PROGRESS",
        assessmentVersion: 3,
        startedAt: "2026-09-25T12:00:00.000Z",
      },
      responses: [
        { questionId: 102, selectedChoiceId: 2001 },
        { questionId: 101, selectedChoiceId: null },
      ],
    };
  });
  stub(models.LessonAssessment, "findByPk", async () => ({ maxAttempts: 3 }));

  const { response, payload } = await request(
    "/api/assessments/attempts/44",
    { authToken: token(42) },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    attempt: {
      attemptId: 44,
      attemptNumber: 2,
      assessmentVersion: 3,
      status: "IN_PROGRESS",
      startedAt: "2026-09-25T12:00:00.000Z",
      resumed: true,
      attemptsUsed: 1,
      attemptsRemaining: 1,
      responses: [
        { questionId: 102, selectedChoiceId: 2001 },
        { questionId: 101, selectedChoiceId: null },
      ],
    },
    assessment: {
      id: 12,
      lessonKey: "arrays",
      type: "POST",
      title: "Arrays post-test",
      instructions: "Choose one answer.",
      version: 3,
      questions: [{
        id: 101,
        questionText: "Which declaration is valid?",
        questionType: "MULTIPLE_CHOICE",
        points: 2,
        objectiveKey: "array-declaration",
        choices: [
          { id: 1001, choiceText: "int[] values" },
          { id: 1002, choiceText: "int values[]()" },
        ],
      }, {
        id: 102,
        questionText: "What is Length?",
        questionType: "MULTIPLE_CHOICE",
        points: 1,
        objectiveKey: null,
        choices: [{ id: 2001, choiceText: "Element count" }],
      }],
    },
  });
  assertNoForbiddenKeys(payload);
});

test("another student cannot read an active attempt", async () => {
  stub(User, "findByPk", async () => activeUser(99));
  stub(assessmentAttemptService, "getActiveAttempt", async ({ studentId }) => {
    if (studentId !== 42) {
      const error = new Error("Assessment attempt belongs to another student");
      error.code = "ATTEMPT_FORBIDDEN";
      throw error;
    }
    return null;
  });

  const { response, payload } = await request(
    "/api/assessments/attempts/44",
    { authToken: token(99) },
  );

  assert.equal(response.status, 403);
  assert.deepEqual(payload, { code: "FORBIDDEN", message: "Forbidden" });
});

test("student read routes reject malformed identifiers types and lesson keys", async () => {
  stub(User, "findByPk", async () => activeUser(42));
  stub(models.ClassroomMembership, "findOne", async () => ({ id: 1 }));

  for (const path of [
    "/api/assessments/12junk",
    "/api/assessments/attempts/0",
    "/api/assessments/classrooms/7junk/lessons/arrays/PRE",
  ]) {
    const { response, payload } = await request(path, { authToken: token(42) });
    assert.equal(response.status, 400);
    assert.equal(payload.code, "INVALID_REQUEST");
  }

  const invalidType = await request(
    "/api/assessments/classrooms/7/lessons/arrays/mid",
    { authToken: token(42) },
  );
  assert.equal(invalidType.response.status, 400);
  assert.equal(invalidType.payload.code, "INVALID_ASSESSMENT_TYPE");

  const invalidLesson = await request(
    "/api/assessments/classrooms/7/lessons/tutorial/PRE",
    { authToken: token(42) },
  );
  assert.equal(invalidLesson.response.status, 400);
  assert.equal(invalidLesson.payload.code, "INVALID_LESSON_KEY");
});

test("authorization primitives enforce teacher ownership admin scope and assessment classroom identity", async () => {
  const calls = { assessment: [] };
  const service = createAssessmentAuthorizationService({
    models: {
      ClassroomMembership: { findOne: async () => ({ id: 1 }) },
      Classroom: { findByPk: async (id) => ({ id, teacherId: 5 }) },
      LessonAssessment: {
        findOne: async (options) => {
          calls.assessment.push(options);
          return { id: 12, classroomId: 7 };
        },
      },
    },
  });

  assert.equal((await service.requireManagedClassroom({
    classroomId: 7,
    actorId: 5,
    actorRole: "teacher",
  })).id, 7);
  assert.equal((await service.requireManagedClassroom({
    classroomId: 7,
    actorId: 999,
    actorRole: "admin",
  })).id, 7);
  await assert.rejects(
    service.requireManagedClassroom({ classroomId: 7, actorId: 6, actorRole: "teacher" }),
    (error) => error.code === "FORBIDDEN",
  );

  await service.requireAssessmentInClassroom({ classroomId: 7, assessmentId: 12 });
  assert.deepEqual(calls.assessment[0].where, { id: 12, classroomId: 7 });
});

test("academic lesson authorization excludes tutorial and unknown lesson keys", () => {
  const service = createAssessmentAuthorizationService({
    models: { ClassroomMembership: {}, Classroom: {}, LessonAssessment: {} },
  });

  assert.equal(service.assertAcademicLessonKey("arrays"), "arrays");
  for (const lessonKey of ["tutorial", "unknown", "ARRAYS"]) {
    assert.throws(
      () => service.assertAcademicLessonKey(lessonKey),
      (error) => error.code === "INVALID_LESSON_KEY" && error.status === 400,
    );
  }
});
