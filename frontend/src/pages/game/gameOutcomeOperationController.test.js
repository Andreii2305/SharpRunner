import assert from "node:assert/strict";
import test from "node:test";
import {
  clearGameCompletionRequest,
  createGameOutcomeOperationController,
  disposeGameOutcomeOperationController,
  ensureGameOutcomeOperationController,
  getOrStartGameCompletionRequest,
  invalidateGameOutcomeForReset,
} from "./gameOutcomeOperationController.js";

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
};

const scopeA = { accountId: 7, classroomId: 11, levelIdentity: "arrays-1" };

const runCompletionFlow = async ({ operation, completion, loadProgress, updates }) => {
  try {
    const saved = await operation.wait(completion.promise);
    if (!saved.current) return;
    operation.apply(() => updates.push(["result", saved.value.result]));
    const progress = await operation.wait(loadProgress());
    if (!progress.current) return;
    operation.apply(() => updates.push(["xp", progress.value.xp]));
    operation.apply(() => updates.push(["grade", progress.value.grade]));
  } catch (error) {
    operation.apply(() => updates.push(["error", error.message]));
  } finally {
    operation.apply(() => updates.push(["loading", false]));
  }
};

const beginStoredCompletion = ({ controller, requestRef, startRequest, label, updates }) => {
  const operation = controller.begin();
  const request = getOrStartGameCompletionRequest(requestRef, startRequest);
  const flow = (async () => {
    try {
      const completion = await operation.wait(request);
      if (!completion.current) return;
      operation.apply(() => updates.push(["result", label, completion.value]));
    } catch (error) {
      operation.apply(() => updates.push(["error", label, error.message]));
    } finally {
      operation.apply(() => clearGameCompletionRequest(requestRef, request));
    }
  })();
  return { flow, request };
};

test("completion continuations are fenced after account classroom level changes or unmount", async () => {
  const invalidations = [
    (controller) => controller.setScope({ ...scopeA, accountId: 8 }),
    (controller) => controller.setScope({ ...scopeA, classroomId: 12 }),
    (controller) => controller.setScope({ ...scopeA, levelIdentity: "arrays-2" }),
    (controller) => controller.dispose(),
  ];

  for (const invalidate of invalidations) {
    const controller = createGameOutcomeOperationController();
    controller.setScope(scopeA);
    const operation = controller.begin();
    const completion = createDeferred();
    const updates = [];
    let progressRequests = 0;
    const flow = runCompletionFlow({
      operation,
      completion,
      loadProgress: async () => {
        progressRequests += 1;
        return { xp: 25, grade: "A" };
      },
      updates,
    });

    invalidate(controller);
    completion.resolve({ result: "saved" });
    await flow;

    assert.deepEqual(updates, []);
    assert.equal(progressRequests, 0);
  }
});

test("completion rejection cannot update stale error or loading state", async () => {
  const controller = createGameOutcomeOperationController();
  controller.setScope(scopeA);
  const operation = controller.begin();
  const completion = createDeferred();
  const updates = [];
  const flow = runCompletionFlow({
    operation,
    completion,
    loadProgress: async () => ({ xp: 25, grade: "A" }),
    updates,
  });

  controller.setScope({ ...scopeA, levelIdentity: "arrays-2" });
  completion.reject(new Error("save failed"));
  await flow;

  assert.deepEqual(updates, []);
});

test("failed-attempt responses and failures are fenced after invalidation", async () => {
  for (const outcome of ["resolve", "reject"]) {
    const controller = createGameOutcomeOperationController();
    controller.setScope(scopeA);
    const operation = controller.begin();
    const request = createDeferred();
    const updates = [];
    const flow = (async () => {
      try {
        const response = await operation.wait(request.promise);
        if (!response.current) return;
        operation.apply(() => updates.push(["attempts", response.value.attemptCount]));
      } catch (error) {
        operation.apply(() => updates.push(["error", error.message]));
      } finally {
        operation.apply(() => updates.push(["loading", false]));
      }
    })();

    controller.invalidate();
    if (outcome === "resolve") request.resolve({ attemptCount: 3 });
    else request.reject(new Error("attempt failed"));
    await flow;

    assert.deepEqual(updates, []);
  }
});

test("reset and external terminal transitions invalidate accepted outcomes", async () => {
  for (const reason of ["reset", "deadline", "access-revoked"]) {
    const controller = createGameOutcomeOperationController();
    controller.setScope(scopeA);
    const operation = controller.begin();
    const request = createDeferred();
    const updates = [];
    const flow = (async () => {
      const response = await operation.wait(request.promise);
      if (response.current) operation.apply(() => updates.push(reason));
    })();

    controller.invalidate();
    request.resolve({ ok: true });
    await flow;

    assert.deepEqual(updates, []);
  }
});

