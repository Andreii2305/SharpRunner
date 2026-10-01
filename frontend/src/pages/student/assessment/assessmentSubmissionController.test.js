import assert from "node:assert/strict";
import test from "node:test";
import {
  createAssessmentSubmissionController,
  createAttemptSubmissionKeyStore,
} from "./assessmentSubmissionController.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const cleanState = () => ({
  orderedQuestions: [{ id: 101 }],
  selectedByQuestion: { 101: 1001 },
  savedByQuestion: { 101: 1001 },
  saveStateByQuestion: { 101: { status: "clean" } },
});

const createHarness = (overrides = {}) => {
  const actions = [];
  const calls = [];
  let state = overrides.state ?? cleanState();
  let current = true;
  const result = overrides.result ?? {
    result: {
      attemptId: 312,
      type: "POST",
      status: "SUBMITTED",
      attemptNumber: 1,
      submittedAt: "2026-09-29T01:00:00.000Z",
      scoreVisible: false,
      passed: false,
    },
    attempts: { used: 1, max: 3, remaining: 2 },
    reviewAvailable: false,
  };
  const progression = overrides.progression ?? {
    classroomId: 47,
    lessons: [{ lessonKey: "arrays", postAttemptsRemaining: 2 }],
  };
  const controller = createAssessmentSubmissionController({
    attemptId: 312,
    classroomId: 47,
    routeKey: "47:arrays:post",
    requestGeneration: 9,
    getState: () => state,
    flushAll: overrides.flushAll ?? (async () => {}),
    submitAttempt: overrides.submitAttempt ?? (async (args) => {
      calls.push({ name: "submitAttempt", args });
      return result;
    }),
    getAttemptResult: overrides.getAttemptResult ?? (async (args) => {
      calls.push({ name: "getAttemptResult", args });
      return result;
    }),
    getProgress: overrides.getProgress ?? (async (args) => {
      calls.push({ name: "getProgress", args });
      return progression;
    }),
    getSubmissionReadiness: overrides.getSubmissionReadiness ?? (() => ({
      ready: true,
      dirtyQuestionIds: [],
      savingQuestionIds: [],
      failedQuestionIds: [],
    })),
    getIdempotencyKey: () => "stable-submit-key-312",
    dispatch: (action) => actions.push(action),
    isCurrent: () => current,
    onSubmitted: overrides.onSubmitted,
    wait: overrides.wait,
    gradingPollDelays: overrides.gradingPollDelays,
  });
  return {
    actions,
    calls,
    controller,
    result,
    progression,
    setCurrent(value) { current = value; },
    setState(value) { state = value; },
  };
};

test("submission is blocked before flush and HTTP work while saves are dirty, pending, failed, or conflicted", async (t) => {
  for (const fixture of [
    { name: "dirty", readiness: { dirtyQuestionIds: [101], savingQuestionIds: [], failedQuestionIds: [] } },
    { name: "saving", readiness: { dirtyQuestionIds: [101], savingQuestionIds: [101], failedQuestionIds: [] } },
    { name: "failed", readiness: { dirtyQuestionIds: [101], savingQuestionIds: [], failedQuestionIds: [101] } },
    { name: "immutable conflict", readiness: { dirtyQuestionIds: [101], savingQuestionIds: [], failedQuestionIds: [101] } },
  ]) {
    await t.test(fixture.name, async () => {
      let flushed = false;
      const harness = createHarness({
        flushAll: async () => { flushed = true; },
        getSubmissionReadiness: () => ({ ready: false, ...fixture.readiness }),
      });
      const outcome = await harness.controller.submit();
      assert.equal(outcome.kind, "BLOCKED");
      assert.equal(flushed, false);
      assert.deepEqual(harness.calls, []);
      assert.deepEqual(harness.actions, []);
    });
  }
});

