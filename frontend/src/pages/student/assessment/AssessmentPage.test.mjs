import assert from "node:assert/strict";
import test from "node:test";

const loadModule = () => import("./assessmentRouteOrchestrator.js");

const routeParams = (overrides = {}) => ({
  classroomId: "47",
  lessonKey: "arrays",
  type: "pre",
  ...overrides,
});

const lessonProgression = (overrides = {}) => ({
  lessonKey: "arrays",
  preRequired: true,
  preAssessmentId: 91,
  preUnlocked: true,
  preAttemptInProgress: false,
  preCompleted: false,
  moduleUnlocked: false,
  gameCompleted: true,
  postRequired: true,
  postAssessmentId: 92,
  postUnlocked: true,
  postAttemptInProgress: false,
  postCompleted: false,
  postPassingRequired: true,
  postPassed: false,
  postAttemptsRemaining: 3,
  postAttemptsExhausted: false,
  lessonCompleted: false,
  nextAction: "TAKE_PRE",
  ...overrides,
});

const progressDto = ({ classroomId = 47, lesson = lessonProgression() } = {}) => ({
  classroomId,
  lessons: [lesson],
  summary: { nextAction: lesson.nextAction, nextActionLessonKey: lesson.lessonKey },
});

const discoveryDto = ({
  type = "PRE",
  assessmentId = 91,
  lessonKey = "arrays",
  status = {},
} = {}) => ({
  assessment: {
    id: assessmentId,
    lessonKey,
    type,
    title: type === "PRE" ? "Arrays diagnostic" : "Arrays post-test",
    instructions: "Choose the best answer.",
    required: true,
    maxAttempts: type === "PRE" ? 1 : 3,
  },
  status: {
    available: true,
    lessonKey,
    type,
    attemptStatus: "NOT_STARTED",
    attemptsUsed: 0,
    attemptsRemaining: type === "PRE" ? 1 : 3,
    hasSubmittedAttempt: false,
    latestSubmittedAttemptId: null,
    unlocked: true,
    lockReason: null,
    ...(type === "PRE" ? { diagnosticCompleted: false } : {}),
    ...status,
  },
});

const attemptEnvelope = ({
  type = "PRE",
  assessmentId = type === "PRE" ? 91 : 92,
  attemptId = 301,
  resumed = false,
  lessonKey = "arrays",
  status = "IN_PROGRESS",
} = {}) => ({
  attempt: {
    attemptId,
    attemptNumber: 1,
    assessmentVersion: 4,
    status,
    startedAt: "2026-09-29T00:00:00.000Z",
    resumed,
    attemptsUsed: 0,
    attemptsRemaining: type === "PRE" ? 0 : 2,
    responses: [{ questionId: 102, selectedChoiceId: 1004 }],
  },
  assessment: {
    id: assessmentId,
    lessonKey,
    type,
    title: type === "PRE" ? "Arrays diagnostic" : "Arrays post-test",
    instructions: "Choose the best answer.",
    version: 4,
    questions: [
      {
        id: 102,
        questionText: "Array indexes start at zero.",
        questionType: "TRUE_FALSE",
        points: 1,
        objectiveKey: "index-arrays",
        choices: [
          { id: 1004, choiceText: "True" },
          { id: 1003, choiceText: "False" },
        ],
      },
      {
        id: 101,
        questionText: "Which declaration creates an array?",
        questionType: "MULTIPLE_CHOICE",
        points: 1,
        objectiveKey: "declare-arrays",
        choices: [
          { id: 1001, choiceText: "int[] values" },
          { id: 1002, choiceText: "int values" },
        ],
      },
    ],
  },
});

const submittedResult = ({
  type = "PRE",
  attemptId = 401,
  passed,
  classroomId = 47,
  lessonKey = "arrays",
} = {}) => ({
  assessment: {
    id: type === "PRE" ? 91 : 92,
    classroomId,
    lessonKey,
    type,
    title: type === "PRE" ? "Arrays diagnostic" : "Arrays post-test",
  },
  result: {
    attemptId,
    type,
    status: "SUBMITTED",
    attemptNumber: 1,
    submittedAt: "2026-09-29T01:00:00.000Z",
    scoreVisible: false,
    ...(type === "PRE" ? { diagnosticCompleted: true } : { passed: passed ?? false }),
  },
  attempts: { used: 1, max: type === "PRE" ? 1 : 3, remaining: type === "PRE" ? 0 : 2 },
  reviewAvailable: false,
});

const createHarness = ({
  progress = progressDto(),
  discovery = discoveryDto(),
  attempt = attemptEnvelope({ resumed: true }),
  started = attemptEnvelope(),
  result = submittedResult(),
  failures = {},
} = {}) => {
  const calls = [];
  const invoke = async (name, args, value) => {
    calls.push({ name, args });
    if (failures[name]) throw failures[name];
    return typeof value === "function" ? value(args) : value;
  };
  return {
    calls,
    services: {
      getProgress: (args) => invoke("getProgress", args, progress),
      discoverAssessment: (args) => invoke("discoverAssessment", args, discovery),
      getAttempt: (args) => invoke("getAttempt", args, attempt),
      startOrResumeAttempt: (args) => invoke("startOrResumeAttempt", args, started),
      getAttemptResult: (args) => invoke("getAttemptResult", args, result),
    },
  };
};

