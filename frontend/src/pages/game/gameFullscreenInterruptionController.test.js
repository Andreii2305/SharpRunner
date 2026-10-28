import assert from "node:assert/strict";
import test from "node:test";
import { createGameFullscreenInterruptionController } from "./gameFullscreenInterruptionController.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createEventTarget = (initial = {}) => {
  const listeners = new Map();
  return {
    ...initial,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type) {
      for (const listener of listeners.get(type) ?? []) listener();
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
  };
};

const createHarness = ({ supported = true } = {}) => {
  const states = [];
  let exitCalls = 0;
  let exitResult = Promise.resolve();
  const documentTarget = createEventTarget({
    fullscreenEnabled: supported,
    fullscreenElement: null,
    visibilityState: "visible",
    exitFullscreen() {
      exitCalls += 1;
      return exitResult;
    },
  });
  const boundary = supported
    ? { requestFullscreen() { return Promise.resolve(); } }
    : {};
  const controller = createGameFullscreenInterruptionController({
    documentTarget,
    onStateChange(state) { states.push(state); },
  });

  return {
    boundary,
    controller,
    documentTarget,
    states,
    get state() { return controller.getState(); },
    get exitCalls() { return exitCalls; },
    setExitResult(result) { exitResult = result; },
    setScope(overrides = {}) {
      return controller.setScope({
        accountId: 7,
        classroomId: 11,
        levelIdentity: "array:3",
        element: boundary,
        ...overrides,
      });
    },
  };
};

const enterFullscreen = async (harness) => {
  const operation = harness.controller.continueGameplay();
  harness.documentTarget.fullscreenElement = harness.boundary;
  harness.documentTarget.emit("fullscreenchange");
  await operation;
};

test("a new level scope starts gated without counting an interruption", () => {
  const harness = createHarness();
  harness.setScope();

  assert.deepEqual(harness.state, {
    status: "gated",
    gameplayPermitted: false,
    interruptionCount: 0,
    interruptionReason: null,
    error: null,
  });
  assert.equal(harness.documentTarget.listenerCount("fullscreenchange"), 1);
  assert.equal(harness.documentTarget.listenerCount("visibilitychange"), 1);
  harness.controller.dispose();
});

test("initial hidden state and blur do not count as gameplay interruptions", () => {
  const harness = createHarness();
  harness.documentTarget.visibilityState = "hidden";
  harness.setScope();
  harness.documentTarget.emit("visibilitychange");
  harness.documentTarget.emit("blur");

  assert.equal(harness.state.interruptionCount, 0);
  assert.equal(harness.state.gameplayPermitted, false);
  assert.equal(harness.documentTarget.listenerCount("blur"), 0);
  harness.controller.dispose();
});

test("Continue invokes fullscreen synchronously and duplicate actions share one request", async () => {
  const harness = createHarness();
  const request = deferred();
  let requestCalls = 0;
  let invoked = false;
  harness.boundary.requestFullscreen = () => {
    invoked = true;
    requestCalls += 1;
    return request.promise;
  };
  harness.setScope();

  const first = harness.controller.continueGameplay();
  assert.equal(invoked, true);
  assert.equal(harness.state.status, "requesting");
  const second = harness.controller.continueGameplay();
  assert.equal(first, second);
  assert.equal(requestCalls, 1);

  harness.documentTarget.fullscreenElement = harness.boundary;
  harness.documentTarget.emit("fullscreenchange");
  request.resolve();
  assert.equal(await first, true);
  assert.equal(harness.state.gameplayPermitted, true);
  harness.controller.dispose();
});

test("Continue resumes directly when the exact boundary remains fullscreen", async () => {
  const harness = createHarness();
  let requestCalls = 0;
  harness.boundary.requestFullscreen = () => {
    requestCalls += 1;
    return Promise.resolve();
  };
  harness.setScope();
  await enterFullscreen(harness);

  harness.documentTarget.visibilityState = "hidden";
  harness.documentTarget.emit("visibilitychange");
  harness.documentTarget.visibilityState = "visible";
  harness.documentTarget.emit("visibilitychange");
  assert.equal(harness.state.gameplayPermitted, false);

  assert.equal(await harness.controller.continueGameplay(), true);
  assert.equal(requestCalls, 1);
  assert.equal(harness.state.gameplayPermitted, true);
  assert.equal(harness.state.interruptionCount, 1);
  harness.controller.dispose();
});

