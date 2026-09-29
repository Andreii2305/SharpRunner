import assert from "node:assert/strict";
import test from "node:test";
import {
  assessmentReducer,
  createAssessmentState,
} from "./assessmentState.js";
import { createAssessmentPlayerController } from "./assessmentPlayerController.js";

const context = { routeKey: "47:arrays:post", requestGeneration: 9 };
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

const envelope = {
  assessment: {
    id: 91,
    lessonKey: "arrays",
    type: "POST",
    title: "Arrays post-test",
    instructions: "Choose the best answer.",
    version: 7,
    questions: [{
      id: 101,
      questionText: "Which declaration creates an array?",
      questionType: "MULTIPLE_CHOICE",
      points: 1,
      objectiveKey: "declare-arrays",
      choices: [
        { id: 1001, choiceText: "int[] values" },
        { id: 1002, choiceText: "int values" },
        { id: 1003, choiceText: "List values" },
      ],
    }, {
      id: 102,
      questionText: "Array indexes start at zero.",
      questionType: "TRUE_FALSE",
      points: 1,
      objectiveKey: "index-arrays",
      choices: [
        { id: 2001, choiceText: "True" },
        { id: 2002, choiceText: "False" },
      ],
    }],
  },
  attempt: {
    attemptId: 312,
    attemptNumber: 2,
    assessmentVersion: 7,
    status: "IN_PROGRESS",
    responses: [{ questionId: 101, selectedChoiceId: 1001 }],
  },
};

const createHarness = (saveResponse, overrides = {}) => {
  let state = assessmentReducer(
    createAssessmentState(context),
    { type: "ATTEMPT_LOADED", payload: envelope, ...context },
  );
  const dispatch = (action) => { state = assessmentReducer(state, action); };
  const controller = createAssessmentPlayerController({
    attemptId: 312,
    initialSavedByQuestion: state.savedByQuestion,
    saveResponse,
    dispatch,
    getState: () => state,
    onSaved: overrides.onSaved,
    ...context,
  });
  return { controller, dispatch, getState: () => state };
};

test("integrated selection keeps the latest B-to-C choice dirty until C is acknowledged", async () => {
  const requests = [];
  const harness = createHarness((request) => {
    const pending = deferred();
    requests.push({ request, pending });
    return pending.promise;
  });

  harness.controller.selectChoice(101, 1002);
  assert.equal(harness.getState().selectedByQuestion[101], 1002);
  assert.equal(harness.getState().saveStateByQuestion[101].status, "saving");

  harness.controller.selectChoice(101, 1003);
  assert.equal(harness.getState().selectedByQuestion[101], 1003);
  assert.equal(requests.length, 1);

  requests[0].pending.resolve({ response: { selectedChoiceId: 1002 } });
  await nextTurn();
  assert.equal(harness.getState().selectedByQuestion[101], 1003);
  assert.notEqual(harness.getState().saveStateByQuestion[101].status, "clean");
  assert.equal(requests.length, 2);
  assert.equal(requests[1].request.selectedChoiceId, 1003);

  requests[1].pending.resolve({ response: { selectedChoiceId: 1003 } });
  await harness.controller.flushAll();
  assert.equal(harness.getState().savedByQuestion[101], 1003);
  assert.equal(harness.getState().saveStateByQuestion[101].status, "clean");
  harness.controller.dispose();
});

test("returning to the original saved answer during a pending save persists the restored value", async () => {
  const requests = [];
  const harness = createHarness((request) => {
    const pending = deferred();
    requests.push({ request, pending });
    return pending.promise;
  });

  harness.controller.selectChoice(101, 1002);
  harness.controller.selectChoice(101, 1001);
  assert.equal(harness.getState().selectedByQuestion[101], 1001);
  assert.equal(harness.getState().saveStateByQuestion[101].status, "saving");
  requests[0].pending.resolve({ response: { selectedChoiceId: 1002 } });
  await nextTurn();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].request.selectedChoiceId, 1001);
  requests[1].pending.resolve({ response: { selectedChoiceId: 1001 } });
  await harness.controller.flushAll();
  assert.equal(harness.getState().saveStateByQuestion[101].status, "clean");
  harness.controller.dispose();
});