const load = async (harness, params = routeParams(), options = {}) => {
  const { createAssessmentRouteOrchestrator } = await loadModule();
  const orchestrator = createAssessmentRouteOrchestrator(harness.services);
  return orchestrator.load({
    params,
    generation: options.generation ?? 1,
    signal: options.signal,
    isCurrent: options.isCurrent ?? (() => true),
  });
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

test("assessment routes accept canonical PRE/POST paths and reject malformed parameters before API work", async () => {
  const { parseAssessmentPageRoute, createAssessmentRouteOrchestrator } = await loadModule();
  assert.deepEqual(parseAssessmentPageRoute(routeParams()), {
    classroomId: 47,
    lessonKey: "arrays",
    type: "PRE",
    attemptId: null,
    routeKey: "47:arrays:pre",
  });
  assert.equal(parseAssessmentPageRoute(routeParams({ type: "post" })).type, "POST");
  assert.equal(parseAssessmentPageRoute(routeParams({ attemptId: "401" })).attemptId, 401);

  const invalidRoutes = [
    routeParams({ classroomId: "0" }),
    routeParams({ classroomId: "7junk" }),
    routeParams({ lessonKey: "../arrays" }),
    routeParams({ lessonKey: "tutorial" }),
    routeParams({ type: "PRE" }),
    routeParams({ type: "mid" }),
  ];
  for (const params of invalidRoutes) {
    const harness = createHarness();
    const result = await createAssessmentRouteOrchestrator(harness.services).load({
      params,
      generation: 1,
      isCurrent: () => true,
    });
    assert.equal(result.kind, "INVALID_ROUTE");
    assert.deepEqual(harness.calls, []);
  }
});

test("stable attempt result route loads the exact result and progression without discovery or attempt creation", async () => {
  const attemptId = 401;
  const harness = createHarness({
    progress: progressDto({ lesson: lessonProgression({ preCompleted: true }) }),
    result: submittedResult({ attemptId }),
  });
  const { createAssessmentRouteOrchestrator } = await loadModule();
  const outcome = await createAssessmentRouteOrchestrator(harness.services).load({
    params: routeParams({ attemptId: String(attemptId) }),
    generation: 1,
    isCurrent: () => true,
  });

  assert.equal(outcome.kind, "RESULT");
  assert.equal(outcome.resultEnvelope.result.attemptId, attemptId);
  assert.equal(outcome.progression.classroomId, 47);
  assert.equal(harness.calls.some(({ name }) => name === "discoverAssessment"), false);
  assert.equal(harness.calls.some(({ name }) => name === "startOrResumeAttempt"), false);
  assert.deepEqual(
    harness.calls.find(({ name }) => name === "getAttemptResult").args,
    { attemptId, classroomId: 47, lessonKey: "arrays", type: "PRE", signal: undefined },
  );
});

test("stable attempt result route rejects an envelope from another lesson or classroom", async () => {
  const harness = createHarness({ result: {
    ...submittedResult({ attemptId: 401 }),
    assessment: {
      id: 91,
      classroomId: 99,
      lessonKey: "functions",
      type: "PRE",
      title: "Wrong result",
    },
  } });
  const { createAssessmentRouteOrchestrator } = await loadModule();
  const outcome = await createAssessmentRouteOrchestrator(harness.services).load({
    params: routeParams({ attemptId: "401" }),
    generation: 1,
    isCurrent: () => true,
  });
  assert.equal(outcome.kind, "RESULT_ERROR");
  assert.equal(outcome.error.code, "ASSESSMENT_STATE_MISMATCH");
});

test("explicit classroom identity is used for progression and discovery without primary substitution", async () => {
  const harness = createHarness({
    progress: progressDto({ classroomId: 88 }),
    discovery: discoveryDto({ assessmentId: 191 }),
    started: attemptEnvelope({ assessmentId: 191 }),
  });
  harness.services.getProgress = async (args) => {
    harness.calls.push({ name: "getProgress", args });
    return progressDto({
      classroomId: 88,
      lesson: lessonProgression({ preAssessmentId: 191 }),
    });
  };

  const result = await load(harness, routeParams({ classroomId: "88" }));
  assert.equal(result.kind, "ACTIVE");
  assert.deepEqual(harness.calls.map(({ name }) => name), [
    "getProgress",
    "discoverAssessment",
    "startOrResumeAttempt",
  ]);
  assert.equal(harness.calls[0].args.classroomId, 88);
  assert.equal(harness.calls[1].args.classroomId, 88);
});

test("assessment-exempt final PRE and POST routes discover and start without projected assessment IDs", async (t) => {
  for (const type of ["PRE", "POST"]) {
    await t.test(type, async () => {
      const assessmentId = type === "PRE" ? 701 : 702;
      const finalProgression = lessonProgression({
        lessonKey: "final",
        preRequired: false,
        preAssessmentId: null,
        preUnlocked: false,
        postRequired: false,
        postAssessmentId: null,
        postUnlocked: false,
        postPassingRequired: false,
        gameCompleted: true,
        nextAction: "LESSON_COMPLETE",
      });
      const harness = createHarness({
        progress: progressDto({ lesson: finalProgression }),
        discovery: discoveryDto({ type, assessmentId, lessonKey: "final" }),
        started: attemptEnvelope({ type, assessmentId, lessonKey: "final" }),
      });

      const result = await load(harness, routeParams({
        lessonKey: "final",
        type: type.toLowerCase(),
      }));

      assert.equal(result.kind, "ACTIVE");
      assert.deepEqual(harness.calls.map(({ name }) => name), [
        "getProgress",
        "discoverAssessment",
        "startOrResumeAttempt",
      ]);
      assert.equal(harness.calls[2].args.assessmentId, assessmentId);
    });
  }
});

test("submitted final POST uses only discovery-visible state and never auto-starts", async (t) => {
  const cases = [
    {
      name: "hidden or non-graded result remains neutral",
      status: { attemptsRemaining: 2 },
      kind: "SUBMITTED",
    },
    {
      name: "visible passed result is complete",
      status: {
        attemptsRemaining: 2,
        latestSubmitted: { attemptNumber: 1, percentage: 88, passed: true },
      },
      kind: "COMPLETED",
    },
    {
      name: "zero remaining attempts is exhausted",
      status: { attemptsRemaining: 0 },
      kind: "EXHAUSTED",
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const latestSubmittedAttemptId = 801;
      const harness = createHarness({
        progress: progressDto({
          lesson: lessonProgression({
            lessonKey: "final",
            preRequired: false,
            preAssessmentId: null,
            preUnlocked: false,
            postRequired: false,
            postAssessmentId: null,
            postUnlocked: false,
            postCompleted: false,
            postPassed: false,
            postAttemptsExhausted: false,
            nextAction: "LESSON_COMPLETE",
          }),
        }),
        discovery: discoveryDto({
          type: "POST",
          assessmentId: 702,
          lessonKey: "final",
          status: {
            attemptStatus: "SUBMITTED",
            hasSubmittedAttempt: true,
            latestSubmittedAttemptId,
            ...fixture.status,
          },
        }),
        result: submittedResult({
          type: "POST",
          attemptId: latestSubmittedAttemptId,
          passed: fixture.status.latestSubmitted?.passed ?? false,
          lessonKey: "final",
        }),
      });

      const result = await load(harness, routeParams({ lessonKey: "final", type: "post" }));
      assert.equal(result.kind, "RESULT");
      assert.equal(result.resultDisposition, fixture.kind);
      assert.equal(result.latestSubmittedAttemptId, latestSubmittedAttemptId);
      assert.deepEqual(harness.calls.map(({ name }) => name), [
        "getProgress",
        "discoverAssessment",
        "getAttemptResult",
      ]);
    });
  }
});

