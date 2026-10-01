import assert from "node:assert/strict";
import test from "node:test";
import { createAssessmentSaveCoordinator } from "./assessmentSaveCoordinator.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const nextTurn = () => new Promise((resolve) => setTimeout(resolve, 0));

test("one question has one in-flight PUT and rapid changes collapse to the latest value", async () => {
  const requests = [];
  const starts = [];
  const successes = [];
  const coordinator = createAssessmentSaveCoordinator({
    attemptId: 312,
    initialSavedByQuestion: { 101: 1001 },
    saveResponse: (request) => {
      const pending = deferred();
      requests.push({ request, pending });
      return pending.promise;
    },
    onSaveStarted: (event) => starts.push(event),
    onSaveSucceeded: (event) => successes.push(event),
  });

  coordinator.select(101, 1002);
  coordinator.select(101, 1003);
  coordinator.select(101, 1004);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].request, {
    attemptId: 312,
    questionId: 101,
    selectedChoiceId: 1002,
  });

  const flushed = coordinator.flushAll();
  requests[0].pending.resolve({ response: { selectedChoiceId: 1002 } });
  await nextTurn();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].request.selectedChoiceId, 1004);
  assert.equal(requests.some(({ request }) => request.selectedChoiceId === 1003), false);

  requests[1].pending.resolve({ response: { selectedChoiceId: 1004 } });
  await flushed;
  assert.equal(starts.length, 2);
  assert.equal(successes.length, 2);
  assert.deepEqual(coordinator.getSnapshot(101), {
    questionId: 101,
    desiredChoiceId: 1004,
    savedChoiceId: 1004,
    revision: 3,
    status: "clean",
    error: null,
  });
});

test("different questions save in parallel while identical selections are no-ops", async () => {
  const requests = [];
  const coordinator = createAssessmentSaveCoordinator({
    attemptId: 312,
    initialSavedByQuestion: { 101: 1001, 102: 2001 },
    saveResponse: (request) => {
      const pending = deferred();
      requests.push({ request, pending });
      return pending.promise;
    },
  });

  assert.equal(coordinator.select(101, 1001), false);
  coordinator.select(101, 1002);
  coordinator.select(102, 2002);
  assert.equal(requests.length, 2);
  assert.deepEqual(new Set(requests.map(({ request }) => request.questionId)), new Set([101, 102]));

  requests.forEach(({ request, pending }) => {
    pending.resolve({ response: { selectedChoiceId: request.selectedChoiceId } });
  });
  await coordinator.flushAll();
  assert.equal(coordinator.getSnapshot(101).status, "clean");
  assert.equal(coordinator.getSnapshot(102).status, "clean");
});

test("failed saves remain dirty, preserve the latest selection, and retry explicitly", async () => {
  const requests = [];
  const failures = [];
  const coordinator = createAssessmentSaveCoordinator({
    attemptId: 312,
    initialSavedByQuestion: { 101: 1001 },
    saveResponse: (request) => {
      const pending = deferred();
      requests.push({ request, pending });
      return pending.promise;
    },
    onSaveFailed: (event) => failures.push(event),
  });

  const networkError = Object.assign(new Error("Save failed"), { code: "NETWORK_ERROR" });
  coordinator.select(101, 1002);
  requests[0].pending.reject(networkError);
  await assert.rejects(coordinator.flushAll(), (error) => error === networkError);
  assert.equal(failures.length, 1);
  assert.deepEqual(coordinator.getSnapshot(101), {
    questionId: 101,
    desiredChoiceId: 1002,
    savedChoiceId: 1001,
    revision: 1,
    status: "error",
    error: networkError,
  });

  assert.equal(coordinator.select(101, 1002), false);
  assert.equal(requests.length, 1);
  assert.equal(coordinator.retry(101), true);
  assert.equal(requests.length, 2);
  requests[1].pending.resolve({ response: { selectedChoiceId: 1002 } });
  await coordinator.flushAll();
  assert.equal(coordinator.getSnapshot(101).status, "clean");
});