test("confirmed submission is single-flight and uses one stable key through rerender-like repeated activation", async () => {
  const pending = deferred();
  const calls = [];
  const harness = createHarness({
    submitAttempt: (args) => {
      calls.push(args);
      return pending.promise;
    },
  });

  const first = harness.controller.submit();
  const second = harness.controller.submit();
  const third = harness.controller.submit();
  assert.strictEqual(first, second);
  assert.strictEqual(second, third);
  await Promise.resolve();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].idempotencyKey, "stable-submit-key-312");

  pending.resolve(harness.result);
  const outcome = await first;
  assert.equal(outcome.kind, "SUBMITTED");
  assert.equal(harness.actions.filter(({ type }) => type === "SUBMIT_STARTED").length, 1);
  assert.equal(harness.actions.filter(({ type }) => type === "SUBMIT_SUCCEEDED").length, 1);
  assert.equal(harness.calls.filter(({ name }) => name === "getAttemptResult").length, 0);
  assert.equal(harness.calls.filter(({ name }) => name === "getProgress").length, 1);
  assert.equal(harness.calls.find(({ name }) => name === "getProgress").args.classroomId, 47);
});

test("a transient submit failure preserves the attempt and retries with the same idempotency key", async () => {
  const keys = [];
  let attempt = 0;
  const failure = Object.assign(new Error("Offline"), { code: "NETWORK_ERROR" });
  const harness = createHarness({
    submitAttempt: async ({ idempotencyKey }) => {
      keys.push(idempotencyKey);
      attempt += 1;
      if (attempt === 1) throw failure;
      return harness.result;
    },
  });

  const failed = await harness.controller.submit();
  assert.equal(failed.kind, "FAILED");
  assert.equal(harness.actions.at(-1).type, "SUBMIT_FAILED");
  const retried = await harness.controller.submit();
  assert.equal(retried.kind, "SUBMITTED");
  assert.deepEqual(keys, ["stable-submit-key-312", "stable-submit-key-312"]);
});

test("an already-submitted conflict recovers the same authoritative result once", async () => {
  const conflict = Object.assign(new Error("Already submitted"), {
    status: 409,
    code: "ATTEMPT_ALREADY_SUBMITTED",
  });
  const harness = createHarness({ submitAttempt: async () => { throw conflict; } });

  const outcome = await harness.controller.submit();
  assert.equal(outcome.kind, "SUBMITTED");
  assert.equal(outcome.recovered, true);
  assert.equal(harness.calls.filter(({ name }) => name === "getAttemptResult").length, 1);
  assert.equal(harness.calls.find(({ name }) => name === "getAttemptResult").args.attemptId, 312);
});

test("failed immutable recovery retries only the same result GET and never resubmits", async () => {
  const conflict = Object.assign(new Error("Already submitted"), {
    status: 409,
    code: "ATTEMPT_ALREADY_SUBMITTED",
  });
  let submitCalls = 0;
  let resultCalls = 0;
  const harness = createHarness({
    submitAttempt: async () => {
      submitCalls += 1;
      throw conflict;
    },
    getAttemptResult: async () => {
      resultCalls += 1;
      if (resultCalls === 1) throw Object.assign(new Error("Offline"), { code: "NETWORK_ERROR" });
      return harness.result;
    },
  });

  const failed = await harness.controller.submit();
  assert.equal(failed.kind, "RECOVERY_FAILED");
  assert.equal(harness.actions.at(-1).type, "SUBMIT_RECOVERY_FAILED");

  const recovered = await harness.controller.retryResultRecovery();
  assert.equal(recovered.kind, "SUBMITTED");
  assert.equal(recovered.recovered, true);
  assert.equal(submitCalls, 1);
  assert.equal(resultCalls, 2);
});

test("malformed success payloads fail closed into result-only recovery", async () => {
  let resultCalls = 0;
  const harness = createHarness({
    submitAttempt: async () => ({}),
    getAttemptResult: async () => {
      resultCalls += 1;
      return resultCalls === 1 ? {} : harness.result;
    },
  });

  const failed = await harness.controller.submit();
  assert.equal(failed.kind, "RECOVERY_FAILED");
  assert.equal(harness.actions.at(-1).type, "SUBMIT_RECOVERY_FAILED");

  const recovered = await harness.controller.retryResultRecovery();
  assert.equal(recovered.kind, "SUBMITTED");
  assert.equal(resultCalls, 2);
});

