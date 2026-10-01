const assert = require("node:assert/strict");
const test = require("node:test");

const servicePath = require.resolve("../src/services/assessmentAttemptService");

const allowAllProgression = Object.freeze({
  assertAssessmentInteractionAllowed: async () => ({ allowed: true, reason: null }),
});

const clone = (value) => structuredClone(value);

const makeGraph = ({
  id = 10,
  classroomId = 7,
  type = "POST",
  maxAttempts = type === "PRE" ? 1 : 3,
  isPublished = true,
  lessonKey = "arrays",
  shuffleQuestions = true,
  shuffleChoices = true,
  version = 1,
  requirePassingForCompletion = type === "POST",
} = {}) => ({
  id,
  classroomId,
  lessonKey,
  type,
  title: `${type} assessment`,
  instructions: "Choose carefully",
  isRequired: true,
  isPublished,
  passingPercentage: type === "PRE" ? null : 75,
  maxAttempts,
  gradeCalculation: type === "PRE" ? "FIRST" : "HIGHEST",
  requirePassingForCompletion,
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

const makeHarness = (assessmentOptions = {}, {
  progressionService = allowAllProgression,
  secureCodingExecution = { runSecureMethodExecution: async () => ({ category: "INFRASTRUCTURE_ERROR" }) },
  environment = { CODING_ASSESSMENT_PLAYER_ENABLED: "true" },
} = {}) => {
  const store = {
    assessments: [makeGraph(assessmentOptions)],
    attempts: [],
    responses: [],
    memberships: [{ classroomId: 7, studentId: 42, status: "active" }],
    failResponseSave: false,
    failAttemptCreate: false,
    assessmentReads: [],
    operations: [],
    attemptSetReads: [],
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
      findByPk: async (id, options = {}) => {
        store.operations.push("assessment");
        store.assessmentReads.push(options);
        return row(store.assessments.find((item) => item.id === Number(id)), "assessments");
      },
    },
    AssessmentQuestion: {},
    AssessmentChoice: {},
    AssessmentCodingTestCase: {},
    AssessmentAttempt: {
      findByPk: async (id) => row(store.attempts.find((item) => item.id === Number(id)), "attempts"),
      findOne: async ({ where }) => {
        store.operations.push("active-attempt");
        return row(find(store.attempts, where), "attempts");
      },
      findAll: async (options) => {
        store.operations.push("attempt-set");
        store.attemptSetReads.push(options);
        return store.attempts.filter((item) => matches(item, options.where)).map((item) => row(item, "attempts"));
      },
      count: async ({ where }) => store.attempts.filter((item) => matches(item, where)).length,
      create: async (values) => {
        const created = { id: attemptId++, ...clone(values) };
        store.attempts.push(created);
        if (store.failAttemptCreate) throw new Error("forced attempt persistence failure");
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
      findOne: async ({ where }) => {
        store.operations.push("membership");
        return row(find(store.memberships, where), "memberships");
      },
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
    progressionService,
    secureCodingExecution,
    environment,
  });
  return { service, store, sequelize };
};

const useCodingGraph = (store) => {
  store.assessments[0].shuffleQuestions = false;
  store.assessments[0].shuffleChoices = false;
  store.assessments[0].questions = [{
    id: 201,
    assessmentId: store.assessments[0].id,
    questionText: "Add two integers",
    questionType: "CODING",
    displayOrder: 0,
    points: 10,
    starterCode: "public static class Solution { public static int Add(int a, int b) => a + b; }",
    referenceSolution: "public static class Solution { public static int Add(int a, int b) => a + b; }",
    codingTypeName: "Solution",
    codingMethodName: "Add",
    codingParameterTypes: ["int", "int"],
    codingReturnType: "int",
    choices: [],
    codingTestCases: [
      { displayOrder: 0, visibility: "PUBLIC", input: [1, 2], expectedOutput: 3, weight: 1 },
      { displayOrder: 1, visibility: "HIDDEN", input: [5, 7], expectedOutput: 12, weight: 3 },
    ],
  }];
};

const expectCode = async (promise, code) => assert.rejects(promise, (error) => error?.code === code);

const seedActiveAttempt = (store) => {
  const assessment = store.assessments[0];
  const attempt = {
    id: 91,
    assessmentId: assessment.id,
    classroomId: assessment.classroomId,
    studentId: 42,
    attemptNumber: 1,
    status: "IN_PROGRESS",
    assessmentVersion: assessment.version,
    startedAt: new Date("2026-09-24T00:00:00.000Z"),
    submittedAt: null,
    questionOrder: [101, 102],
    choiceOrder: { 101: [1001, 1002], 102: [1003, 1004] },
  };
  store.attempts.push(attempt);
  return attempt;
};

const seedSubmittedAttempt = (store, overrides = {}) => {
  const assessment = store.assessments[0];
  const attemptNumber = overrides.attemptNumber ?? store.attempts.length + 1;
  const attempt = {
    id: overrides.id ?? 90 + attemptNumber,
    assessmentId: assessment.id,
    classroomId: assessment.classroomId,
    studentId: 42,
    attemptNumber,
    status: "SUBMITTED",
    assessmentVersion: assessment.version,
    startedAt: new Date(`2026-09-${String(attemptNumber).padStart(2, "0")}T00:00:00.000Z`),
    submittedAt: new Date(`2026-09-${String(attemptNumber).padStart(2, "0")}T00:10:00.000Z`),
    percentage: 40,
    passed: false,
    questionOrder: [101, 102],
    choiceOrder: { 101: [1001, 1002], 102: [1003, 1004] },
    ...overrides,
  };
  store.attempts.push(attempt);
  return attempt;
};

test("teacher recovery requires a caller transaction before touching persistence", async () => {
  const h = makeHarness();
  await expectCode(h.service.createTeacherGrantedPostAttempt({
    classroomId: 7, assessmentId: 10, studentId: 42,
  }), "TRANSACTION_REQUIRED");
  assert.deepEqual(h.store.operations, []);
});

test("teacher recovery locks the exact assessment before membership and the single attempt-set read", async () => {
  const h = makeHarness({ maxAttempts: 1 });
  seedSubmittedAttempt(h.store);
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const created = await h.service.createTeacherGrantedPostAttempt({
    classroomId: 7, assessmentId: 10, studentId: 42, transaction,
  });

  assert.deepEqual(h.store.operations.slice(0, 3), ["assessment", "membership", "attempt-set"]);
  assert.equal(h.store.assessmentReads[0].transaction, transaction);
  assert.equal(h.store.assessmentReads[0].lock.level, "UPDATE");
  assert.ok(h.store.assessmentReads[0].lock.of);
  assert.equal(h.store.attemptSetReads.length, 1);
  assert.deepEqual(h.store.attemptSetReads[0].where, { assessmentId: 10, studentId: 42 });
  assert.equal(h.store.attemptSetReads[0].lock, "UPDATE");
  assert.equal(created.attemptNumber, 2);

  const substituted = makeHarness({ classroomId: 8, maxAttempts: 1 });
  await expectCode(substituted.service.createTeacherGrantedPostAttempt({
    classroomId: 7, assessmentId: 10, studentId: 42, transaction,
  }), "ASSESSMENT_NOT_FOUND");
  assert.deepEqual(substituted.store.operations, ["assessment"]);
});

test("teacher recovery permits only published passing-required POST assessments", async () => {
  for (const options of [
    { type: "PRE", isPublished: true, requirePassingForCompletion: false },
    { type: "POST", isPublished: false, requirePassingForCompletion: true },
    { type: "POST", isPublished: true, requirePassingForCompletion: false },
  ]) {
    const h = makeHarness({ ...options, maxAttempts: 1 });
    seedSubmittedAttempt(h.store);
    await expectCode(h.service.createTeacherGrantedPostAttempt({
      classroomId: 7, assessmentId: 10, studentId: 42,
      transaction: { LOCK: { UPDATE: "UPDATE" } },
    }), "POST_RECOVERY_NOT_ALLOWED");
    assert.equal(h.store.attemptSetReads.length, 0);
  }
});

test("teacher recovery requires exact active membership before reading attempts", async () => {
  const h = makeHarness({ maxAttempts: 1 });
  seedSubmittedAttempt(h.store);
  h.store.memberships[0].status = "removed";
  await expectCode(h.service.createTeacherGrantedPostAttempt({
    classroomId: 7, assessmentId: 10, studentId: 42,
    transaction: { LOCK: { UPDATE: "UPDATE" } },
  }), "NOT_ENROLLED");
  assert.equal(h.store.attemptSetReads.length, 0);
});

test("teacher recovery preserves exhaustion official-pass and active-attempt error precedence", async () => {
  const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const remaining = makeHarness({ maxAttempts: 2 });
  seedSubmittedAttempt(remaining.store);
  seedActiveAttempt(remaining.store).attemptNumber = 2;
  await expectCode(remaining.service.createTeacherGrantedPostAttempt({
    classroomId: 7, assessmentId: 10, studentId: 42, transaction,
  }), "POST_ATTEMPTS_NOT_EXHAUSTED");

  const passed = makeHarness({ maxAttempts: 1 });
  seedSubmittedAttempt(passed.store, { passed: true, percentage: 100 });
  seedActiveAttempt(passed.store).attemptNumber = 2;
  await expectCode(passed.service.createTeacherGrantedPostAttempt({
    classroomId: 7, assessmentId: 10, studentId: 42, transaction,
  }), "POST_ALREADY_PASSED");

  const active = makeHarness({ maxAttempts: 1 });
  seedSubmittedAttempt(active.store);
  seedActiveAttempt(active.store).attemptNumber = 2;
  await expectCode(active.service.createTeacherGrantedPostAttempt({
    classroomId: 7, assessmentId: 10, studentId: 42, transaction,
  }), "ACTIVE_ATTEMPT_EXISTS");
});

test("teacher recovery appends one normal ordered attempt without mutating history or maxAttempts", async () => {
  const h = makeHarness({ maxAttempts: 2, version: 4 });
  seedSubmittedAttempt(h.store, { id: 11, attemptNumber: 1 });
  seedSubmittedAttempt(h.store, { id: 12, attemptNumber: 3 });
  const before = clone(h.store.attempts);
  const created = await h.service.createTeacherGrantedPostAttempt({
    classroomId: 7, assessmentId: 10, studentId: 42,
    transaction: { LOCK: { UPDATE: "UPDATE" } },
  });

  assert.deepEqual(h.store.attempts.slice(0, 2), before);
  assert.equal(h.store.assessments[0].maxAttempts, 2);
  assert.equal(h.store.attempts.length, 3);
  assert.deepEqual(created, {
    id: 1,
    assessmentId: 10,
    classroomId: 7,
    studentId: 42,
    attemptNumber: 4,
    status: "IN_PROGRESS",
    assessmentVersion: 4,
    startedAt: new Date("2026-09-25T00:00:01.000Z"),
    questionOrder: [102, 101],
    choiceOrder: { 101: [1002, 1001], 102: [1004, 1003] },
  });
});

for (const invalidGraph of ["empty", "no correct choice"]) {
  test(`teacher recovery rejects a published ${invalidGraph} graph without poisoning student resume`, async () => {
    const h = makeHarness({ maxAttempts: 1 });
    seedSubmittedAttempt(h.store);
    const before = clone(h.store.attempts);
    const questions = clone(h.store.assessments[0].questions);
    if (invalidGraph === "empty") h.store.assessments[0].questions = [];
    else h.store.assessments[0].questions[0].choices.forEach((choice) => { choice.isCorrect = false; });

    await expectCode(h.sequelize.transaction((transaction) => (
      h.service.createTeacherGrantedPostAttempt({
        classroomId: 7, assessmentId: 10, studentId: 42, transaction,
      })
    )), "ASSESSMENT_INVALID");
    assert.deepEqual(h.store.attempts, before);
    assert.deepEqual(h.store.operations, ["assessment", "membership", "attempt-set"]);
    assert.equal(h.store.assessmentReads[0].lock.level, "UPDATE");
    await expectCode(h.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 }),
      "ASSESSMENT_INVALID");
    assert.deepEqual(h.store.attempts, before);

    h.store.assessments[0].questions = questions;
    await expectCode(h.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 }),
      "MAX_ATTEMPTS");
    const created = await h.sequelize.transaction((transaction) => (
      h.service.createTeacherGrantedPostAttempt({
        classroomId: 7, assessmentId: 10, studentId: 42, transaction,
      })
    ));
    const resumed = await h.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.attempt.id, created.id);
    assert.equal(resumed.assessment.questions.length, 2);
    assert.equal(h.store.attempts.length, 2);
  });
}