test("unsupported and rejected fullscreen requests leave gameplay paused", async (t) => {
  await t.test("unsupported", () => {
    const harness = createHarness({ supported: false });
    harness.setScope();
    assert.equal(harness.state.status, "unsupported");
    assert.equal(harness.controller.continueGameplay(), null);
    assert.equal(harness.state.gameplayPermitted, false);
    harness.controller.dispose();
  });

  await t.test("rejected", async () => {
    const harness = createHarness();
    harness.boundary.requestFullscreen = () => Promise.reject(new Error("denied"));
    harness.setScope();
    assert.equal(await harness.controller.continueGameplay(), false);
    assert.equal(harness.state.status, "error");
    assert.equal(harness.state.gameplayPermitted, false);
    assert.equal(harness.state.interruptionCount, 0);
    harness.controller.dispose();
  });

  await t.test("synchronous exception", async () => {
    const harness = createHarness();
    harness.boundary.requestFullscreen = () => { throw new Error("denied"); };
    harness.setScope();
    assert.equal(await harness.controller.continueGameplay(), false);
    assert.equal(harness.state.status, "error");
    assert.equal(harness.state.gameplayPermitted, false);
    harness.controller.dispose();
  });
});

test("fullscreen loss and hidden events coalesce into one interruption episode", async () => {
  const harness = createHarness();
  harness.setScope();
  await enterFullscreen(harness);

  harness.documentTarget.fullscreenElement = null;
  harness.documentTarget.emit("fullscreenchange");
  harness.documentTarget.visibilityState = "hidden";
  harness.documentTarget.emit("visibilitychange");
  harness.documentTarget.emit("visibilitychange");

  assert.equal(harness.state.gameplayPermitted, false);
  assert.equal(harness.state.interruptionCount, 1);
  assert.equal(harness.state.interruptionReason, "fullscreen-exit");

  harness.documentTarget.visibilityState = "visible";
  harness.documentTarget.emit("visibilitychange");
  assert.equal(harness.state.gameplayPermitted, false);
  assert.equal(harness.state.interruptionCount, 1);
  harness.controller.dispose();
});

test("a hidden transition counts once and visibility return never resumes automatically", async () => {
  const harness = createHarness();
  harness.setScope();
  await enterFullscreen(harness);

  harness.documentTarget.visibilityState = "hidden";
  harness.documentTarget.emit("visibilitychange");
  harness.documentTarget.visibilityState = "visible";
  harness.documentTarget.emit("visibilitychange");

  assert.equal(harness.state.interruptionCount, 1);
  assert.equal(harness.state.interruptionReason, "hidden");
  assert.equal(harness.state.gameplayPermitted, false);
  harness.controller.dispose();
});

test("a successful continuation arms exactly one new counting episode", async () => {
  const harness = createHarness();
  harness.setScope();
  await enterFullscreen(harness);
  harness.documentTarget.fullscreenElement = null;
  harness.documentTarget.emit("fullscreenchange");

  await enterFullscreen(harness);
  harness.documentTarget.fullscreenElement = null;
  harness.documentTarget.emit("fullscreenchange");

  assert.equal(harness.state.interruptionCount, 2);
  harness.controller.dispose();
});

test("an owned exit is single-flight and actual fullscreen loss creates one interruption", async () => {
  const harness = createHarness();
  harness.setScope();
  await enterFullscreen(harness);
  const exit = deferred();
  harness.setExitResult(exit.promise);

  const first = harness.controller.exitFullscreen();
  const second = harness.controller.exitFullscreen();
  assert.equal(first, second);
  assert.equal(harness.exitCalls, 1);

  harness.documentTarget.fullscreenElement = null;
  harness.documentTarget.emit("fullscreenchange");
  exit.resolve();
  assert.equal(await first, true);
  assert.equal(harness.state.gameplayPermitted, false);
  assert.equal(harness.state.interruptionCount, 1);
  harness.controller.dispose();
});

test("failed owned exits follow browser state and remain retryable", async (t) => {
  for (const [name, failure] of [
    ["synchronous", () => { throw new Error("exit failed"); }],
    ["rejected", () => Promise.reject(new Error("exit failed"))],
  ]) {
    await t.test(name, async () => {
      const harness = createHarness();
      harness.setScope();
      await enterFullscreen(harness);
      harness.documentTarget.exitFullscreen = failure;

      assert.equal(await harness.controller.exitFullscreen(), false);
      assert.equal(harness.state.gameplayPermitted, true);
      assert.equal(harness.state.status, "permitted");
      assert.match(harness.state.error, /could not exit/i);
      assert.equal(harness.state.interruptionCount, 0);
      harness.documentTarget.fullscreenElement = null;
      harness.controller.dispose();
    });
  }
});

