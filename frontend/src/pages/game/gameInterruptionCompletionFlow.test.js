import assert from "node:assert/strict";
import { test } from "node:test";
import * as completionLifecycle from "./gameInterruptionCompletionFlow.js";
import {
  createGameInterruptionCompletionFlow,
  validateGameCompletionResponseScope,
} from "./gameInterruptionCompletionFlow.js";
import { createGameInterruptionReportingController } from "./gameInterruptionReportingController.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

const scope = { accountId: 3, classroomId: 7, levelKey: "arrays-level-1" };
const completionPayload = (overrides = {}) => ({
  classroomId: scope.classroomId,
  levels: [{ levelKey: scope.levelKey, isCompleted: true, finalScore: 90 }],
  completionDeductions: null,
  ...overrides,
});
const readySnapshot = (entries = []) => Object.freeze({
  ready: true,
  drainRequired: false,
  pendingCount: entries.length,
  sessionId: 41,
  entries: Object.freeze(entries.map(Object.freeze)),
  scope: Object.freeze({ ...scope }),
  generation: 4,
});

const reportingHarness = ({ snapshots = [readySnapshot()] } = {}) => {
  let index = 0;
  return {
    closes: 0,
    confirms: [],
    cancels: 0,
    closeIntakeForCompletion() { this.closes += 1; return true; },
    beginCompletion() { return snapshots[Math.min(index++, snapshots.length - 1)]; },
    confirmCompletion(snapshot) { this.confirms.push(snapshot); return true; },
    cancelCompletion() { this.cancels += 1; return true; },
  };
};

test("StrictMode cleanup recreates a usable reporting and completion pair with the same session identity", async () => {
  assert.equal(typeof completionLifecycle.createGameInterruptionLifecycleController, "function");

  const sessionRequests = [];
  const completionRequests = [];
  const reportingUpdates = [];
  const completionUpdates = [];
  const completionSuccesses = [];
  const completionErrors = [];
  let keySequence = 0;
  const lifecycle = completionLifecycle.createGameInterruptionLifecycleController({
    createReportingController: createGameInterruptionReportingController,
    createCompletionFlow: createGameInterruptionCompletionFlow,
    createKey: (kind) => `${kind}_strict_${++keySequence}`,
  });
  const reportingOptions = {
    startSession: (input) => {
      const request = deferred();
      sessionRequests.push({ input, request });
      return request.promise;
    },
    recordEvent: async () => { throw new Error("not expected"); },
    onChange: (state) => reportingUpdates.push(state),
  };
  const completionOptions = {
    sendCompletion: (input) => {
      const request = deferred();
      completionRequests.push({ input, request });
      return request.promise;
    },
    validateResponse: (payload) => payload?.ok === true,
    onSuccess: (payload) => completionSuccesses.push(payload),
    onError: (error) => completionErrors.push(error),
    onChange: (state) => completionUpdates.push(state),
  };

  const first = lifecycle.setup({ scope, reportingOptions, completionOptions });
  const firstStart = first.reportingController.startSession();
  lifecycle.cleanup(first);

  const replacement = lifecycle.setup({ scope, reportingOptions, completionOptions });
  const replacementStart = replacement.reportingController.startSession();
  assert.notEqual(replacement.reportingController, first.reportingController);
  assert.notEqual(replacement.completionFlow, first.completionFlow);
  assert.equal(sessionRequests.length, 2);
  assert.equal(sessionRequests[0].input.sessionKey, sessionRequests[1].input.sessionKey);

  sessionRequests[0].request.resolve({
    changed: true,
    session: {
      id: 40,
      classroomId: scope.classroomId,
      levelKey: scope.levelKey,
      lifecycleStatus: "CURRENT",
      scoreDeductionSnapshot: 1,
      xpDeductionSnapshot: 10,
    },
  });
  assert.equal(await firstStart, false);
  assert.equal(replacement.reportingController.getState().sessionStatus, "starting");

  sessionRequests[1].request.resolve({
    changed: false,
    session: {
      id: 41,
      classroomId: scope.classroomId,
      levelKey: scope.levelKey,
      lifecycleStatus: "CURRENT",
      scoreDeductionSnapshot: 1,
      xpDeductionSnapshot: 10,
    },
  });
  assert.equal(await replacementStart, true);

  const completion = replacement.completionFlow.begin({
    activityId: "activity-strict",
    sourceCode: "int x = 1;",
  });
  assert.equal(completionRequests.length, 1);
  completionRequests[0].request.resolve(completionPayload({ ok: true }));
  assert.equal(await completion, true);
  assert.equal(replacement.reportingController.getState().sessionStatus, "completed");

  const reportingUpdateCount = reportingUpdates.length;
  const completionUpdateCount = completionUpdates.length;
  lifecycle.cleanup(replacement);
  assert.equal(lifecycle.getReportingController(), null);
  assert.equal(lifecycle.getCompletionFlow(), null);
  assert.equal(reportingUpdates.length, reportingUpdateCount);
  assert.equal(completionUpdates.length, completionUpdateCount);
  assert.equal(completionSuccesses.length, 1);
  assert.equal(completionErrors.length, 0);
});