test("recovery retains policy membership and attempt-conflict precedence for invalid graphs", async () => {
  for (const code of ["POST_RECOVERY_NOT_ALLOWED", "NOT_ENROLLED",
    "POST_ATTEMPTS_NOT_EXHAUSTED", "POST_ALREADY_PASSED", "ACTIVE_ATTEMPT_EXISTS"]) {
    const h = makeHarness({ maxAttempts: code === "POST_ATTEMPTS_NOT_EXHAUSTED" ? 2 : 1 });
    h.store.assessments[0].questions = [];
    seedSubmittedAttempt(h.store, code === "POST_ALREADY_PASSED" ? { passed: true, percentage: 100 } : {});
    if (code === "POST_RECOVERY_NOT_ALLOWED") h.store.assessments[0].isPublished = false;
    if (code === "NOT_ENROLLED") h.store.memberships[0].status = "removed";
    if (code === "ACTIVE_ATTEMPT_EXISTS") seedActiveAttempt(h.store);
    const before = clone(h.store.attempts);
    await expectCode(h.service.createTeacherGrantedPostAttempt({
      classroomId: 7, assessmentId: 10, studentId: 42,
      transaction: { LOCK: { UPDATE: "UPDATE" } },
    }), code);
    assert.deepEqual(h.store.attempts, before);
    assert.equal(h.store.operations[0], "assessment");
  }
});