test("an external exact-boundary session can resume gameplay but is never exited as owned", async () => {
  const harness = createHarness();
  harness.setScope();
  harness.documentTarget.fullscreenElement = harness.boundary;
  harness.documentTarget.emit("fullscreenchange");

  assert.equal(await harness.controller.continueGameplay(), true);
  assert.equal(harness.state.gameplayPermitted, true);
  assert.equal(harness.controller.exitFullscreen(), null);
  harness.controller.dispose();
  assert.equal(harness.exitCalls, 0);
});

test("scope changes fence stale entry completion and reset the scoped count", async () => {
  const harness = createHarness();
  const oldRequest = deferred();
  harness.boundary.requestFullscreen = () => oldRequest.promise;
  harness.setScope();
  const oldOperation = harness.controller.continueGameplay();

  harness.setScope({ levelIdentity: "array:4" });
  const settledState = harness.state;
  harness.documentTarget.fullscreenElement = harness.boundary;
  harness.documentTarget.emit("fullscreenchange");
  oldRequest.resolve();

  assert.equal(await oldOperation, false);
  assert.deepEqual(harness.state, settledState);
  assert.equal(harness.state.interruptionCount, 0);
  assert.equal(harness.exitCalls, 0);
  harness.controller.dispose();
});

test("stale entry completion never claims or exits a newer external same-boundary session", async () => {
  const harness = createHarness();
  const oldRequest = deferred();
  harness.boundary.requestFullscreen = () => oldRequest.promise;
  harness.setScope();
  const oldOperation = harness.controller.continueGameplay();

  harness.controller.invalidate();
  harness.documentTarget.fullscreenElement = harness.boundary;
  harness.documentTarget.emit("fullscreenchange");
  oldRequest.resolve();
  await oldOperation;
  harness.controller.dispose();

  assert.equal(harness.exitCalls, 0);
});

test("stale entry completion cannot replace a newer controller-owned same-boundary session", async () => {
  const harness = createHarness();
  const oldRequest = deferred();
  const newRequest = deferred();
  let requests = 0;
  harness.boundary.requestFullscreen = () => {
    requests += 1;
    return requests === 1 ? oldRequest.promise : newRequest.promise;
  };
  harness.setScope();
  const oldOperation = harness.controller.continueGameplay();
  harness.setScope({ levelIdentity: "array:4" });
  const newOperation = harness.controller.continueGameplay();

  harness.documentTarget.fullscreenElement = harness.boundary;
  harness.documentTarget.emit("fullscreenchange");
  newRequest.resolve();
  assert.equal(await newOperation, true);
  oldRequest.resolve();
  assert.equal(await oldOperation, false);

  harness.controller.dispose();
  assert.equal(harness.exitCalls, 1);
});

test("intentional scope cleanup never counts its fullscreen exit as an interruption", async () => {
  const harness = createHarness();
  harness.setScope();
  await enterFullscreen(harness);

  harness.controller.invalidate();
  harness.documentTarget.fullscreenElement = null;
  harness.documentTarget.emit("fullscreenchange");

  assert.equal(harness.state.interruptionCount, 0);
  assert.equal(harness.state.gameplayPermitted, false);
  harness.controller.dispose();
});

test("dispose removes listeners, fences completion, and exits only an established owned session", async (t) => {
  await t.test("owned session", async () => {
    const harness = createHarness();
    harness.setScope();
    await enterFullscreen(harness);
    harness.controller.dispose();
    assert.equal(harness.exitCalls, 1);
    assert.equal(harness.documentTarget.listenerCount("fullscreenchange"), 0);
    assert.equal(harness.documentTarget.listenerCount("visibilitychange"), 0);
  });

  await t.test("pending session", async () => {
    const harness = createHarness();
    const request = deferred();
    harness.boundary.requestFullscreen = () => request.promise;
    harness.setScope();
    const operation = harness.controller.continueGameplay();
    harness.controller.dispose();
    harness.documentTarget.fullscreenElement = harness.boundary;
    request.resolve();
    assert.equal(await operation, false);
    assert.equal(harness.exitCalls, 0);
  });

  await t.test("external session", () => {
    const harness = createHarness();
    harness.setScope();
    harness.documentTarget.fullscreenElement = harness.boundary;
    harness.documentTarget.emit("fullscreenchange");
    harness.controller.dispose();
    assert.equal(harness.exitCalls, 0);
  });
});

test("cleanup exit handles synchronous and rejected failures without an unhandled rejection", async (t) => {
  for (const [name, failure] of [
    ["synchronous", () => { throw new Error("exit failed"); }],
    ["rejected", () => Promise.reject(new Error("exit failed"))],
  ]) {
    await t.test(name, async () => {
      const harness = createHarness();
      harness.setScope();
      await enterFullscreen(harness);
      harness.documentTarget.exitFullscreen = failure;
      harness.controller.dispose();
      await Promise.resolve();
      await Promise.resolve();
    });
  }
});