test("stale lifecycle cleanup and callbacks cannot affect a replacement or reuse identity across scopes", async () => {
  const sessionRequests = [];
  const completionRequests = [];
  const reportingUpdates = [];
  const completionUpdates = [];
  const completionSuccesses = [];
  const completionErrors = [];
  let keySequence = 0;
  const lifecycle = completionLifecycle.createGameInterruptionLifecycleController({
    createReportingController: createGameInterruptionReportingController,
    createCompletionFlow: createGameInterruptionCompletionFlow,
    createKey: (kind) => `${kind}_scope_${++keySequence}`,
  });
  const options = () => ({
    reportingOptions: {
      startSession: (input) => {
        const request = deferred();
        sessionRequests.push({ input, request });
        return request.promise;
      },
      recordEvent: async () => { throw new Error("not expected"); },
      onChange: (state) => reportingUpdates.push(state),
    },
    completionOptions: {
      sendCompletion: (input) => {
        const request = deferred();
        completionRequests.push({ input, request });
        return request.promise;
      },
      validateResponse: (payload) => payload?.ok === true,
      onSuccess: (payload) => completionSuccesses.push(payload),
      onError: (error) => completionErrors.push(error),
      onChange: (state) => completionUpdates.push(state),
    },
  });

  const first = lifecycle.setup({ scope, ...options() });
  const firstStart = first.reportingController.startSession();
  lifecycle.cleanup(first);
  const replacement = lifecycle.setup({ scope, ...options() });
  const replacementStart = replacement.reportingController.startSession();

  const updatesBeforeOldFailure = reportingUpdates.length;
  sessionRequests[0].request.reject(new Error("old request failed"));
  assert.equal(await firstStart, false);
  assert.equal(reportingUpdates.length, updatesBeforeOldFailure);
  lifecycle.cleanup(first);
  assert.equal(lifecycle.getReportingController(), replacement.reportingController);
  assert.equal(lifecycle.getCompletionFlow(), replacement.completionFlow);

  sessionRequests[1].request.resolve({
    changed: true,
    session: {
      id: 42,
      classroomId: scope.classroomId,
      levelKey: scope.levelKey,
      lifecycleStatus: "CURRENT",
      scoreDeductionSnapshot: 1,
      xpDeductionSnapshot: 10,
    },
  });
  assert.equal(await replacementStart, true);
  const pendingCompletion = replacement.completionFlow.begin({
    activityId: "activity-unmount",
    sourceCode: "int y = 2;",
  });
  const completionUpdatesBeforeUnmount = completionUpdates.length;
  lifecycle.cleanup(replacement);
  completionRequests[0].request.resolve({ ok: true });
  assert.equal(await pendingCompletion, false);
  assert.equal(completionUpdates.length, completionUpdatesBeforeUnmount);
  assert.deepEqual(completionSuccesses, []);
  assert.deepEqual(completionErrors, []);

  const nextScope = { ...scope, classroomId: scope.classroomId + 1 };
  const next = lifecycle.setup({ scope: nextScope, ...options() });
  void next.reportingController.startSession();
  assert.notEqual(sessionRequests[1].input.sessionKey, sessionRequests[2].input.sessionKey);
  lifecycle.cleanup(next);
});

