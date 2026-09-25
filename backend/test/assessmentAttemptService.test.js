const assert = require("node:assert/strict");
const test = require("node:test");

const servicePath = require.resolve("../src/services/assessmentAttemptService");

const clone = (value) => structuredClone(value);

const makeGraph = ({
  id = 10,
  classroomId = 7,
  type = "POST",
  maxAttempts = type === "PRE" ? 1 : 3,
  isPublished = true,
  shuffleQuestions = true,
  shuffleChoices = true,
  version = 1,
} = {}) => ({
  id,
  classroomId,
  lessonKey: "arrays",
  type,
  title: `${type} assessment`,
  instructions: "Choose carefully",
  isRequired: true,
  isPublished,
  passingPercentage: type === "PRE" ? null : 75,
  maxAttempts,
  gradeCalculation: type === "PRE" ? "FIRST" : "HIGHEST",
  requirePassingForCompletion: type === "POST",
  showScoreAfterSubmission: true,
  answerReviewPolicy: type === "PRE" ? "NEVER" : "AFTER_FINAL_ATTEMPT",
  shuffleQuestions,
  shuffleChoices,
  version,
  questions: [
    {
      id: 101,
      assessmentId: id,
      questionText: "Weighted question",
      questionType: "MULTIPLE_CHOICE",
      displayOrder: 0,
      points: 2,
      explanation: "hidden one",
      choices: [
        { id: 1001, questionId: 101, choiceText: "Correct", displayOrder: 0, isCorrect: true },
        { id: 1002, questionId: 101, choiceText: "Wrong", displayOrder: 1, isCorrect: false },
      ],
    },
    {
      id: 102,
      assessmentId: id,
      questionText: "Second question",
      questionType: "TRUE_FALSE",
      displayOrder: 1,
      points: 1,
      explanation: "hidden two",
      choices: [
        { id: 1003, questionId: 102, choiceText: "True", displayOrder: 0, isCorrect: false },
        { id: 1004, questionId: 102, choiceText: "False", displayOrder: 1, isCorrect: true },
      ],
    },
  ],
});

const makeHarness = (assessmentOptions = {}) => {
  const store = {
    assessments: [makeGraph(assessmentOptions)],
    attempts: [],
    responses: [],
    memberships: [{ classroomId: 7, studentId: 42, status: "active" }],
    failResponseSave: false,
  };
  let attemptId = 1;
  let responseId = 1;
  let clock = Date.parse("2026-09-25T00:00:00.000Z");
  let tail = Promise.resolve();

  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => row[key] === value);
  const row = (value, collectionName) => {
    if (!value) return null;
    Object.defineProperty(value, "save", {
      configurable: true,
      enumerable: false,
      value: async () => {
        if (collectionName === "responses" && store.failResponseSave) {
          store.failResponseSave = false;
          throw new Error("forced response persistence failure");
        }
        return value;
      },
    });
    Object.defineProperty(value, "toJSON", {
      configurable: true,
      enumerable: false,
      value: () => clone(value),
    });
    return value;
  };
  const find = (collection, where) => collection.find((item) => matches(item, where));

  const models = {
    LessonAssessment: {
      findByPk: async (id) => row(store.assessments.find((item) => item.id === Number(id)), "assessments"),
    },
    AssessmentQuestion: {},
    AssessmentChoice: {},
    AssessmentAttempt: {
      findByPk: async (id) => row(store.attempts.find((item) => item.id === Number(id)), "attempts"),
      findOne: async ({ where }) => row(find(store.attempts, where), "attempts"),
      findAll: async ({ where }) => store.attempts.filter((item) => matches(item, where)).map((item) => row(item, "attempts")),
      count: async ({ where }) => store.attempts.filter((item) => matches(item, where)).length,
      create: async (values) => {
        const created = { id: attemptId++, ...clone(values) };
        store.attempts.push(created);
        return row(created, "attempts");
      },
    },
    AssessmentResponse: {
      findOne: async ({ where }) => row(find(store.responses, where), "responses"),
      findAll: async ({ where }) => store.responses.filter((item) => matches(item, where)).map((item) => row(item, "responses")),
      create: async (values) => {
        const created = { id: responseId++, ...clone(values) };
        store.responses.push(created);
        return row(created, "responses");
      },
    },
    ClassroomMembership: {
      findOne: async ({ where }) => row(find(store.memberships, where), "memberships"),
    },
  };

  const sequelize = {
    transaction: (callback) => {
      const run = async () => {
        const snapshot = clone({
          attempts: store.attempts,
          responses: store.responses,
          attemptId,
          responseId,
        });
        try {
          return await callback({ LOCK: { UPDATE: "UPDATE" } });
        } catch (error) {
          store.attempts = snapshot.attempts;
          store.responses = snapshot.responses;
          attemptId = snapshot.attemptId;
          responseId = snapshot.responseId;
          throw error;
        }
      };
      const pending = tail.then(run, run);
      tail = pending.catch(() => {});
      return pending;
    },
  };

  delete require.cache[servicePath];
  const { createAssessmentAttemptService } = require(servicePath);
  const service = createAssessmentAttemptService({
    sequelize,
    models,
    random: () => 0,
    now: () => new Date(clock += 1000),
  });
  return { service, store };
};