test("teacher recovery rolls back a failed create inside the caller transaction", async () => {
  const h = makeHarness({ maxAttempts: 1 });
  seedSubmittedAttempt(h.store);
  const before = clone(h.store.attempts);
  h.store.failAttemptCreate = true;
  await assert.rejects(h.sequelize.transaction((transaction) => (
    h.service.createTeacherGrantedPostAttempt({
      classroomId: 7, assessmentId: 10, studentId: 42, transaction,
    })
  )), /forced attempt persistence failure/);
  assert.deepEqual(h.store.attempts, before);
});

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

test("new attempts include an empty safe response list", async () => {
  const { service } = makeHarness();
  const started = await service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });

  assert.deepEqual(started.responses, []);
});

test("resumed attempts recover selected choices without grading fields", async () => {
  const { service } = makeHarness();
  const started = await service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  await service.saveResponse({
    attemptId: started.attempt.id,
    studentId: 42,
    questionId: 101,
    selectedChoiceId: 1001,
  });

  const resumed = await service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });

  assert.deepEqual(resumed.responses, [
    { questionId: 101, selectedChoiceId: 1001 },
  ]);
  assert.equal(JSON.stringify(resumed).includes("isCorrect"), false);
  assert.equal(JSON.stringify(resumed).includes("pointsAwarded"), false);
  assert.equal(JSON.stringify(resumed).includes("explanation"), false);
});

