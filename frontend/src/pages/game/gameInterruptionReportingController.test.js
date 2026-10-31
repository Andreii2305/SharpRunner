import assert from "node:assert/strict";
import { test } from "node:test";
import { createGameInterruptionReportingController } from "./gameInterruptionReportingController.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

const sessionPayload = (overrides = {}) => ({
  changed: true,
  session: {
    id: 41,
    classroomId: 7,
    levelKey: "arrays-1",
    lifecycleStatus: "CURRENT",
    startedAt: "2026-10-30T00:00:00.000Z",
    supersededAt: null,
    completedAt: null,
    scoreDeductionSnapshot: 0,
    xpDeductionSnapshot: 0,
    createdAt: "2026-10-30T00:00:00.000Z",
    ...overrides,
  },
});

const eventPayload = ({ id = 101, type = "hidden", changed = true } = {}) => ({
  changed,
  event: {
    id,
    sessionId: 41,
    classroomId: 7,
    levelKey: "arrays-1",
    eventType: type,
    receivedAt: "2026-10-30T00:01:00.000Z",
  },
});

const setup = (overrides = {}) => {
  let nextKey = 0;
  const sessionCalls = [];
  const eventCalls = [];
  const controller = createGameInterruptionReportingController({
    startSession: async (input) => {
      sessionCalls.push(input);
      return sessionPayload();
    },
    recordEvent: async (input) => {
      eventCalls.push(input);
      return eventPayload({ id: 100 + eventCalls.length, type: input.eventType });
    },
    createKey: (kind) => `${kind}_key_${String(++nextKey).padStart(4, "0")}`,
    ...overrides,
  });
  controller.setScope({ accountId: 3, classroomId: 7, levelKey: "arrays-1" });
  return { controller, sessionCalls, eventCalls };
};

test("session creation is single-flight, preserves zero snapshots, and retries a stable key", async () => {
  const first = deferred();
  const calls = [];
  const { controller } = setup({
    startSession: (input) => {
      calls.push(input);
      return calls.length === 1 ? first.promise : Promise.resolve(sessionPayload());
    },
  });

  const a = controller.startSession();
  const b = controller.startSession();
  assert.equal(a, b);
  assert.equal(calls.length, 1);
  first.reject(new Error("offline"));
  assert.equal(await a, false);
  assert.equal(controller.getState().sessionStatus, "uncertain");

  assert.equal(await controller.retrySession(), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].sessionKey, calls[1].sessionKey);
  assert.equal(calls[0].classroomId, calls[1].classroomId);
  assert.equal(controller.getState().session.scoreDeductionSnapshot, 0);
  assert.equal(controller.getState().session.xpDeductionSnapshot, 0);
});

test("events queue before session creation and serialize delivery with stable acknowledgement retries", async () => {
  const start = deferred();
  const firstEvent = deferred();
  const eventCalls = [];
  const { controller } = setup({
    startSession: () => start.promise,
    recordEvent: (input) => {
      eventCalls.push(input);
      return eventCalls.length === 1 ? firstEvent.promise : Promise.resolve(
        eventPayload({ id: 101 + eventCalls.length, type: input.eventType }),
      );
    },
  });

  const starting = controller.startSession();
  assert.equal(controller.acceptInterruption({ type: "fullscreen_exit" }), true);
  assert.equal(controller.acceptInterruption({ type: "hidden" }), true);
  assert.equal(eventCalls.length, 0);
  start.resolve(sessionPayload());
  assert.equal(await starting, true);
  await Promise.resolve();
  assert.equal(eventCalls.length, 1);

  firstEvent.reject(new Error("offline"));
  await Promise.resolve();
  assert.equal(controller.getState().deliveryStatus, "uncertain");
  const retainedKey = eventCalls[0].eventKey;
  await controller.retryEvents();
  assert.equal(eventCalls[1].eventKey, retainedKey);
  assert.equal(eventCalls[1].eventType, "fullscreen_exit");
  assert.equal(eventCalls[1].sessionId, 41);
  await Promise.resolve();
  assert.equal(eventCalls.length, 3);
  assert.equal(eventCalls[2].eventType, "hidden");
});

test("response identity mismatches and non-current sessions are surfaced without delivery", async () => {
  const mismatch = setup({
    startSession: async () => sessionPayload({ classroomId: 8 }),
  });
  mismatch.controller.acceptInterruption({ type: "hidden" });
  assert.equal(await mismatch.controller.startSession(), false);
  assert.equal(mismatch.controller.getState().sessionStatus, "error");
  assert.equal(mismatch.eventCalls.length, 0);

  const superseded = setup({
    startSession: async () => sessionPayload({ lifecycleStatus: "SUPERSEDED" }),
  });
  assert.equal(await superseded.controller.startSession(), false);
  assert.equal(superseded.controller.getState().sessionStatus, "terminal");
  assert.equal(superseded.controller.getState().session.lifecycleStatus, "SUPERSEDED");
  assert.equal(await superseded.controller.retrySession(), false);

  const completed = setup({
    startSession: async () => sessionPayload({ lifecycleStatus: "COMPLETED" }),
  });
  assert.equal(await completed.controller.startSession(), false);
  assert.equal(completed.controller.getState().sessionStatus, "terminal");
});