test("authoritative locked PRE and POST progression prevents discovery and start mutations", async (t) => {
  for (const fixture of [
    {
      name: "PRE prerequisite lock",
      params: routeParams({ type: "pre" }),
      lesson: lessonProgression({ preUnlocked: false, nextAction: "COMPLETE_PREREQUISITE_LESSON" }),
    },
    {
      name: "POST game lock",
      params: routeParams({ type: "post" }),
      lesson: lessonProgression({ postUnlocked: false, gameCompleted: false, nextAction: "PLAY_GAME" }),
    },
    {
      name: "POST required PRE lock",
      params: routeParams({ type: "post" }),
      lesson: lessonProgression({
        preRequired: true,
        preCompleted: false,
        postUnlocked: false,
        gameCompleted: true,
        nextAction: "TAKE_PRE",
      }),
    },
  ]) {
    await t.test(fixture.name, async () => {
      const harness = createHarness({ progress: progressDto({ lesson: fixture.lesson }) });
      const result = await load(harness, fixture.params);
      assert.equal(result.kind, "LOCKED");
      assert.deepEqual(harness.calls.map(({ name }) => name), ["getProgress"]);
    });
  }
});

test("first unlocked PRE and POST attempts start only after progression and discovery", async (t) => {
  for (const type of ["PRE", "POST"]) {
    await t.test(type, async () => {
      const assessmentId = type === "PRE" ? 91 : 92;
      const harness = createHarness({
        progress: progressDto({ lesson: lessonProgression({ nextAction: `TAKE_${type}` }) }),
        discovery: discoveryDto({ type, assessmentId }),
        started: attemptEnvelope({ type, assessmentId, resumed: true }),
      });
      const result = await load(harness, routeParams({ type: type.toLowerCase() }));
      assert.equal(result.kind, "ACTIVE");
      assert.equal(result.source, "start");
      assert.equal(result.envelope.attempt.resumed, true);
      assert.deepEqual(harness.calls.map(({ name }) => name), [
        "getProgress",
        "discoverAssessment",
        "startOrResumeAttempt",
      ]);
      assert.equal(harness.calls[2].args.assessmentId, assessmentId);
    });
  }
});