test("active attempt retrieval preserves persisted order and selections", async () => {
  const { service } = makeHarness();
  const started = await service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  await service.saveResponse({
    attemptId: started.attempt.id,
    studentId: 42,
    questionId: 102,
    selectedChoiceId: 1004,
  });
  await service.saveResponse({
    attemptId: started.attempt.id,
    studentId: 42,
    questionId: 101,
    selectedChoiceId: null,
  });

  const active = await service.getActiveAttempt({ attemptId: started.attempt.id, studentId: 42 });

  assert.equal(active.resumed, true);
  assert.deepEqual(active.attempt.questionOrder, started.attempt.questionOrder);
  assert.deepEqual(active.responses, [
    { questionId: 102, selectedChoiceId: 1004 },
    { questionId: 101, selectedChoiceId: null },
  ]);
  assert.equal(JSON.stringify(active).includes("isCorrect"), false);
  assert.equal(JSON.stringify(active).includes("pointsAwarded"), false);
  assert.equal(JSON.stringify(active).includes("explanation"), false);
});

test("active attempt retrieval rejects foreign ownership and inactive membership", async () => {
  const owned = makeHarness();
  const { attempt } = await owned.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  await expectCode(
    owned.service.getActiveAttempt({ attemptId: attempt.id, studentId: 99 }),
    "ATTEMPT_FORBIDDEN",
  );

  const inactive = makeHarness();
  const started = await inactive.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  inactive.store.memberships[0].status = "removed";
  await expectCode(
    inactive.service.getActiveAttempt({ attemptId: started.attempt.id, studentId: 42 }),
    "NOT_ENROLLED",
  );
});