test("stale submit and progression completions never dispatch into a changed route", async () => {
  const pending = deferred();
  const harness = createHarness({ submitAttempt: () => pending.promise });
  const operation = harness.controller.submit();
  harness.setCurrent(false);
  pending.resolve(harness.result);
  const outcome = await operation;
  assert.equal(outcome.kind, "STALE");
  assert.deepEqual(harness.actions, []);
  assert.equal(harness.calls.filter(({ name }) => name === "getProgress").length, 0);
});

test("attempt-scoped submission keys persist only opaque keys in session storage", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  let generated = 0;
  const store = createAttemptSubmissionKeyStore({
    storage,
    randomUUID: () => `12345678-1234-1234-1234-${String(++generated).padStart(12, "0")}`,
  });
  assert.equal(store.get(312), store.get(312));
  assert.notEqual(store.get(312), store.get(313));
  assert.deepEqual([...values.keys()], [
    "sharprunner:assessment-submit:312",
    "sharprunner:assessment-submit:313",
  ]);
});

test("authoritative submission completion emits one attempt-only tab invalidation callback", async () => {
  const submitted = [];
  const harness = createHarness({
    onSubmitted: (event) => submitted.push(event),
  });

  const outcome = await harness.controller.submit();
  assert.equal(outcome.kind, "SUBMITTED");
  assert.deepEqual(submitted, [{ attemptId: 312 }]);
});

test("a GRADING response polls bounded authoritative result state before completing", async () => {
  let resultReads = 0;
  const harness = createHarness({
    submitAttempt: async () => ({ result: { attemptId: 312, status: "GRADING" }, reviewAvailable: false }),
    getAttemptResult: async () => {
      resultReads += 1;
      return resultReads < 3
        ? { result: { attemptId: 312, status: "GRADING" }, reviewAvailable: false }
        : harness.result;
    },
    wait: async () => {},
    gradingPollDelays: [1, 2, 3],
  });

  const outcome = await harness.controller.submit();
  assert.equal(outcome.kind, "SUBMITTED");
  assert.equal(resultReads, 3);
  assert.equal(harness.actions.some(({ type }) => type === "SUBMIT_GRADING_STARTED"), true);
  assert.equal(harness.actions.at(-2).type, "SUBMIT_SUCCEEDED");
});

test("grading polling safely retries reservation after its bounded schedule", async () => {
  let resultReads = 0;
  let submitCalls = 0;
  const harness = createHarness({
    submitAttempt: async () => {
      submitCalls += 1;
      return { result: { attemptId: 312, status: "GRADING" }, reviewAvailable: false };
    },
    getAttemptResult: async () => {
      resultReads += 1;
      return resultReads <= 2
        ? { result: { attemptId: 312, status: "GRADING" }, reviewAvailable: false }
        : harness.result;
    },
    wait: async () => {},
    gradingPollDelays: [1, 2],
  });

  const pending = await harness.controller.submit();
  assert.equal(pending.kind, "GRADING_PENDING");
  assert.equal(harness.actions.at(-1).type, "SUBMIT_GRADING_PENDING");
  const completed = await harness.controller.resumeGrading();
  assert.equal(completed.kind, "SUBMITTED");
  assert.equal(submitCalls, 2);
});

test("refresh recovery can begin in GRADING and a released lease becomes retryable submission", async () => {
  const released = Object.assign(new Error("Still active"), {
    status: 409,
    code: "ATTEMPT_IN_PROGRESS",
  });
  const harness = createHarness({
    getAttemptResult: async () => { throw released; },
    wait: async () => {},
    gradingPollDelays: [1],
  });

  const outcome = await harness.controller.resumeGrading();
  assert.equal(outcome.kind, "GRADING_RELEASED");
  assert.equal(harness.actions[0].type, "SUBMIT_GRADING_STARTED");
  assert.equal(harness.actions.at(-1).type, "SUBMIT_GRADING_RELEASED");
});