test("active PRE and POST attempts are recovered with saved answers and server ordering", async (t) => {
  for (const type of ["PRE", "POST"]) {
    await t.test(type, async () => {
      const assessmentId = type === "PRE" ? 91 : 92;
      const activeAttemptId = type === "PRE" ? 301 : 302;
      const harness = createHarness({
        progress: progressDto({
          lesson: lessonProgression({ [`${type.toLowerCase()}AttemptInProgress`]: true }),
        }),
        discovery: discoveryDto({
          type,
          assessmentId,
          status: { attemptStatus: "IN_PROGRESS", activeAttemptId },
        }),
        attempt: attemptEnvelope({ type, assessmentId, attemptId: activeAttemptId, resumed: true }),
      });
      const result = await load(harness, routeParams({ type: type.toLowerCase() }));
      assert.equal(result.kind, "ACTIVE");
      assert.equal(result.source, "resume");
      assert.deepEqual(harness.calls.map(({ name }) => name), [
        "getProgress",
        "discoverAssessment",
        "getAttempt",
      ]);
      assert.equal(harness.calls[2].args.attemptId, activeAttemptId);
      assert.deepEqual(result.envelope.attempt.responses, [{ questionId: 102, selectedChoiceId: 1004 }]);
      assert.deepEqual(result.envelope.assessment.questions.map(({ id }) => id), [102, 101]);
      assert.deepEqual(result.envelope.assessment.questions[0].choices.map(({ id }) => id), [1004, 1003]);
    });
  }
});

test("completed and submitted states retain result identity without automatic attempts", async (t) => {
  const cases = [
    {
      name: "completed PRE",
      params: routeParams({ type: "pre" }),
      lesson: lessonProgression({ preCompleted: true, moduleUnlocked: true }),
      discovery: discoveryDto({ status: {
        attemptStatus: "SUBMITTED",
        hasSubmittedAttempt: true,
        diagnosticCompleted: true,
        latestSubmittedAttemptId: 401,
        attemptsRemaining: 0,
      } }),
      kind: "COMPLETED",
      attemptId: 401,
    },
    {
      name: "passed POST",
      params: routeParams({ type: "post" }),
      lesson: lessonProgression({ postCompleted: true, postPassed: true, postAttemptsRemaining: 2 }),
      discovery: discoveryDto({ type: "POST", assessmentId: 92, status: {
        attemptStatus: "SUBMITTED",
        hasSubmittedAttempt: true,
        latestSubmittedAttemptId: 402,
        attemptsRemaining: 2,
      } }),
      kind: "COMPLETED",
      attemptId: 402,
    },
    {
      name: "POST retake available",
      params: routeParams({ type: "post" }),
      lesson: lessonProgression({ postCompleted: true, postPassed: false, postAttemptsRemaining: 2 }),
      discovery: discoveryDto({ type: "POST", assessmentId: 92, status: {
        attemptStatus: "SUBMITTED",
        hasSubmittedAttempt: true,
        latestSubmittedAttemptId: 403,
        attemptsRemaining: 2,
      } }),
      kind: "RETAKE_AVAILABLE",
      attemptId: 403,
    },
    {
      name: "POST exhausted",
      params: routeParams({ type: "post" }),
      lesson: lessonProgression({
        postCompleted: true,
        postPassed: false,
        postAttemptsRemaining: 0,
        postAttemptsExhausted: true,
        nextAction: "POST_RECOVERY_REQUIRED",
      }),
      discovery: discoveryDto({ type: "POST", assessmentId: 92, status: {
        attemptStatus: "SUBMITTED",
        hasSubmittedAttempt: true,
        latestSubmittedAttemptId: 404,
        attemptsRemaining: 0,
      } }),
      kind: "EXHAUSTED",
      attemptId: 404,
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const harness = createHarness({
        progress: progressDto({ lesson: fixture.lesson }),
        discovery: fixture.discovery,
        result: submittedResult({
          type: fixture.params.type.toUpperCase(),
          attemptId: fixture.attemptId,
          passed: fixture.lesson.postPassed,
        }),
      });
      const result = await load(harness, fixture.params);
      assert.equal(result.kind, "RESULT");
      assert.equal(result.resultDisposition, fixture.kind);
      assert.equal(result.latestSubmittedAttemptId, fixture.attemptId);
      assert.deepEqual(harness.calls.map(({ name }) => name), [
        "getProgress",
        "discoverAssessment",
        "getAttemptResult",
      ]);
    });
  }
});

test("authoritative completed POST fails closed when discovery omits submitted identity", async () => {
  const harness = createHarness({
    progress: progressDto({
      lesson: lessonProgression({
        postCompleted: true,
        postPassingRequired: true,
        postPassed: false,
        postAttemptsRemaining: 2,
      }),
    }),
    discovery: discoveryDto({
      type: "POST",
      assessmentId: 92,
      status: {
        hasSubmittedAttempt: false,
        latestSubmittedAttemptId: null,
        attemptsUsed: 1,
        attemptsRemaining: 2,
      },
    }),
  });

  const result = await load(harness, routeParams({ type: "post" }));
  assert.equal(result.kind, "ERROR");
  assert.equal(result.error.code, "ASSESSMENT_STATE_MISMATCH");
  assert.deepEqual(harness.calls.map(({ name }) => name), [
    "getProgress",
    "discoverAssessment",
  ]);
});