test("active attempt retrieval rejects submitted and version-mismatched attempts", async () => {
  const submitted = makeHarness();
  const finished = await submitted.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  await submitted.service.submitAttempt({
    attemptId: finished.attempt.id,
    studentId: 42,
    submissionKey: "active-submit-key",
  });
  await expectCode(
    submitted.service.getActiveAttempt({ attemptId: finished.attempt.id, studentId: 42 }),
    "ATTEMPT_SUBMITTED",
  );

  const stale = makeHarness();
  const started = await stale.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  stale.store.assessments[0].version = 2;
  await expectCode(
    stale.service.getActiveAttempt({ attemptId: started.attempt.id, studentId: 42 }),
    "ASSESSMENT_VERSION_MISMATCH",
  );
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

test("start checks progression after membership under the assessment lock and creates nothing on denial", async () => {
  for (const scenario of [
    { type: "POST", code: "POST_ASSESSMENT_LOCKED" },
    { type: "PRE", lessonKey: "functions", code: "LESSON_PREREQUISITE_REQUIRED" },
  ]) {
    const calls = [];
    const progressionService = {
      assertAssessmentInteractionAllowed: async ({ assessment, studentId, authorizedMembership, transaction }) => {
        calls.push("progression");
        assert.equal(assessment.type, scenario.type);
        assert.equal(studentId, 42);
        assert.equal(authorizedMembership.classroomId, 7);
        assert.equal(authorizedMembership.studentId, 42);
        assert.equal(transaction.LOCK.UPDATE, "UPDATE");
        const error = new Error("blocked");
        error.code = scenario.code;
        throw error;
      },
    };
    const h = makeHarness(scenario, { progressionService });

    await expectCode(
      h.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 }),
      scenario.code,
    );

    assert.deepEqual(calls, ["progression"]);
    assert.deepEqual(h.store.operations, ["assessment", "membership"]);
    assert.equal(h.store.assessmentReads.length, 1);
    assert.equal(h.store.assessmentReads[0].lock.level, "UPDATE");
    assert.ok(h.store.assessmentReads[0].lock.of);
    assert.equal(h.store.attempts.length, 0);
  }
});

