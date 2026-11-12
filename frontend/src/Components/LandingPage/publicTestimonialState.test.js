import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers";

import {
  INITIAL_PUBLIC_TESTIMONIAL_STATE,
  createPublicTestimonialController,
  observeTestimonialLoop,
  subscribeToReducedMotion,
  testimonialMotionReducer,
  validatePublicTestimonialSnapshot,
} from "./publicTestimonialState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

const payload = (overrides = {}) => ({
  testimonials: [{
    id: 31,
    message: "A clear public testimonial.",
    displayName: "Anonymous user",
    approvedAt: "2026-11-04T00:00:00.000Z",
  }],
  page: 1,
  limit: 20,
  total: 1,
  totalPages: 1,
  ...overrides,
});

const eventTarget = () => {
  const listeners = new Map();
  return {
    visibilityState: "visible",
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    emit(type, event = {}) { for (const listener of listeners.get(type) ?? []) listener(event); },
    count(type) { return listeners.get(type)?.size ?? 0; },
  };
};

test("response validation accepts the exact public allowlist and pagination", () => {
  assert.deepEqual(validatePublicTestimonialSnapshot(payload()), payload());
  assert.deepEqual(validatePublicTestimonialSnapshot(payload({ testimonials: [], total: 0, totalPages: 1 })), {
    testimonials: [], page: 1, limit: 20, total: 0, totalPages: 1,
  });
});

test("response validation rejects malformed identities metadata and private fields", () => {
  const invalid = [
    payload({ page: 2 }),
    payload({ limit: 50 }),
    payload({ total: 0 }),
    payload({ totalPages: 2 }),
    payload({ testimonials: [{ ...payload().testimonials[0], authorUserId: 9 }] }),
    payload({ testimonials: [{ ...payload().testimonials[0], id: "31" }] }),
    payload({ testimonials: [{ ...payload().testimonials[0], message: "" }] }),
    payload({ testimonials: [{ ...payload().testimonials[0], approvedAt: "not-a-date" }] }),
  ];
  for (const value of invalid) {
    assert.throws(() => validatePublicTestimonialSnapshot(value), /Invalid public testimonial response/);
  }
});

test("mount refresh is single-flight and a successful refresh replaces the complete snapshot", async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const states = [];
  const controller = createPublicTestimonialController({
    load: () => (++calls === 1 ? first.promise : second.promise),
    onChange: (state) => states.push(state),
  });

  const initial = controller.activate();
  assert.equal(controller.refresh(), initial);
  first.resolve(payload());
  assert.equal(await initial, true);
  assert.equal(controller.getState().testimonials[0].id, 31);

  const refresh = controller.refresh();
  second.resolve(payload({ testimonials: [], total: 0, totalPages: 1 }));
  assert.equal(await refresh, true);
  assert.deepEqual(controller.getState(), {
    ...INITIAL_PUBLIC_TESTIMONIAL_STATE,
    status: "success",
    totalPages: 1,
  });
  assert.ok(states.length >= 4);
});

test("pageshow and a real hidden-to-visible return revalidate without overlap", async () => {
  const windowTarget = eventTarget();
  const documentTarget = eventTarget();
  const pending = [];
  const controller = createPublicTestimonialController({
    windowTarget,
    documentTarget,
    load: () => {
      const call = deferred();
      pending.push(call);
      return call.promise;
    },
  });

  const initial = controller.activate();
  windowTarget.emit("pageshow");
  documentTarget.emit("visibilitychange");
  assert.equal(pending.length, 1);
  pending[0].resolve(payload());
  await initial;

  documentTarget.visibilityState = "hidden";
  documentTarget.emit("visibilitychange");
  documentTarget.visibilityState = "visible";
  documentTarget.emit("visibilitychange");
  assert.equal(pending.length, 2);
  pending[1].resolve(payload());
  await new Promise((resolve) => setImmediate(resolve));
  windowTarget.emit("pageshow");
  assert.equal(pending.length, 3);
});

test("failed revalidation clears old testimonials and exposes a retryable error", async () => {
  let calls = 0;
  const controller = createPublicTestimonialController({
    load: async () => {
      calls += 1;
      if (calls === 1) return payload();
      throw new Error("offline");
    },
  });
  await controller.activate();
  assert.equal(await controller.refresh(), false);
  assert.equal(controller.getState().status, "error");
  assert.deepEqual(controller.getState().testimonials, []);
  assert.equal(controller.getState().error, "Testimonials are unavailable right now.");
});