test("unavailable assessments and wrong classrooms fail safely without mutation", async (t) => {
  await t.test("unpublished or missing progression assessment", async () => {
    const harness = createHarness({
      progress: progressDto({ lesson: lessonProgression({ preAssessmentId: null, preRequired: false }) }),
    });
    const result = await load(harness);
    assert.equal(result.kind, "UNAVAILABLE");
    assert.deepEqual(harness.calls.map(({ name }) => name), ["getProgress"]);
  });

  await t.test("wrong classroom", async () => {
    const forbidden = Object.assign(new Error("Forbidden"), { status: 403, code: "FORBIDDEN" });
    const harness = createHarness({ failures: { getProgress: forbidden } });
    const result = await load(harness);
    assert.equal(result.kind, "FORBIDDEN");
    assert.deepEqual(harness.calls.map(({ name }) => name), ["getProgress"]);
  });
});

test("progression and discovery assessment ID disagreement blocks start and resume", async () => {
  const harness = createHarness({ discovery: discoveryDto({ assessmentId: 999 }) });
  const result = await load(harness);
  assert.equal(result.kind, "ERROR");
  assert.equal(result.error.code, "ASSESSMENT_STATE_MISMATCH");
  assert.deepEqual(harness.calls.map(({ name }) => name), ["getProgress", "discoverAssessment"]);
});

test("same route generation shares one in-flight start request", async () => {
  const pendingStart = deferred();
  const harness = createHarness({ started: () => pendingStart.promise });
  const { createAssessmentRouteOrchestrator } = await loadModule();
  const orchestrator = createAssessmentRouteOrchestrator(harness.services);
  const input = { params: routeParams(), generation: 9, isCurrent: () => true };

  const first = orchestrator.load(input);
  const second = orchestrator.load(input);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(harness.calls.filter(({ name }) => name === "startOrResumeAttempt").length, 1);

  pendingStart.resolve(attemptEnvelope());
  const results = await Promise.all([first, second]);
  assert.deepEqual(results.map(({ kind }) => kind), ["ACTIVE", "ACTIVE"]);
});

test("stale progression, discovery, start, and attempt recovery never advance orchestration", async (t) => {
  for (const stage of ["getProgress", "discoverAssessment", "startOrResumeAttempt", "getAttempt"]) {
    await t.test(stage, async () => {
      const pending = deferred();
      const entered = deferred();
      let current = true;
      const type = stage === "getAttempt" ? "POST" : "PRE";
      const assessmentId = type === "PRE" ? 91 : 92;
      const activeAttemptId = 302;
      const harness = createHarness({
        progress: progressDto({ lesson: lessonProgression({ postAttemptInProgress: true }) }),
        discovery: discoveryDto({
          type,
          assessmentId,
          status: stage === "getAttempt" ? { activeAttemptId, attemptStatus: "IN_PROGRESS" } : {},
        }),
        attempt: attemptEnvelope({ type, assessmentId, attemptId: activeAttemptId }),
      });
      harness.services[stage] = async (args) => {
        harness.calls.push({ name: stage, args });
        entered.resolve();
        return pending.promise;
      };

      const operation = load(
        harness,
        routeParams({ type: type.toLowerCase() }),
        { isCurrent: () => current },
      );
      await entered.promise;
      current = false;

      const values = {
        getProgress: progressDto(),
        discoverAssessment: discoveryDto(),
        startOrResumeAttempt: attemptEnvelope(),
        getAttempt: attemptEnvelope({ type, assessmentId, attemptId: activeAttemptId }),
      };
      pending.resolve(values[stage]);
      const result = await operation;
      assert.equal(result.kind, "STALE");
      const expectedCalls = {
        getProgress: ["getProgress"],
        discoverAssessment: ["getProgress", "discoverAssessment"],
        startOrResumeAttempt: ["getProgress", "discoverAssessment", "startOrResumeAttempt"],
        getAttempt: ["getProgress", "discoverAssessment", "getAttempt"],
      };
      assert.deepEqual(harness.calls.map(({ name }) => name), expectedCalls[stage]);
    });
  }
});

test("cancellation is silent while server failures remain recoverable", async (t) => {
  await t.test("canceled request", async () => {
    const canceled = Object.assign(new Error("Request canceled"), { name: "CanceledError", code: "ERR_CANCELED" });
    const result = await load(createHarness({ failures: { getProgress: canceled } }));
    assert.equal(result.kind, "STALE");
  });

  await t.test("network failure", async () => {
    const network = Object.assign(new Error("Unable to load"), { status: null, code: null });
    const result = await load(createHarness({ failures: { getProgress: network } }));
    assert.equal(result.kind, "ERROR");
    assert.strictEqual(result.error, network);
  });
});

test("normalized backend progression denials remain locked rather than generic forbidden", async (t) => {
  for (const code of [
    "LESSON_PREREQUISITE_REQUIRED",
    "PRE_ASSESSMENT_REQUIRED",
    "POST_ASSESSMENT_LOCKED",
  ]) {
    await t.test(code, async () => {
      const locked = Object.assign(new Error("Locked"), { status: 403, code });
      const result = await load(createHarness({ failures: { getProgress: locked } }));
      assert.equal(result.kind, "LOCKED");
    });
  }
});