test("an uncertain completion retry reuses the exact frozen event batch and payload", async () => {
  const events = [{ sessionId: 41, eventKey: "event_key_0001", eventType: "hidden" }];
  const reporting = reportingHarness({ snapshots: [readySnapshot(events)] });
  const calls = [];
  const flow = createGameInterruptionCompletionFlow({
    reportingController: reporting,
    sendCompletion: async (payload) => {
      calls.push(payload);
      if (calls.length === 1) throw new Error("offline");
      return completionPayload();
    },
    validateResponse: (payload) => payload.levels?.[0]?.isCompleted === true,
  });
  flow.setScope(scope);

  assert.equal(await flow.begin({ activityId: "activity-1", sourceCode: "int x = 1;" }), false);
  assert.equal(flow.getState().status, "uncertain");
  assert.equal(await flow.retry(), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].activityId, calls[1].activityId);
  assert.equal(calls[0].sourceCode, calls[1].sourceCode);
  assert.equal(calls[0].interruptionEvents, calls[1].interruptionEvents);
  assert.deepEqual(calls[1].interruptionEvents, events);
  assert.equal(reporting.closes, 1);
  assert.equal(reporting.confirms.length, 1);
});

test("in-flight entries remain frozen and a completion request is single-flight", async () => {
  const request = deferred();
  const reporting = reportingHarness({
    snapshots: [readySnapshot([{ sessionId: 41, eventKey: "event_key_0002", eventType: "fullscreen_exit" }])],
  });
  let calls = 0;
  const flow = createGameInterruptionCompletionFlow({
    reportingController: reporting,
    sendCompletion: () => { calls += 1; return request.promise; },
    validateResponse: () => true,
  });
  flow.setScope(scope);
  const first = flow.begin({ activityId: "activity-2", sourceCode: "code" });
  const second = flow.retry();
  assert.equal(first, second);
  assert.equal(calls, 1);
  request.resolve(completionPayload({ ok: true }));
  assert.equal(await first, true);
});

test("a completed replay saves with an empty batch without creating or confirming a reporting session", async () => {
  const reporting = reportingHarness();
  const calls = [];
  const flow = createGameInterruptionCompletionFlow({
    reportingController: reporting,
    sendCompletion: async (payload) => { calls.push(payload); return completionPayload({ ok: true }); },
    validateResponse: () => true,
  });
  flow.setScope(scope);

  assert.equal(await flow.begin({
    activityId: "activity-replay",
    sourceCode: "code",
    reportingRequired: false,
  }), true);
  assert.deepEqual(calls[0].interruptionEvents, []);
  assert.equal(reporting.closes, 0);
  assert.equal(reporting.confirms.length, 0);
});

test("more than 100 pending events drain before a completion request starts", async () => {
  const blocked = Object.freeze({
    ...readySnapshot(), ready: false, drainRequired: true, pendingCount: 101, entries: Object.freeze([]),
  });
  const final = readySnapshot([{ sessionId: 41, eventKey: "event_key_0101", eventType: "hidden" }]);
  const reporting = reportingHarness({ snapshots: [blocked, final] });
  const calls = [];
  const flow = createGameInterruptionCompletionFlow({
    reportingController: reporting,
    sendCompletion: async (payload) => { calls.push(payload); return completionPayload({ ok: true }); },
    validateResponse: () => true,
  });
  flow.setScope(scope);

  assert.equal(await flow.begin({ activityId: "activity-3", sourceCode: "code" }), false);
  assert.equal(flow.getState().status, "draining");
  assert.equal(calls.length, 0);
  assert.equal(await flow.retry(), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].interruptionEvents, final.entries);
});

test("scope changes, reset, and disposal fence late completions without clearing reporting history", async () => {
  for (const invalidate of [
    (flow) => flow.setScope({ ...scope, classroomId: 8 }),
    (flow) => flow.reset(),
    (flow) => flow.dispose(),
  ]) {
    const request = deferred();
    const reporting = reportingHarness();
    const successes = [];
    const flow = createGameInterruptionCompletionFlow({
      reportingController: reporting,
      sendCompletion: () => request.promise,
      validateResponse: () => true,
      onSuccess: (payload) => successes.push(payload),
    });
    flow.setScope(scope);
    const completion = flow.begin({ activityId: "activity-4", sourceCode: "code" });
    invalidate(flow);
    request.resolve({ ok: true });
    assert.equal(await completion, false);
    assert.equal(successes.length, 0);
    assert.equal(reporting.confirms.length, 0);
  }
});