test("returning to saved A requires a corrective A write when the obsolete B request fails", async () => {
  const requests = [];
  const harness = createHarness((request) => {
    const pending = deferred();
    requests.push({ request, pending });
    return pending.promise;
  });
  const failure = Object.assign(new Error("Offline"), { code: "NETWORK_ERROR" });

  harness.controller.selectChoice(101, 1002);
  harness.controller.selectChoice(101, 1001);
  requests[0].pending.reject(failure);
  await assert.rejects(harness.controller.flushAll(), (error) => error === failure);

  assert.equal(requests.length, 1);
  assert.equal(harness.getState().selectedByQuestion[101], 1001);
  assert.equal(harness.getState().savedByQuestion[101], 1001);
  assert.equal(harness.getState().saveStateByQuestion[101].status, "error");
  assert.equal(harness.controller.retrySave(101), true);
  assert.equal(requests[1].request.selectedChoiceId, 1001);
  requests[1].pending.resolve({ response: { selectedChoiceId: 1001 } });
  await harness.controller.flushAll();
  assert.equal(harness.getState().saveStateByQuestion[101].status, "clean");
  harness.controller.dispose();
});

test("failed save preserves selection and explicit retry sends the current desired choice", async () => {
  const requests = [];
  const harness = createHarness((request) => {
    const pending = deferred();
    requests.push({ request, pending });
    return pending.promise;
  });
  const failure = Object.assign(new Error("Offline"), { code: "NETWORK_ERROR" });

  harness.controller.selectChoice(101, 1002);
  requests[0].pending.reject(failure);
  await assert.rejects(harness.controller.flushAll(), (error) => error === failure);
  assert.equal(harness.getState().selectedByQuestion[101], 1002);
  assert.equal(harness.getState().saveStateByQuestion[101].status, "error");

  harness.controller.selectChoice(101, 1003);
  assert.equal(harness.getState().selectedByQuestion[101], 1003);
  assert.equal(harness.getState().saveStateByQuestion[101].status, "error");
  assert.equal(requests.length, 1);
  assert.equal(harness.controller.retrySave(101), true);
  assert.equal(requests[1].request.selectedChoiceId, 1003);
  requests[1].pending.resolve({ response: { selectedChoiceId: 1003 } });
  await harness.controller.flushAll();
  assert.equal(harness.getState().saveStateByQuestion[101].status, "clean");
  harness.controller.dispose();
});

test("an in-flight B failure is attached to newer C so retry persists C", async () => {
  const requests = [];
  const harness = createHarness((request) => {
    const pending = deferred();
    requests.push({ request, pending });
    return pending.promise;
  });
  const failure = Object.assign(new Error("Offline"), { code: "NETWORK_ERROR" });

  harness.controller.selectChoice(101, 1002);
  harness.controller.selectChoice(101, 1003);
  requests[0].pending.reject(failure);
  await assert.rejects(harness.controller.flushAll(), (error) => error === failure);

  assert.equal(harness.getState().selectedByQuestion[101], 1003);
  assert.equal(harness.getState().saveStateByQuestion[101].status, "error");
  assert.equal(harness.controller.retrySave(101), true);
  assert.equal(requests[1].request.selectedChoiceId, 1003);
  requests[1].pending.resolve({ response: { selectedChoiceId: 1003 } });
  await harness.controller.flushAll();
  assert.equal(harness.getState().saveStateByQuestion[101].status, "clean");
  harness.controller.dispose();
});