test("active orchestration results produce generation-fenced F-B hydration actions", async () => {
  const {
    assessmentActionsForOutcome,
    createAssessmentRouteOrchestrator,
  } = await loadModule();
  const { assessmentReducer, createAssessmentState } = await import("./assessmentState.js");
  const harness = createHarness();
  const outcome = await createAssessmentRouteOrchestrator(harness.services).load({
    params: routeParams(),
    generation: 12,
    isCurrent: () => true,
  });
  const actions = assessmentActionsForOutcome(outcome, {
    routeKey: "47:arrays:pre",
    requestGeneration: 12,
  });

  assert.deepEqual(actions.map(({ type }) => type), [
    "PROGRESSION_REFRESHED",
    "DISCOVERY_SUCCEEDED",
    "ATTEMPT_LOADED",
  ]);

  const loading = assessmentReducer(createAssessmentState(), {
    type: "ROUTE_CHANGED",
    routeKey: "47:arrays:pre",
    requestGeneration: 12,
  });
  const hydrated = actions.reduce(assessmentReducer, loading);
  assert.equal(hydrated.screen, "active");
  assert.deepEqual(hydrated.orderedQuestions.map(({ id }) => id), [102, 101]);
  assert.deepEqual(hydrated.selectedByQuestion, { 102: 1004 });

  const changedRoute = assessmentReducer(hydrated, {
    type: "ROUTE_CHANGED",
    routeKey: "47:arrays:post",
    requestGeneration: 13,
  });
  const ignoredStaleAction = assessmentReducer(changedRoute, actions.at(-1));
  assert.equal(ignoredStaleAction.screen, "loading");
  assert.deepEqual(ignoredStaleAction.orderedQuestions, []);
  assert.deepEqual(ignoredStaleAction.selectedByQuestion, {});
});

test("direct revisit fetches latestSubmittedAttemptId exactly once and never starts another attempt", async () => {
  const attemptId = 450;
  const result = submittedResult({ attemptId });
  const harness = createHarness({
    progress: progressDto({ lesson: lessonProgression({ preCompleted: true, moduleUnlocked: true }) }),
    discovery: discoveryDto({ status: {
      attemptStatus: "SUBMITTED",
      hasSubmittedAttempt: true,
      diagnosticCompleted: true,
      latestSubmittedAttemptId: attemptId,
      attemptsRemaining: 0,
    } }),
    result,
  });

  const outcome = await load(harness);
  assert.equal(outcome.kind, "RESULT");
  assert.equal(outcome.resultDisposition, "COMPLETED");
  assert.strictEqual(outcome.resultEnvelope, result);
  assert.deepEqual(harness.calls.map(({ name }) => name), [
    "getProgress",
    "discoverAssessment",
    "getAttemptResult",
  ]);
  assert.equal(harness.calls[2].args.attemptId, attemptId);
  assert.equal(harness.calls.some(({ name }) => name === "startOrResumeAttempt"), false);
});

test("direct result failure remains tied to the submitted attempt instead of falling back to start", async () => {
  const attemptId = 451;
  const failure = Object.assign(new Error("Offline"), { code: "NETWORK_ERROR" });
  const harness = createHarness({
    progress: progressDto({ lesson: lessonProgression({ preCompleted: true }) }),
    discovery: discoveryDto({ status: {
      hasSubmittedAttempt: true,
      diagnosticCompleted: true,
      latestSubmittedAttemptId: attemptId,
    } }),
    failures: { getAttemptResult: failure },
  });

  const outcome = await load(harness);
  assert.equal(outcome.kind, "RESULT_ERROR");
  assert.equal(outcome.latestSubmittedAttemptId, attemptId);
  assert.strictEqual(outcome.error, failure);
  assert.equal(harness.calls.some(({ name }) => name === "startOrResumeAttempt"), false);
});

test("direct result retry refetches the same submitted attempt ID without creating an attempt", async () => {
  const attemptId = 451;
  let resultReads = 0;
  const harness = createHarness({
    progress: progressDto({ lesson: lessonProgression({ preCompleted: true }) }),
    discovery: discoveryDto({ status: {
      hasSubmittedAttempt: true,
      diagnosticCompleted: true,
      latestSubmittedAttemptId: attemptId,
    } }),
  });
  harness.services.getAttemptResult = async (args) => {
    harness.calls.push({ name: "getAttemptResult", args });
    resultReads += 1;
    if (resultReads === 1) throw Object.assign(new Error("Offline"), { code: "NETWORK_ERROR" });
    return submittedResult({ attemptId });
  };
  const { createAssessmentRouteOrchestrator } = await loadModule();
  const orchestrator = createAssessmentRouteOrchestrator(harness.services);
  const input = { params: routeParams(), generation: 1, isCurrent: () => true };

  const first = await orchestrator.load(input);
  assert.equal(first.kind, "RESULT_ERROR");
  harness.services.discoverAssessment = async (args) => {
    harness.calls.push({ name: "discoverAssessment", args });
    return discoveryDto({ status: { hasSubmittedAttempt: true, latestSubmittedAttemptId: 999 } });
  };
  const retried = await orchestrator.loadResult({
    params: routeParams(),
    attemptId: first.latestSubmittedAttemptId,
    generation: 1,
    isCurrent: () => true,
  });
  assert.equal(retried.kind, "RESULT");
  assert.deepEqual(
    harness.calls.filter(({ name }) => name === "getAttemptResult").map(({ args }) => args.attemptId),
    [attemptId, attemptId],
  );
  assert.equal(harness.calls.filter(({ name }) => name === "discoverAssessment").length, 1);
  assert.equal(harness.calls.some(({ name }) => name === "startOrResumeAttempt"), false);
});