test("429 uses Retry-After once while network and 5xx retain events for stable-key retry", async () => {
  const timers = [];
  const calls = [];
  const rateLimited = Object.assign(new Error("limited"), {
    response: { status: 429, headers: { "retry-after": "2" }, data: { code: "INTERRUPTION_EVENT_RATE_LIMITED" } },
  });
  const serverError = Object.assign(new Error("server"), { response: { status: 503, data: { code: "SERVER_ERROR" } } });
  const { controller } = setup({
    setTimer: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
    clearTimer: () => {},
    recordEvent: async (input) => {
      calls.push(input);
      if (calls.length === 1) throw rateLimited;
      if (calls.length === 2) throw serverError;
      return eventPayload({ type: input.eventType, changed: false });
    },
  });
  await controller.startSession();
  controller.acceptInterruption({ type: "hidden" });
  await Promise.resolve();
  assert.equal(controller.getState().deliveryStatus, "rate-limited");
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 2000);
  timers[0].fn();
  await Promise.resolve();
  assert.equal(controller.getState().deliveryStatus, "uncertain");
  assert.equal(calls[0].eventKey, calls[1].eventKey);
  await controller.retryEvents();
  assert.equal(calls[1].eventKey, calls[2].eventKey);
  assert.equal(controller.getState().pendingCount, 0);
});

test("definitive authorization, terminal, and conflict errors remain visible with the event pending", async () => {
  for (const [status, code] of [
    [403, "FORBIDDEN"],
    [409, "SESSION_NOT_CURRENT"],
    [409, "EVENT_KEY_CONFLICT"],
  ]) {
    const error = Object.assign(new Error(code), { response: { status, data: { code, message: "Safe message" } } });
    const { controller } = setup({ recordEvent: async () => { throw error; } });
    await controller.startSession();
    controller.acceptInterruption({ type: "hidden" });
    await Promise.resolve();
    assert.equal(controller.getState().deliveryStatus, "error");
    assert.equal(controller.getState().deliveryError.code, code);
    assert.equal(controller.getState().pendingCount, 1);
  }
});

test("completion snapshots include in-flight events, never truncate, and are immutable", async () => {
  const pending = deferred();
  const { controller } = setup({ recordEvent: () => pending.promise });
  await controller.startSession();
  const empty = controller.getPendingCompletionSnapshot();
  assert.equal(empty.ready, true);
  assert.equal(empty.pendingCount, 0);
  assert.deepEqual(empty.entries, []);
  controller.acceptInterruption({ type: "hidden" });
  const one = controller.getPendingCompletionSnapshot();
  assert.equal(one.ready, true);
  assert.equal(one.entries.length, 1);
  assert.equal(one.entries[0].sessionId, 41);
  assert.equal(Object.isFrozen(one), true);
  assert.equal(Object.isFrozen(one.entries), true);
  assert.equal(Object.isFrozen(one.entries[0]), true);

  for (let index = 1; index < 100; index += 1) {
    controller.acceptInterruption({ type: index % 2 ? "fullscreen_exit" : "hidden" });
  }
  const hundred = controller.getPendingCompletionSnapshot();
  assert.equal(hundred.ready, true);
  assert.equal(hundred.entries.length, 100);
  controller.acceptInterruption({ type: "hidden" });
  const over = controller.getPendingCompletionSnapshot();
  assert.equal(over.ready, false);
  assert.equal(over.drainRequired, true);
  assert.equal(over.pendingCount, 101);
  assert.deepEqual(over.entries, []);
});

test("scope changes and disposal clear private state and fence late session and event completions", async () => {
  const oldSession = deferred();
  const oldEvent = deferred();
  let starts = 0;
  const { controller } = setup({
    startSession: () => (++starts === 1 ? oldSession.promise : Promise.resolve(sessionPayload({ classroomId: 8 }))),
    recordEvent: () => oldEvent.promise,
  });
  const starting = controller.startSession();
  controller.acceptInterruption({ type: "hidden" });
  controller.setScope({ accountId: 3, classroomId: 8, levelKey: "arrays-1" });
  oldSession.resolve(sessionPayload());
  assert.equal(await starting, false);
  assert.equal(controller.getState().pendingCount, 0);
  assert.equal(controller.getState().session, null);

  await controller.startSession();
  controller.acceptInterruption({ type: "hidden" });
  await Promise.resolve();
  controller.dispose();
  oldEvent.resolve(eventPayload());
  await Promise.resolve();
  assert.equal(controller.getState().pendingCount, 0);
  assert.equal(controller.getState().session, null);
});

test("completion lifecycle freezes intake and clears only after confirmed completion", async () => {
  const pending = deferred();
  const { controller } = setup({ recordEvent: () => pending.promise });
  await controller.startSession();
  controller.acceptInterruption({ type: "hidden" });
  const snapshot = controller.beginCompletion();
  assert.equal(snapshot.ready, true);
  assert.equal(controller.acceptInterruption({ type: "hidden" }), false);
  assert.equal(controller.confirmCompletion(snapshot), true);
  assert.equal(controller.getState().sessionStatus, "completed");
  assert.equal(controller.getState().pendingCount, 0);
  pending.resolve(eventPayload());
  await Promise.resolve();
  assert.equal(controller.getState().pendingCount, 0);
});

test("closing completion intake rejects later callbacks while an oversized queue keeps draining", async () => {
  const pending = deferred();
  const { controller } = setup({ recordEvent: () => pending.promise });
  await controller.startSession();
  for (let index = 0; index < 101; index += 1) {
    assert.equal(controller.acceptInterruption({ type: "hidden" }), true);
  }

  assert.equal(controller.closeIntakeForCompletion(), true);
  assert.equal(controller.acceptInterruption({ type: "fullscreen_exit" }), false);
  const snapshot = controller.beginCompletion();
  assert.equal(snapshot.ready, false);
  assert.equal(snapshot.drainRequired, true);
  assert.equal(controller.getState().intakeClosed, true);
  assert.equal(controller.getState().completionPending, false);

  assert.equal(controller.cancelCompletion(), true);
  assert.equal(controller.getState().intakeClosed, false);
  assert.equal(controller.acceptInterruption({ type: "fullscreen_exit" }), true);
});