test("immutable save conflict is distinct and cannot be bypassed by another selection", async () => {
  const pending = deferred();
  let requestCount = 0;
  const harness = createHarness(() => {
    requestCount += 1;
    return pending.promise;
  });
  const conflict = Object.assign(new Error("Attempt submitted"), {
    status: 409,
    code: "ATTEMPT_ALREADY_SUBMITTED",
  });

  harness.controller.selectChoice(101, 1002);
  pending.reject(conflict);
  await assert.rejects(harness.controller.flushAll(), (error) => error === conflict);
  assert.equal(harness.getState().saveStateByQuestion[101].status, "conflict");
  assert.equal(harness.controller.selectChoice(101, 1003), false);
  assert.equal(harness.getState().selectedByQuestion[101], 1002);
  assert.equal(harness.controller.retrySave(101), false);
  assert.equal(requestCount, 1);
  harness.controller.dispose();
});

test("an in-flight immutable conflict marks the latest desired selection for reload", async () => {
  const pending = deferred();
  const harness = createHarness(() => pending.promise);
  const conflict = Object.assign(new Error("Attempt submitted"), {
    status: 409,
    code: "ATTEMPT_ALREADY_SUBMITTED",
  });

  harness.controller.selectChoice(101, 1002);
  harness.controller.selectChoice(101, 1003);
  pending.reject(conflict);
  await assert.rejects(harness.controller.flushAll(), (error) => error === conflict);
  assert.equal(harness.getState().selectedByQuestion[101], 1003);
  assert.equal(harness.getState().saveStateByQuestion[101].status, "conflict");
  assert.equal(harness.controller.retrySave(101), false);
  assert.equal(harness.controller.selectChoice(102, 2001), false);
  assert.equal(harness.getState().selectedByQuestion[102], undefined);
  harness.controller.dispose();
});

test("a choice outside the active server question is rejected before persistence", () => {
  let requestCount = 0;
  const harness = createHarness(() => {
    requestCount += 1;
    return Promise.resolve();
  });

  assert.equal(harness.controller.selectChoice(101, 9999), false);
  assert.equal(requestCount, 0);
  assert.equal(harness.getState().selectedByQuestion[101], 1001);
  harness.controller.dispose();
});

test("answer edits are rejected during submit and resume only after an editable failure", () => {
  let requestCount = 0;
  const harness = createHarness(() => {
    requestCount += 1;
    return Promise.resolve({ response: { selectedChoiceId: 1002 } });
  });

  harness.dispatch({ type: "SUBMIT_STARTED", ...context });
  assert.equal(harness.controller.selectChoice(101, 1002), false);
  assert.equal(harness.controller.retrySave(101), false);
  assert.equal(requestCount, 0);

  harness.dispatch({
    type: "SUBMIT_FAILED",
    error: Object.assign(new Error("Offline"), { code: "NETWORK_ERROR" }),
    ...context,
  });
  assert.equal(harness.controller.selectChoice(101, 1002), true);
  assert.equal(requestCount, 1);
  harness.controller.dispose();
});

test("answer edits remain blocked after another tab invalidates local state", () => {
  let requestCount = 0;
  const harness = createHarness(() => {
    requestCount += 1;
    return Promise.resolve();
  });
  harness.dispatch({
    type: "SERVER_STATE_INVALIDATED",
    reason: "remote-change",
    ...context,
  });

  assert.equal(harness.controller.selectChoice(101, 1002), false);
  assert.equal(harness.controller.retrySave(101), false);
  assert.equal(requestCount, 0);
  harness.controller.dispose();
});

test("a successful authoritative save emits one non-sensitive tab invalidation callback", async () => {
  const saved = [];
  const harness = createHarness(
    async () => ({ response: { selectedChoiceId: 1002 } }),
    { onSaved: (event) => saved.push(event) },
  );

  assert.equal(harness.controller.selectChoice(101, 1002), true);
  await harness.controller.flushAll();
  assert.deepEqual(saved, [{ attemptId: 312 }]);
  harness.controller.dispose();
});