const expectCode = async (promise, code) => assert.rejects(promise, (error) => error?.code === code);

test("creates the first attempt with stable safe shuffled question and choice order", async () => {
  const { service, store } = makeHarness();
  const started = await service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });

  assert.equal(started.attempt.attemptNumber, 1);
  assert.deepEqual(started.attempt.questionOrder, [102, 101]);
  assert.deepEqual(started.attempt.choiceOrder, { 101: [1002, 1001], 102: [1004, 1003] });
  assert.equal(store.attempts.length, 1);
  assert.equal(JSON.stringify(started).includes("isCorrect"), false);
  assert.equal(JSON.stringify(started).includes("hidden one"), false);

  const resumed = await service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  assert.equal(resumed.attempt.id, started.attempt.id);
  assert.deepEqual(resumed.attempt.questionOrder, started.attempt.questionOrder);
  assert.deepEqual(resumed.attempt.choiceOrder, started.attempt.choiceOrder);
  assert.equal(store.attempts.length, 1);
});

test("persists deterministic display order when shuffling is disabled", async () => {
  const { service } = makeHarness({ shuffleQuestions: false, shuffleChoices: false });
  const { attempt } = await service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  assert.deepEqual(attempt.questionOrder, [101, 102]);
  assert.deepEqual(attempt.choiceOrder, { 101: [1001, 1002], 102: [1003, 1004] });
});

test("serializes duplicate starts into one active attempt", async () => {
  const { service, store } = makeHarness();
  const [left, right] = await Promise.all([
    service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 }),
    service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 }),
  ]);
  assert.equal(left.attempt.id, right.attempt.id);
  assert.equal(store.attempts.length, 1);
});

test("enforces PRE and POST submitted-attempt limits while allowing later POST attempts", async () => {
  const pre = makeHarness({ type: "PRE" });
  const firstPre = await pre.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  await pre.service.submitAttempt({ attemptId: firstPre.attempt.id, studentId: 42, submissionKey: "pre-submit-1" });
  await expectCode(pre.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 }), "MAX_ATTEMPTS");

  const post = makeHarness({ maxAttempts: 2 });
  const first = await post.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  await post.service.submitAttempt({ attemptId: first.attempt.id, studentId: 42, submissionKey: "post-submit-1" });
  const second = await post.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  assert.equal(second.attempt.attemptNumber, 2);
  await post.service.submitAttempt({ attemptId: second.attempt.id, studentId: 42, submissionKey: "post-submit-2" });
  await expectCode(post.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 }), "MAX_ATTEMPTS");
});

test("rejects unpublished assessments, wrong classroom membership, and foreign ownership", async () => {
  const unpublished = makeHarness({ isPublished: false });
  await expectCode(unpublished.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 }), "ASSESSMENT_UNAVAILABLE");

  const unauthorized = makeHarness();
  unauthorized.store.memberships[0].classroomId = 999;
  await expectCode(unauthorized.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 }), "NOT_ENROLLED");

  const owned = makeHarness();
  const { attempt } = await owned.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  await expectCode(owned.service.saveResponse({ attemptId: attempt.id, studentId: 99, questionId: 101, selectedChoiceId: 1001 }), "ATTEMPT_FORBIDDEN");
});

test("validates presented questions and canonical choice ownership while allowing clear", async () => {
  const { service, store } = makeHarness();
  const { attempt } = await service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  await expectCode(service.saveResponse({ attemptId: attempt.id, studentId: 42, questionId: 999, selectedChoiceId: 1001 }), "QUESTION_NOT_PRESENTED");
  await expectCode(service.saveResponse({ attemptId: attempt.id, studentId: 42, questionId: 101, selectedChoiceId: 9999 }), "CHOICE_NOT_IN_QUESTION");
  await expectCode(service.saveResponse({ attemptId: attempt.id, studentId: 42, questionId: 101, selectedChoiceId: 1004 }), "CHOICE_NOT_IN_QUESTION");

  await service.saveResponse({ attemptId: attempt.id, studentId: 42, questionId: 101, selectedChoiceId: 1001 });
  const cleared = await service.saveResponse({ attemptId: attempt.id, studentId: 42, questionId: 101, selectedChoiceId: null });
  assert.equal(cleared.selectedChoiceId, null);
  assert.equal(store.responses[0].selectedChoiceId, null);
  assert.equal(store.responses[0].isCorrect, false);
  assert.equal(store.responses[0].pointsAwarded, 0);
});

