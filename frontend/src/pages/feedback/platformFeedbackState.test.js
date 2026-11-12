import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlatformFeedbackController,
  initialPlatformFeedbackState,
} from "./platformFeedbackState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const listPayload = (page = 1, feedback = []) => ({
  feedback,
  page,
  limit: 20,
  total: feedback.length,
  totalPages: feedback.length ? 1 : 0,
});

const feedback = (id, message = "Saved feedback") => ({
  id,
  message,
  createdAt: "2026-11-04T00:00:00.000Z",
});

test("platform controller loads and pages authoritative own history", async () => {
  const calls = [];
  let state = initialPlatformFeedbackState();
  const controller = createPlatformFeedbackController({
    list: async (input) => { calls.push(input); return listPayload(input.page, [feedback(input.page)]); },
    submit: async () => { throw new Error("not used"); },
    onChange: (next) => { state = next; },
  });
  controller.setScope({ accountId: 7, eligible: true });
  await controller.load();
  assert.equal(state.status, "success");
  assert.equal(state.feedback[0].id, 1);
  assert.equal(controller.setPage(2), true);
  await controller.load();
  assert.equal(calls[1].page, 2);
  assert.equal(state.feedback[0].id, 2);
});

test("platform submission freezes normalized payload and key across uncertain and rate-limited retries", async () => {
  const attempts = [];
  let state = initialPlatformFeedbackState();
  const controller = createPlatformFeedbackController({
    list: async () => listPayload(),
    submit: async (input) => {
      attempts.push({ message: input.message, idempotencyKey: input.idempotencyKey });
      if (attempts.length === 1) throw new Error("network");
      if (attempts.length === 2) {
        const error = new Error("limited");
        error.response = { status: 429, headers: { "retry-after": "0" }, data: { code: "PLATFORM_FEEDBACK_RATE_LIMITED" } };
        throw error;
      }
      return { changed: false, feedback: feedback(9, input.message) };
    },
    createKey: () => "platform_stable_key",
    onChange: (next) => { state = next; },
  });
  controller.setScope({ accountId: 7, eligible: true });
  controller.updateMessage("  Keep this exact message  ");
  await controller.submit();
  assert.equal(state.mutationPhase, "uncertain");
  controller.updateMessage("Replacement");
  assert.equal(state.message, "Keep this exact message");
  await controller.retrySubmission();
  assert.equal(state.mutationPhase, "rate-limited");
  await controller.retrySubmission();
  assert.equal(state.mutationPhase, "success");
  assert.deepEqual(attempts, Array(3).fill({ message: "Keep this exact message", idempotencyKey: "platform_stable_key" }));
});

test("history pagination preserves an uncertain platform operation and its exact retry", async () => {
  const attempts = [];
  let state = initialPlatformFeedbackState();
  const controller = createPlatformFeedbackController({
    list: async ({ page }) => ({
      feedback: [feedback(page)],
      page,
      limit: 20,
      total: 40,
      totalPages: 2,
    }),
    submit: async (input) => {
      attempts.push({ message: input.message, idempotencyKey: input.idempotencyKey });
      if (attempts.length === 1) throw new Error("network");
      return { changed: false, feedback: feedback(9, input.message) };
    },
    createKey: () => "platform_paging_key",
    onChange: (next) => { state = next; },
  });
  controller.setScope({ accountId: 7, eligible: true });
  await controller.load();
  controller.updateMessage("  Frozen across pages  ");
  await controller.submit();
  assert.equal(state.mutationPhase, "uncertain");

  assert.equal(controller.setPage(2), true);
  assert.equal(state.mutationPhase, "uncertain");
  assert.equal(state.message, "Frozen across pages");
  await controller.load();
  assert.equal(state.page, 2);
  assert.equal(state.mutationPhase, "uncertain");
  assert.equal(controller.updateMessage("replacement"), false);
  assert.equal(await controller.submit(), false);

  await controller.retrySubmission();
  assert.equal(state.mutationPhase, "success");
  assert.deepEqual(attempts, Array(2).fill({
    message: "Frozen across pages",
    idempotencyKey: "platform_paging_key",
  }));
});