for (const scenario of [
  { type: "POST", lessonKey: "arrays", code: "POST_ASSESSMENT_LOCKED" },
  { type: "PRE", lessonKey: "functions", code: "LESSON_PREREQUISITE_REQUIRED" },
]) {
  for (const interaction of ["get", "save", "submit"]) {
    test(`${scenario.type} active ${interaction} rechecks progression and mutates only after unlock`, async () => {
      let unlocked = false;
      const guardCalls = [];
      const progressionService = {
        assertAssessmentInteractionAllowed: async ({
          assessment, studentId, authorizedMembership, transaction,
        }) => {
          guardCalls.push(interaction);
          assert.equal(assessment.type, scenario.type);
          assert.equal(studentId, 42);
          assert.equal(authorizedMembership.classroomId, 7);
          assert.equal(authorizedMembership.studentId, 42);
          assert.equal(authorizedMembership.status, "active");
          assert.equal(transaction.LOCK.UPDATE, "UPDATE");
          if (!unlocked) {
            const error = new Error("blocked");
            error.code = scenario.code;
            throw error;
          }
          return { allowed: true, reason: null };
        },
      };
      const h = makeHarness(scenario, { progressionService });
      const attempt = seedActiveAttempt(h.store);
      const beforeAttempt = clone(attempt);
      const invoke = () => {
        if (interaction === "get") {
          return h.service.getActiveAttempt({ attemptId: attempt.id, studentId: 42 });
        }
        if (interaction === "save") {
          return h.service.saveResponse({
            attemptId: attempt.id,
            studentId: 42,
            questionId: 101,
            selectedChoiceId: 1001,
          });
        }
        return h.service.submitAttempt({
          attemptId: attempt.id,
          studentId: 42,
          submissionKey: `${scenario.type.toLowerCase()}-active-submit`,
        });
      };

      await expectCode(invoke(), scenario.code);
      assert.deepEqual(h.store.attempts[0], beforeAttempt);
      assert.deepEqual(h.store.responses, []);

      unlocked = true;
      const result = await invoke();
      assert.deepEqual(guardCalls, [interaction, interaction]);
      if (interaction === "get") {
        assert.equal(result.attempt.status, "IN_PROGRESS");
        assert.deepEqual(result.responses, []);
      } else if (interaction === "save") {
        assert.equal(result.selectedChoiceId, 1001);
        assert.equal(h.store.responses.length, 1);
      } else {
        assert.equal(result.status, "SUBMITTED");
        assert.equal(h.store.attempts[0].submissionKey, `${scenario.type.toLowerCase()}-active-submit`);
        assert.equal(h.store.responses.length, 2);
      }
    });
  }
}

test("start keeps tutorial and final assessments Phase C-compatible", async () => {
  const finalAssessment = makeHarness(
    { lessonKey: "final" },
    { progressionService: allowAllProgression },
  );
  const started = await finalAssessment.service.startOrResumeAttempt({
    assessmentId: 10,
    studentId: 42,
  });
  assert.equal(started.attempt.status, "IN_PROGRESS");
  assert.equal(finalAssessment.store.attempts.length, 1);

  const tutorialAssessment = makeHarness(
    { lessonKey: "tutorial" },
    { progressionService: allowAllProgression },
  );
  await expectCode(
    tutorialAssessment.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 }),
    "ASSESSMENT_INVALID",
  );
  assert.equal(tutorialAssessment.store.attempts.length, 0);
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
  let progressionAllowed = true;
  let progressionCalls = 0;
  const progressionService = {
    assertAssessmentInteractionAllowed: async () => {
      progressionCalls += 1;
      if (!progressionAllowed) {
        const error = new Error("locked after submission");
        error.code = "POST_ASSESSMENT_LOCKED";
        throw error;
      }
      return { allowed: true, reason: null };
    },
  };
  const { service, store } = makeHarness({}, { progressionService });
  const { attempt } = await service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  const first = await service.submitAttempt({ attemptId: attempt.id, studentId: 42, submissionKey: "same-submit-key" });
  progressionAllowed = false;
  const callsBeforeRetry = progressionCalls;
  const retry = await service.submitAttempt({ attemptId: attempt.id, studentId: 42, submissionKey: "same-submit-key" });
  assert.deepEqual(retry, first);
  assert.equal(progressionCalls, callsBeforeRetry);
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