test("submitted or immutable conflicts are surfaced distinctly and are not retried", async () => {
  const pending = deferred();
  const conflicts = [];
  let requestCount = 0;
  const coordinator = createAssessmentSaveCoordinator({
    attemptId: 312,
    initialSavedByQuestion: { 101: 1001 },
    saveResponse: () => {
      requestCount += 1;
      return pending.promise;
    },
    onConflict: (event) => conflicts.push(event),
  });

  const conflict = Object.assign(new Error("Attempt already submitted"), {
    status: 409,
    code: "ATTEMPT_ALREADY_SUBMITTED",
  });
  coordinator.select(101, 1002);
  pending.reject(conflict);
  await assert.rejects(coordinator.flushAll(), (error) => error === conflict);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].error, conflict);
  assert.equal(coordinator.getSnapshot(101).status, "conflict");
  assert.equal(coordinator.retry(101), false);
  assert.equal(requestCount, 1);
});

test("reset and dispose prevent late completions from mutating a new attempt", async () => {
  const requests = [];
  const successes = [];
  const coordinator = createAssessmentSaveCoordinator({
    attemptId: 312,
    initialSavedByQuestion: { 101: 1001 },
    saveResponse: (request) => {
      const pending = deferred();
      requests.push({ request, pending });
      return pending.promise;
    },
    onSaveSucceeded: (event) => successes.push(event),
  });

  coordinator.select(101, 1002);
  coordinator.reset({ attemptId: 400, initialSavedByQuestion: { 101: 2001 } });
  requests[0].pending.resolve({ response: { selectedChoiceId: 1002 } });
  await nextTurn();
  assert.equal(successes.length, 0);
  assert.equal(coordinator.getSnapshot(101).savedChoiceId, 2001);

  coordinator.select(101, 2002);
  assert.equal(requests[1].request.attemptId, 400);
  coordinator.dispose();
  requests[1].pending.resolve({ response: { selectedChoiceId: 2002 } });
  await nextTurn();
  assert.equal(successes.length, 0);
  assert.equal(coordinator.select(101, 2003), false);
});

test("coding source autosave is debounced and sends only the latest source payload", async () => {
  const requests = [];
  const coordinator = createAssessmentSaveCoordinator({
    attemptId: 312,
    initialSavedSourceByQuestion: { 201: "return 0;" },
    saveResponse: async (request) => {
      requests.push(request);
      return { response: { questionId: request.questionId, sourceCode: request.sourceCode } };
    },
  });

  coordinator.updateSource(201, "return 1;", { debounceMs: 20 });
  coordinator.updateSource(201, "return 2;", { debounceMs: 20 });
  assert.equal(requests.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 30));
  await coordinator.flushAll();

  assert.deepEqual(requests, [{
    attemptId: 312,
    questionId: 201,
    sourceCode: "return 2;",
  }]);
  assert.deepEqual(coordinator.getSnapshot(201), {
    questionId: 201,
    desiredSourceCode: "return 2;",
    savedSourceCode: "return 2;",
    revision: 2,
    status: "clean",
    error: null,
  });
});

test("flush forces pending coding source to save and serializes later edits", async () => {
  const requests = [];
  const coordinator = createAssessmentSaveCoordinator({
    attemptId: 312,
    initialSavedSourceByQuestion: { 201: "" },
    saveResponse: (request) => {
      const pending = deferred();
      requests.push({ request, pending });
      return pending.promise;
    },
  });

  coordinator.updateSource(201, "first", { debounceMs: 60_000 });
  const firstFlush = coordinator.flushAll();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].request, {
    attemptId: 312,
    questionId: 201,
    sourceCode: "first",
  });

  coordinator.updateSource(201, "second", { debounceMs: 60_000 });
  requests[0].pending.resolve({ response: { sourceCode: "first" } });
  await nextTurn();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].request.sourceCode, "second");
  requests[1].pending.resolve({ response: { sourceCode: "second" } });
  await firstFlush;
  await coordinator.flushAll();
  assert.equal(coordinator.getSnapshot(201).status, "clean");
});