test("platform controller rejects invalid messages and overlapping mutations", async () => {
  const pending = deferred();
  let calls = 0;
  let state = initialPlatformFeedbackState();
  const controller = createPlatformFeedbackController({
    list: async () => listPayload(),
    submit: async () => { calls += 1; return pending.promise; },
    createKey: () => "platform_key_123",
    onChange: (next) => { state = next; },
  });
  controller.setScope({ accountId: 7, eligible: true });
  await controller.submit();
  assert.equal(state.mutationErrorKind, "validation");
  controller.updateMessage("x".repeat(1001));
  await controller.submit();
  assert.match(state.mutationError, /1,000/);
  controller.updateMessage("Valid");
  const first = controller.submit();
  const second = controller.submit();
  assert.equal(first, second);
  assert.equal(calls, 1);
  pending.resolve({ changed: true, feedback: feedback(1, "Valid") });
  await first;
});

test("account changes synchronously clear history and fence late callbacks", async () => {
  const pending = deferred();
  let state = initialPlatformFeedbackState();
  const controller = createPlatformFeedbackController({
    list: async () => pending.promise,
    submit: async () => { throw new Error("not used"); },
    onChange: (next) => { state = next; },
  });
  controller.setScope({ accountId: 7, eligible: true });
  const load = controller.load();
  controller.setScope({ accountId: 8, eligible: true });
  assert.deepEqual(state, initialPlatformFeedbackState());
  pending.resolve(listPayload(1, [feedback(7)]));
  assert.equal(await load, false);
  assert.deepEqual(state.feedback, []);
});

test("inactive account changes publish the cleared private snapshot immediately", async () => {
  let state = initialPlatformFeedbackState();
  const controller = createPlatformFeedbackController({
    list: async () => listPayload(1, [feedback(7, "Previous account feedback")]),
    submit: async () => { throw new Error("not used"); },
    onChange: (next) => { state = next; },
  });
  controller.setScope({ accountId: 7, eligible: true });
  await controller.load();
  assert.equal(state.feedback[0].message, "Previous account feedback");

  controller.deactivate();
  controller.setScope({ accountId: 8, eligible: true });

  assert.deepEqual(state, initialPlatformFeedbackState());
});

test("StrictMode deactivate and activate preserves an uncertain operation but blocks old callbacks", async () => {
  const pending = deferred();
  let state = initialPlatformFeedbackState();
  let calls = 0;
  const controller = createPlatformFeedbackController({
    list: async () => listPayload(),
    submit: async () => { calls += 1; return calls === 1 ? pending.promise : { changed: false, feedback: feedback(5, "Stable") }; },
    createKey: () => "platform_strict_key",
    onChange: (next) => { state = next; },
  });
  controller.setScope({ accountId: 7, eligible: true });
  controller.updateMessage("Stable");
  const first = controller.submit();
  controller.deactivate();
  controller.activate();
  controller.setScope({ accountId: 7, eligible: true });
  assert.equal(state.mutationPhase, "uncertain");
  pending.resolve({ changed: true, feedback: feedback(1, "Stable") });
  assert.equal(await first, false);
  assert.equal(state.mutationPhase, "uncertain");
  await controller.retrySubmission();
  assert.equal(state.mutationPhase, "success");
  assert.equal(calls, 2);
});

test("pending platform submissions cannot publish after logout or account switching", async () => {
  for (const scenario of [
    {
      name: "logout",
      scope: { accountId: null, eligible: false },
      settle(pending) {
        pending.resolve({ changed: true, feedback: feedback(99, "Old account response") });
      },
    },
    {
      name: "account switch",
      scope: { accountId: 8, eligible: true },
      prepare(controller) {
        controller.updateMessage("New account draft");
      },
      settle(pending) {
        pending.reject(new Error("Old account failure"));
      },
    },
  ]) {
    const pending = deferred();
    const publications = [];
    let state = initialPlatformFeedbackState();
    const controller = createPlatformFeedbackController({
      list: async () => listPayload(),
      submit: async () => pending.promise,
      onChange(next) {
        state = next;
        publications.push(next);
      },
    });

    controller.setScope({ accountId: 7, eligible: true });
    controller.updateMessage("Old account draft");
    const request = controller.submit();
    assert.equal(state.mutationPhase, "sending", scenario.name);

    controller.setScope(scenario.scope);
    scenario.prepare?.(controller);
    const protectedState = state;
    const publicationCount = publications.length;

    scenario.settle(pending);

    assert.equal(await request, false, scenario.name);
    assert.deepEqual(state, protectedState, scenario.name);
    assert.equal(publications.length, publicationCount, scenario.name);
  }
});