test("grades weighted points server-side and persists unanswered questions as zero", async () => {
  const { service, store } = makeHarness();
  const { attempt } = await service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  await service.saveResponse({ attemptId: attempt.id, studentId: 42, questionId: 101, selectedChoiceId: 1001 });
  const result = await service.submitAttempt({
    attemptId: attempt.id,
    studentId: 42,
    submissionKey: "weighted-submit",
    pointsEarned: 999,
    percentage: 100,
    correctCount: 99,
    passed: true,
  });

  assert.equal(result.pointsEarned, 2);
  assert.equal(result.maxPoints, 3);
  assert.equal(result.percentage, 66.67);
  assert.equal(result.correctCount, 1);
  assert.equal(result.passed, false);
  assert.equal(store.responses.length, 2);
  assert.deepEqual(
    store.responses.find((response) => response.questionId === 102),
    { id: 2, attemptId: attempt.id, questionId: 102, selectedChoiceId: null, isCorrect: false, pointsAwarded: 0 },
  );
});

test("keeps PRE diagnostic passed null and submitted attempts immutable", async () => {
  const { service } = makeHarness({ type: "PRE" });
  const { attempt } = await service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  const result = await service.submitAttempt({ attemptId: attempt.id, studentId: 42, submissionKey: "diagnostic-submit" });
  assert.equal(result.passed, null);
  await expectCode(service.saveResponse({ attemptId: attempt.id, studentId: 42, questionId: 101, selectedChoiceId: 1001 }), "ATTEMPT_SUBMITTED");
});

test("makes submission retries idempotent only for the same key", async () => {
  const { service, store } = makeHarness();
  const { attempt } = await service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  const first = await service.submitAttempt({ attemptId: attempt.id, studentId: 42, submissionKey: "same-submit-key" });
  const retry = await service.submitAttempt({ attemptId: attempt.id, studentId: 42, submissionKey: "same-submit-key" });
  assert.deepEqual(retry, first);
  assert.equal(store.responses.length, 2);
  await expectCode(service.submitAttempt({ attemptId: attempt.id, studentId: 42, submissionKey: "different-key" }), "ATTEMPT_SUBMITTED");
});

test("serializes two-tab submission contention without overwriting history", async () => {
  const { service, store } = makeHarness();
  const { attempt } = await service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  const settled = await Promise.allSettled([
    service.submitAttempt({ attemptId: attempt.id, studentId: 42, submissionKey: "tab-one-key" }),
    service.submitAttempt({ attemptId: attempt.id, studentId: 42, submissionKey: "tab-two-key" }),
  ]);
  assert.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(settled.filter((item) => item.reason?.code === "ATTEMPT_SUBMITTED").length, 1);
  assert.equal(store.attempts[0].status, "SUBMITTED");
});

test("rolls back response grading and attempt mutation when submission persistence fails", async () => {
  const { service, store } = makeHarness();
  const { attempt } = await service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  await service.saveResponse({ attemptId: attempt.id, studentId: 42, questionId: 101, selectedChoiceId: 1001 });
  store.failResponseSave = true;
  await assert.rejects(service.submitAttempt({ attemptId: attempt.id, studentId: 42, submissionKey: "rollback-key" }), /forced response/);
  assert.equal(store.attempts[0].status, "IN_PROGRESS");
  assert.equal(store.attempts[0].submissionKey, undefined);
  assert.equal(store.responses.length, 1);
  assert.equal(store.responses[0].isCorrect, false);
  assert.equal(store.responses[0].pointsAwarded, 0);
});

test("rejects an attempt whose persisted assessment version no longer matches", async () => {
  const { service, store } = makeHarness();
  const { attempt } = await service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  store.assessments[0].version = 2;
  await expectCode(service.saveResponse({ attemptId: attempt.id, studentId: 42, questionId: 101, selectedChoiceId: 1001 }), "ASSESSMENT_VERSION_MISMATCH");
  await expectCode(service.submitAttempt({ attemptId: attempt.id, studentId: 42, submissionKey: "version-key" }), "ASSESSMENT_VERSION_MISMATCH");
});

test("blocks structural edits after the first attempt exists", async () => {
  const { service } = makeHarness();
  assert.equal(await service.assertAssessmentStructureMutable({ assessmentId: 10 }), true);
  await service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  await expectCode(service.assertAssessmentStructureMutable({ assessmentId: 10 }), "ASSESSMENT_IMMUTABLE");
});