test("Reset detaches request A so request B starts independently and presents once", async () => {
  const controller = createGameOutcomeOperationController();
  controller.setScope(scopeA);
  const requestRef = { current: null };
  const requestA = createDeferred();
  const requestB = createDeferred();
  const updates = [];
  let starts = 0;
  const flowA = beginStoredCompletion({
    controller,
    requestRef,
    startRequest: () => {
      starts += 1;
      return requestA.promise;
    },
    label: "A",
    updates,
  });

  invalidateGameOutcomeForReset(controller, requestRef);
  const flowB = beginStoredCompletion({
    controller,
    requestRef,
    startRequest: () => {
      starts += 1;
      return requestB.promise;
    },
    label: "B",
    updates,
  });

  assert.equal(starts, 2);
  assert.notEqual(flowB.request, flowA.request);
  requestA.resolve("old completion");
  await flowA.flow;
  assert.deepEqual(updates, []);
  assert.equal(requestRef.current, flowB.request);

  requestB.resolve("new completion");
  await flowB.flow;
  assert.deepEqual(updates, [["result", "B", "new completion"]]);
  assert.equal(requestRef.current, null);
});

test("request A rejection after Reset cannot report an error or clear request B", async () => {
  const controller = createGameOutcomeOperationController();
  controller.setScope(scopeA);
  const requestRef = { current: null };
  const requestA = createDeferred();
  const requestB = createDeferred();
  const updates = [];
  const flowA = beginStoredCompletion({
    controller,
    requestRef,
    startRequest: () => requestA.promise,
    label: "A",
    updates,
  });

  invalidateGameOutcomeForReset(controller, requestRef);
  const flowB = beginStoredCompletion({
    controller,
    requestRef,
    startRequest: () => requestB.promise,
    label: "B",
    updates,
  });

  requestA.reject(new Error("old completion failed"));
  await flowA.flow;
  assert.deepEqual(updates, []);
  assert.equal(requestRef.current, flowB.request);

  requestB.resolve("new completion");
  await flowB.flow;
  assert.deepEqual(updates, [["result", "B", "new completion"]]);
});

test("request A settling after request B cannot alter B's completed presentation", async () => {
  const controller = createGameOutcomeOperationController();
  controller.setScope(scopeA);
  const requestRef = { current: null };
  const requestA = createDeferred();
  const requestB = createDeferred();
  const updates = [];
  const flowA = beginStoredCompletion({
    controller,
    requestRef,
    startRequest: () => requestA.promise,
    label: "A",
    updates,
  });

  invalidateGameOutcomeForReset(controller, requestRef);
  const flowB = beginStoredCompletion({
    controller,
    requestRef,
    startRequest: () => requestB.promise,
    label: "B",
    updates,
  });

  requestB.resolve("new completion");
  await flowB.flow;
  assert.deepEqual(updates, [["result", "B", "new completion"]]);
  assert.equal(requestRef.current, null);

  requestA.resolve("old completion");
  await flowA.flow;
  assert.deepEqual(updates, [["result", "B", "new completion"]]);
  assert.equal(requestRef.current, null);
});

test("a valid operation can finish its own terminal presentation and survives fullscreen pause", async () => {
  const controller = createGameOutcomeOperationController();
  controller.setScope(scopeA);
  const operation = controller.begin();
  const completion = createDeferred();
  const updates = [];
  let progressRequests = 0;
  const flow = runCompletionFlow({
    operation,
    completion,
    loadProgress: async () => {
      progressRequests += 1;
      return { xp: 25, grade: "A" };
    },
    updates,
  });

  // Fullscreen interruption changes permission, not outcome ownership.
  completion.resolve({ result: "saved" });
  await flow;

  assert.equal(progressRequests, 1);
  assert.deepEqual(updates, [
    ["result", "saved"],
    ["xp", 25],
    ["grade", "A"],
    ["loading", false],
  ]);
});

test("StrictMode cleanup invalidates the old controller and setup recreates a usable scope", () => {
  const controllerRef = { current: null };
  const firstController = ensureGameOutcomeOperationController(controllerRef, scopeA);
  const firstOperation = firstController.begin();

  disposeGameOutcomeOperationController(controllerRef, firstController);
  const secondController = ensureGameOutcomeOperationController(controllerRef, scopeA);
  const secondOperation = secondController.begin();

  assert.notEqual(secondController, firstController);
  assert.equal(firstOperation.isCurrent(), false);
  assert.equal(secondOperation.isCurrent(), true);
});