test("explicit POST retake revalidates progression/discovery and starts only once", async () => {
  const pending = deferred();
  const harness = createHarness({
    progress: progressDto({ lesson: lessonProgression({
      postCompleted: true,
      postPassingRequired: true,
      postPassed: false,
      postAttemptsRemaining: 2,
      nextAction: "RETRY_POST",
    }) }),
    discovery: discoveryDto({ type: "POST", assessmentId: 92, status: {
      hasSubmittedAttempt: true,
      latestSubmittedAttemptId: 452,
      attemptsRemaining: 2,
    } }),
    started: () => pending.promise,
  });
  const { createAssessmentRouteOrchestrator } = await loadModule();
  const orchestrator = createAssessmentRouteOrchestrator(harness.services);
  const input = { params: routeParams({ type: "post" }), generation: 11, isCurrent: () => true };

  const first = orchestrator.retake(input);
  const second = orchestrator.retake(input);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(harness.calls.filter(({ name }) => name === "startOrResumeAttempt").length, 1);
  pending.resolve(attemptEnvelope({ type: "POST", assessmentId: 92, attemptId: 500, resumed: true }));
  const [left, right] = await Promise.all([first, second]);
  assert.equal(left.kind, "ACTIVE");
  assert.equal(right.kind, "ACTIVE");
  assert.equal(left.envelope.attempt.resumed, true);
});

test("explicit POST retake accepts backend recovery of an existing active attempt", async () => {
  const activeAttemptId = 503;
  const harness = createHarness({
    progress: progressDto({ lesson: lessonProgression({
      postCompleted: true,
      postPassingRequired: true,
      postPassed: false,
      postAttemptsRemaining: 0,
      postAttemptsExhausted: false,
      postAttemptInProgress: true,
    }) }),
    discovery: discoveryDto({ type: "POST", assessmentId: 92, status: {
      hasSubmittedAttempt: true,
      latestSubmittedAttemptId: 452,
      activeAttemptId,
      attemptsRemaining: 0,
    } }),
    attempt: attemptEnvelope({
      type: "POST",
      assessmentId: 92,
      attemptId: activeAttemptId,
      resumed: true,
    }),
  });
  const { createAssessmentRouteOrchestrator } = await loadModule();
  const outcome = await createAssessmentRouteOrchestrator(harness.services).retake({
    params: routeParams({ type: "post" }),
    generation: 12,
    isCurrent: () => true,
  });

  assert.equal(outcome.kind, "ACTIVE");
  assert.equal(outcome.source, "resume");
  assert.equal(outcome.envelope.attempt.attemptId, activeAttemptId);
  assert.deepEqual(harness.calls.map(({ name }) => name), [
    "getProgress",
    "discoverAssessment",
    "getAttempt",
  ]);
});

test("two sequential retakes in one page lifetime start distinct attempts", async () => {
  let startedAttemptId = 500;
  const harness = createHarness({
    progress: progressDto({ lesson: lessonProgression({
      postCompleted: true,
      postPassingRequired: true,
      postPassed: false,
      postAttemptsRemaining: 2,
      nextAction: "RETRY_POST",
    }) }),
    discovery: discoveryDto({ type: "POST", assessmentId: 92, status: {
      hasSubmittedAttempt: true,
      latestSubmittedAttemptId: 452,
      attemptsRemaining: 2,
    } }),
    started: () => attemptEnvelope({
      type: "POST",
      assessmentId: 92,
      attemptId: ++startedAttemptId,
    }),
  });
  const { createAssessmentRouteOrchestrator } = await loadModule();
  const orchestrator = createAssessmentRouteOrchestrator(harness.services);
  const input = { params: routeParams({ type: "post" }), generation: 11, isCurrent: () => true };

  const first = await orchestrator.retake(input);
  const second = await orchestrator.retake(input);

  assert.equal(first.envelope.attempt.attemptId, 501);
  assert.equal(second.envelope.attempt.attemptId, 502);
  assert.equal(harness.calls.filter(({ name }) => name === "startOrResumeAttempt").length, 2);
});