test("CODING autosave persists source without grading and enforces response exclusivity and size", async () => {
  const h = makeHarness();
  useCodingGraph(h.store);
  const started = await h.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  const sourceCode = h.store.assessments[0].questions[0].starterCode;
  const saved = await h.service.saveResponse({
    attemptId: started.attempt.id, studentId: 42, questionId: 201, sourceCode,
  });
  assert.deepEqual(saved, { attemptId: started.attempt.id, questionId: 201, sourceCode });
  assert.equal(h.store.responses[0].isCorrect, false);
  assert.equal(h.store.responses[0].pointsAwarded, 0);
  const restored = await h.service.getActiveAttempt({ attemptId: started.attempt.id, studentId: 42 });
  assert.deepEqual(restored.responses, [{ questionId: 201, selectedChoiceId: null, sourceCode }]);
  await expectCode(h.service.saveResponse({
    attemptId: started.attempt.id, studentId: 42, questionId: 201,
    selectedChoiceId: 1001, sourceCode,
  }), "INVALID_CODING_RESPONSE");
  await expectCode(h.service.saveResponse({
    attemptId: started.attempt.id, studentId: 42, questionId: 201,
    sourceCode: "x".repeat(16 * 1024 + 1),
  }), "CODING_SOURCE_TOO_LARGE");
});

test("CODING attempts remain unavailable while the separate player release gate is off", async () => {
  const h = makeHarness({}, { environment: {} });
  useCodingGraph(h.store);
  await expectCode(
    h.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 }),
    "CODING_PLAYER_UNAVAILABLE",
  );
  assert.equal(h.store.attempts.length, 0);
});

test("CODING submission applies partial credit and preserves PRE diagnostic semantics", async () => {
  const h = makeHarness({ type: "PRE" }, {
    secureCodingExecution: {
      runSecureMethodExecution: async () => ({
        category: "RUNTIME_ERROR",
        invocations: [
          { category: "SUCCESS", output: 3 },
          { category: "RUNTIME_ERROR" },
        ],
      }),
    },
  });
  useCodingGraph(h.store);
  const started = await h.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  await h.service.saveResponse({
    attemptId: started.attempt.id, studentId: 42, questionId: 201,
    sourceCode: h.store.assessments[0].questions[0].starterCode,
  });
  const result = await h.service.submitAttempt({
    attemptId: started.attempt.id, studentId: 42, submissionKey: "coding-pre-1",
  });
  assert.equal(result.pointsEarned, 2.5);
  assert.equal(result.percentage, 25);
  assert.equal(result.passed, null);
  assert.equal(h.store.responses[0].isCorrect, false);
  assert.equal(h.store.responses[0].pointsAwarded, 2.5);
});

test("secure capability failure rolls back CODING grading and leaves the attempt submittable", async () => {
  const h = makeHarness();
  useCodingGraph(h.store);
  const started = await h.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  await h.service.saveResponse({
    attemptId: started.attempt.id, studentId: 42, questionId: 201,
    sourceCode: h.store.assessments[0].questions[0].starterCode,
  });
  await expectCode(h.service.submitAttempt({
    attemptId: started.attempt.id, studentId: 42, submissionKey: "coding-post-1",
  }), "CODING_EXECUTION_UNAVAILABLE");
  assert.equal(h.store.attempts[0].status, "IN_PROGRESS");
  assert.equal(h.store.attempts[0].submissionKey, undefined);
  assert.equal(h.store.responses[0].pointsAwarded, 0);
  assert.equal(h.store.responses[0].isCorrect, false);
});

test("malformed runner output is infrastructure failure and cannot become a student zero", async () => {
  const h = makeHarness({}, {
    secureCodingExecution: { runSecureMethodExecution: async () => ({}) },
  });
  useCodingGraph(h.store);
  const started = await h.service.startOrResumeAttempt({ assessmentId: 10, studentId: 42 });
  await h.service.saveResponse({
    attemptId: started.attempt.id, studentId: 42, questionId: 201,
    sourceCode: h.store.assessments[0].questions[0].starterCode,
  });
  await expectCode(h.service.submitAttempt({
    attemptId: started.attempt.id, studentId: 42, submissionKey: "malformed-runner-1",
  }), "CODING_EXECUTION_UNAVAILABLE");
  assert.equal(h.store.attempts[0].status, "IN_PROGRESS");
  assert.equal(h.store.responses[0].pointsAwarded, 0);
});