test("dispose aborts requests removes listeners and fences late callbacks", async () => {
  const request = deferred();
  const windowTarget = eventTarget();
  const documentTarget = eventTarget();
  const states = [];
  let receivedSignal;
  const controller = createPublicTestimonialController({
    windowTarget,
    documentTarget,
    load: ({ signal }) => { receivedSignal = signal; return request.promise; },
    onChange: (state) => states.push(state),
  });
  const active = controller.activate();
  assert.equal(windowTarget.count("pageshow"), 1);
  assert.equal(documentTarget.count("visibilitychange"), 1);
  controller.dispose();
  assert.equal(receivedSignal.aborted, true);
  assert.equal(windowTarget.count("pageshow"), 0);
  assert.equal(documentTarget.count("visibilitychange"), 0);
  const count = states.length;
  request.resolve(payload());
  assert.equal(await active, false);
  assert.equal(states.length, count);
});

test("StrictMode-style replacement remains usable while the disposed controller stays fenced", async () => {
  const oldRequest = deferred();
  const oldStates = [];
  const oldController = createPublicTestimonialController({
    load: () => oldRequest.promise,
    onChange: (state) => oldStates.push(state),
  });
  const oldRun = oldController.activate();
  oldController.dispose();

  const replacement = createPublicTestimonialController({ load: async () => payload() });
  assert.equal(await replacement.activate(), true);
  assert.equal(replacement.getState().status, "success");

  const oldCount = oldStates.length;
  oldRequest.resolve(payload({ testimonials: [], total: 0, totalPages: 1 }));
  assert.equal(await oldRun, false);
  assert.equal(oldStates.length, oldCount);
});

test("motion state keeps explicit pause while hover and focus come and go", () => {
  let state = { userPaused: false, hovered: false, focusWithin: false, reducedMotion: false };
  state = testimonialMotionReducer(state, { type: "hover", value: true });
  assert.equal(state.motionPaused, true);
  state = testimonialMotionReducer(state, { type: "toggle-user-pause" });
  state = testimonialMotionReducer(state, { type: "hover", value: false });
  assert.equal(state.userPaused, true);
  assert.equal(state.motionPaused, true);
  state = testimonialMotionReducer(state, { type: "focus", value: true });
  state = testimonialMotionReducer(state, { type: "focus", value: false });
  assert.equal(state.motionPaused, true);
  state = testimonialMotionReducer(state, { type: "toggle-user-pause" });
  assert.equal(state.motionPaused, false);
  state = testimonialMotionReducer(state, { type: "reduced-motion", value: true });
  assert.equal(state.motionPaused, true);
});

test("reduced-motion subscription reacts while mounted and cleans up", () => {
  let listener;
  let removed;
  const values = [];
  const media = {
    matches: false,
    addEventListener(type, callback) { assert.equal(type, "change"); listener = callback; },
    removeEventListener(type, callback) { assert.equal(type, "change"); removed = callback; },
  };
  const cleanup = subscribeToReducedMotion({ media, onChange: (value) => values.push(value) });
  assert.deepEqual(values, [false]);
  listener({ matches: true });
  assert.deepEqual(values, [false, true]);
  cleanup();
  assert.equal(removed, listener);
});

test("loop measurement follows content width and disconnects its observer", () => {
  const properties = new Map();
  let observed = [];
  let disconnected = false;
  let callback;
  class Observer {
    constructor(next) { callback = next; }
    observe(node) { observed.push(node); }
    disconnect() { disconnected = true; }
  }
  const list = { getBoundingClientRect: () => ({ width: 1440.2 }) };
  const section = {};
  const track = { style: { setProperty: (name, value) => properties.set(name, value) } };

  const cleanup = observeTestimonialLoop({ list, track, section, ResizeObserverImpl: Observer });
  assert.deepEqual(observed, [list, section]);
  assert.equal(properties.get("--testimonial-loop-distance"), "1441px");
  assert.equal(properties.get("--testimonial-loop-duration"), `${1441 / 36}s`);
  callback();
  cleanup();
  assert.equal(disconnected, true);
});