test("retake is absent for PRE, passed POST, and exhausted POST and stale completion is ignored", async (t) => {
  const { createAssessmentRouteOrchestrator } = await loadModule();

  await t.test("PRE", async () => {
    const harness = createHarness();
    const outcome = await createAssessmentRouteOrchestrator(harness.services).retake({
      params: routeParams({ type: "pre" }),
      generation: 1,
      isCurrent: () => true,
    });
    assert.equal(outcome.kind, "INVALID_ROUTE");
    assert.deepEqual(harness.calls, []);
  });

  for (const fixture of [
    { name: "passed", lesson: { postPassed: true, postAttemptsRemaining: 2 } },
    { name: "exhausted", lesson: { postPassed: false, postAttemptsRemaining: 0, postAttemptsExhausted: true } },
  ]) {
    await t.test(fixture.name, async () => {
      const harness = createHarness({
        progress: progressDto({ lesson: lessonProgression(fixture.lesson) }),
      });
      const outcome = await createAssessmentRouteOrchestrator(harness.services).retake({
        params: routeParams({ type: "post" }),
        generation: 1,
        isCurrent: () => true,
      });
      assert.equal(outcome.kind, fixture.name === "exhausted" ? "EXHAUSTED" : "COMPLETED");
      assert.deepEqual(harness.calls.map(({ name }) => name), ["getProgress"]);
    });
  }

  await t.test("stale start", async () => {
    const pending = deferred();
    let current = true;
    const harness = createHarness({
      progress: progressDto({ lesson: lessonProgression({ postCompleted: true, postAttemptsRemaining: 2 }) }),
      discovery: discoveryDto({ type: "POST", assessmentId: 92, status: {
        hasSubmittedAttempt: true,
        latestSubmittedAttemptId: 452,
      } }),
      started: () => pending.promise,
    });
    const operation = createAssessmentRouteOrchestrator(harness.services).retake({
      params: routeParams({ type: "post" }),
      generation: 1,
      isCurrent: () => current,
    });
    await Promise.resolve();
    await Promise.resolve();
    current = false;
    pending.resolve(attemptEnvelope({ type: "POST", assessmentId: 92 }));
    assert.equal((await operation).kind, "STALE");
  });
});

test("non-mutating revalidation recovers active, submitted, and remote-retake state without starting", async (t) => {
  const { createAssessmentRouteOrchestrator } = await loadModule();

  await t.test("same active attempt", async () => {
    const harness = createHarness({
      progress: progressDto({
        lesson: lessonProgression({ preAttemptInProgress: true }),
      }),
      discovery: discoveryDto({
        status: { activeAttemptId: 301, attemptStatus: "IN_PROGRESS" },
      }),
    });
    const outcome = await createAssessmentRouteOrchestrator(harness.services).revalidate({
      params: routeParams(),
      generation: 7,
    });
    assert.equal(outcome.kind, "ACTIVE");
    assert.equal(outcome.envelope.attempt.attemptId, 301);
    assert.equal(harness.calls.some(({ name }) => name === "startOrResumeAttempt"), false);
  });

  await t.test("submitted attempt", async () => {
    const harness = createHarness({
      progress: progressDto({
        lesson: lessonProgression({ preCompleted: true }),
      }),
      discovery: discoveryDto({
        status: {
          hasSubmittedAttempt: true,
          latestSubmittedAttemptId: 401,
          diagnosticCompleted: true,
          attemptStatus: "SUBMITTED",
        },
      }),
    });
    const outcome = await createAssessmentRouteOrchestrator(harness.services).revalidate({
      params: routeParams(),
      generation: 7,
    });
    assert.equal(outcome.kind, "RESULT");
    assert.equal(outcome.resultEnvelope.result.attemptId, 401);
    assert.equal(harness.calls.some(({ name }) => name === "startOrResumeAttempt"), false);
  });

  await t.test("POST retake started in another tab", async () => {
    const harness = createHarness({
      progress: progressDto({
        lesson: lessonProgression({
          postAttemptInProgress: true,
          postAttemptsRemaining: 1,
          nextAction: "RESUME_POST",
        }),
      }),
      discovery: discoveryDto({
        type: "POST",
        assessmentId: 92,
        status: {
          activeAttemptId: 501,
          attemptStatus: "IN_PROGRESS",
          hasSubmittedAttempt: true,
          latestSubmittedAttemptId: 401,
          attemptsUsed: 2,
          attemptsRemaining: 1,
        },
      }),
      attempt: attemptEnvelope({ type: "POST", assessmentId: 92, attemptId: 501, resumed: true }),
    });
    const outcome = await createAssessmentRouteOrchestrator(harness.services).revalidate({
      params: routeParams({ type: "post" }),
      generation: 7,
    });
    assert.equal(outcome.kind, "ACTIVE");
    assert.equal(outcome.envelope.attempt.attemptId, 501);
    assert.equal(harness.calls.some(({ name }) => name === "startOrResumeAttempt"), false);
  });

  await t.test("no authoritative attempt fails closed", async () => {
    const harness = createHarness();
    const outcome = await createAssessmentRouteOrchestrator(harness.services).revalidate({
      params: routeParams(),
      generation: 7,
    });
    assert.equal(outcome.kind, "ERROR");
    assert.equal(outcome.error.code, "ASSESSMENT_STATE_MISMATCH");
    assert.equal(harness.calls.some(({ name }) => name === "startOrResumeAttempt"), false);
  });
});

test("direct revisit recovers an authoritative GRADING attempt without starting or exposing lease state", async () => {
  const activeAttemptId = 301;
  const harness = createHarness({
    progress: progressDto({ lesson: lessonProgression({ preAttemptInProgress: true }) }),
    discovery: discoveryDto({
      status: { activeAttemptId, attemptStatus: "GRADING" },
    }),
    attempt: attemptEnvelope({ attemptId: activeAttemptId, resumed: true, status: "GRADING" }),
  });

  const outcome = await load(harness);
  assert.equal(outcome.kind, "ACTIVE");
  assert.equal(outcome.envelope.attempt.status, "GRADING");
  assert.equal(harness.calls.some(({ name }) => name === "startOrResumeAttempt"), false);
  assert.equal(JSON.stringify(outcome).includes("gradingLease"), false);
});