test("definitive failures retain the batch and invalid authoritative responses never confirm", async () => {
  const error = Object.assign(new Error("conflict"), {
    response: { status: 409, data: { code: "COMPLETION_INTEGRITY_ERROR", message: "Could not verify" } },
  });
  const reporting = reportingHarness();
  let calls = 0;
  const flow = createGameInterruptionCompletionFlow({
    reportingController: reporting,
    sendCompletion: async () => { calls += 1; if (calls === 1) throw error; return { ok: false }; },
    validateResponse: () => false,
  });
  flow.setScope(scope);
  assert.equal(await flow.begin({ activityId: "activity-5", sourceCode: "code" }), false);
  assert.equal(flow.getState().status, "error");
  assert.equal(flow.getState().error.code, "COMPLETION_INTEGRITY_ERROR");
  assert.equal(await flow.retry(), false);
  assert.equal(flow.getState().error.code, "INVALID_COMPLETION_RESPONSE");
  assert.equal(reporting.confirms.length, 0);
});

test("a correct-level completion from the wrong classroom cannot confirm or clear the frozen batch", async () => {
  const entries = [{ sessionId: 41, eventKey: "event_scope_0001", eventType: "hidden" }];
  const reporting = reportingHarness({ snapshots: [readySnapshot(entries)] });
  const calls = [];
  const successes = [];
  const responses = [
    {
      classroomId: 8,
      levels: [{ levelKey: scope.levelKey, isCompleted: true, finalScore: 90 }],
      completionDeductions: { classroomId: 8 },
    },
    {
      classroomId: scope.classroomId,
      levels: [{ levelKey: scope.levelKey, isCompleted: true, finalScore: 90 }],
      completionDeductions: { classroomId: 8 },
    },
  ];
  const flow = createGameInterruptionCompletionFlow({
    reportingController: reporting,
    sendCompletion: async (request) => {
      calls.push(request);
      return responses[calls.length - 1];
    },
    validateResponse: (payload, requestedScope) => {
      const completed = payload.levels?.find((level) => level.levelKey === requestedScope.levelKey);
      return completed?.isCompleted === true && Number.isFinite(Number(completed.finalScore));
    },
    onSuccess: (payload) => successes.push(payload),
  });
  flow.setScope(scope);

  assert.equal(await flow.begin({ activityId: "activity-scope", sourceCode: "code" }), false);
  assert.equal(flow.getState().error.code, "INVALID_COMPLETION_RESPONSE");
  assert.equal(reporting.confirms.length, 0);
  assert.equal(successes.length, 0);
  assert.equal(calls.length, 1);

  assert.equal(await flow.retry(), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].interruptionEvents, calls[1].interruptionEvents);
  assert.deepEqual(calls[1].interruptionEvents, entries);
  assert.equal(reporting.confirms.length, 1);
  assert.equal(successes.length, 1);
});

test("completion response scope rejects missing malformed and mismatched identities without permissive coercion", () => {
  const valid = completionPayload();
  assert.equal(validateGameCompletionResponseScope(valid, scope), true);
  assert.equal(validateGameCompletionResponseScope({ ...valid, classroomId: "7" }, scope), true);

  for (const classroomId of [undefined, null, true, 7.5, "", " 7 ", "07", "0x7", "7e0"]) {
    assert.equal(
      validateGameCompletionResponseScope({ ...valid, classroomId }, scope),
      false,
      `classroomId ${String(classroomId)} should be rejected`,
    );
  }
  assert.equal(validateGameCompletionResponseScope({
    ...valid,
    levels: [{ levelKey: "loops-level-1", isCompleted: true, finalScore: 90 }],
  }, scope), false);
  assert.equal(validateGameCompletionResponseScope({ ...valid, levels: null }, scope), false);
});

test("completed replay accepts exact response scope while preserving different evidence classroom and legacy null", async () => {
  for (const completionDeductions of [
    { classroomId: 99, eventCount: 2 },
    null,
  ]) {
    const reporting = reportingHarness();
    const successes = [];
    const flow = createGameInterruptionCompletionFlow({
      reportingController: reporting,
      sendCompletion: async () => completionPayload({ completionDeductions }),
      validateResponse: (payload, requestedScope) => {
        const completed = payload.levels?.find((level) => level.levelKey === requestedScope.levelKey);
        return completed?.isCompleted === true && Number.isFinite(Number(completed.finalScore));
      },
      onSuccess: (payload) => successes.push(payload),
    });
    flow.setScope(scope);

    assert.equal(await flow.begin({
      activityId: "activity-replay-scope",
      sourceCode: "code",
      reportingRequired: false,
    }), true);
    assert.equal(successes.length, 1);
    assert.equal(successes[0].completionDeductions, completionDeductions);
    assert.equal(reporting.confirms.length, 0);
  }
});
