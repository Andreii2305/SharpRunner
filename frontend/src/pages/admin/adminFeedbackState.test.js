import assert from "node:assert/strict";
import { test } from "node:test";
import { createAdminFeedbackController } from "./adminFeedbackState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const revision = (overrides = {}) => ({
  id: 51,
  revisionNumber: 2,
  message: "A useful testimonial",
  attributionMode: "named",
  publicDisplayName: "Ada L.",
  consentVersion: "synthetic-v1",
  consentedAt: "2026-11-03T08:00:00.000Z",
  moderationStatus: "pending",
  moderationExplanation: null,
  approvedByUserId: null,
  approvedAt: null,
  rejectedByUserId: null,
  rejectedAt: null,
  revokedByUserId: null,
  revokedAt: null,
  createdAt: "2026-11-03T08:00:00.000Z",
  ...overrides,
});
const decidedRevision = (action, explanation = null, overrides = {}) => revision({
  moderationStatus: action === "approve" ? "approved" : action === "reject" ? "rejected" : "revoked",
  moderationExplanation: action === "approve" ? null : explanation,
  ...(action === "approve" || action === "revoke" ? { approvedByUserId: 9, approvedAt: "2026-11-03T09:00:00Z" } : {}),
  ...(action === "reject" ? { rejectedByUserId: 9, rejectedAt: "2026-11-03T09:00:00Z" } : {}),
  ...(action === "revoke" ? { revokedByUserId: 9, revokedAt: "2026-11-03T10:00:00Z" } : {}),
  ...overrides,
});
const testimonial = (overrides = {}) => ({
  id: 41,
  withdrawnAt: null,
  publicationSuspendedAt: null,
  publicationSuspensionReason: null,
  createdAt: "2026-11-03T07:00:00.000Z",
  author: { id: 7, firstName: "Ada", lastName: "Lovelace", username: "ada", role: "student", status: "active" },
  currentRevision: revision(),
  ...overrides,
});
const detailPayload = (overrides = {}) => ({
  testimonial: testimonial(), revisions: [revision()], revisionPage: 1,
  revisionLimit: 20, revisionTotal: 1, revisionTotalPages: 1, ...overrides,
});
const queuePayload = (overrides = {}) => ({
  testimonials: [testimonial()], status: "pending", page: 1,
  limit: 20, total: 1, totalPages: 1, ...overrides,
});
const platformPayload = (overrides = {}) => ({
  feedback: [{ id: 1, message: "Private feedback", createdAt: "2026-11-03T00:00:00Z", author: testimonial().author }],
  page: 1, limit: 20, total: 1, totalPages: 1, ...overrides,
});

const harness = (overrides = {}) => {
  const states = [];
  const api = {
    listPlatform: async ({ page }) => platformPayload({ page }),
    listTestimonials: async ({ status, page }) => queuePayload({ status, page }),
    getTestimonial: async ({ revisionPage }) => detailPayload({ revisionPage }),
    moderate: async ({ action, explanation }) => {
      const acknowledged = decidedRevision(action, explanation);
      return { changed: true, testimonial: testimonial({ currentRevision: acknowledged }), revision: acknowledged };
    },
    ...overrides,
  };
  const controller = createAdminFeedbackController({ ...api, onChange: (state) => states.push(state) });
  controller.setScope({ accountId: 9, role: "admin" });
  controller.activate();
  return { controller, states, api };
};

test("private inbox, queue filters, and detail history paginate independently", async () => {
  const calls = [];
  const { controller } = harness({
    listPlatform: async (input) => { calls.push(["platform", input.page]); return platformPayload({ page: input.page }); },
    listTestimonials: async (input) => { calls.push(["queue", input.status, input.page]); return queuePayload({ status: input.status, page: input.page }); },
    getTestimonial: async (input) => { calls.push(["detail", input.submissionId, input.revisionPage]); return detailPayload({ revisionPage: input.revisionPage }); },
  });
  await controller.loadPlatform();
  controller.setPlatformPage(2);
  await controller.loadPlatform();
  await controller.loadQueue();
  controller.setQueueFilter("approved");
  await controller.loadQueue();
  await controller.selectSubmission(41);
  await controller.setRevisionPage(3);

  assert.deepEqual(calls.map((entry) => entry.slice(0, 3)), [
    ["platform", 1], ["platform", 2], ["queue", "pending", 1],
    ["queue", "approved", 1], ["detail", 41, 1], ["detail", 41, 3],
  ]);
  assert.equal(controller.getState().queueFilter, "approved");
  assert.equal(controller.getState().queuePage, 1);
  assert.equal(controller.getState().platformPage, 2);
  assert.equal(controller.getState().revisionPage, 3);
});

test("replacement detail request fences late success error and finally callbacks", async () => {
  const first = deferred();
  const second = deferred();
  let call = 0;
  const { controller } = harness({ getTestimonial: () => (++call === 1 ? first.promise : second.promise) });
  const oldRequest = controller.selectSubmission(41);
  const replacement = controller.selectSubmission(42);
  second.resolve(detailPayload({ testimonial: testimonial({ id: 42 }) }));
  assert.equal(await replacement, true);
  first.reject(Object.assign(new Error("late private failure"), { response: { status: 500 } }));
  assert.equal(await oldRequest, false);
  assert.equal(controller.getState().selectedSubmissionId, 42);
  assert.equal(controller.getState().detail.testimonial.id, 42);
  assert.equal(controller.getState().detailStatus, "success");
});

test("moderation freezes exact target and retries an interrupted operation after lifecycle replacement", async () => {
  const first = deferred();
  const calls = [];
  const { controller } = harness({
    moderate: (input) => { calls.push(input); return calls.length === 1 ? first.promise : Promise.resolve({
      changed: false,
      testimonial: testimonial({ currentRevision: revision({ id: 70, moderationStatus: "pending" }) }),
      revision: revision({ moderationStatus: "approved", approvedAt: "2026-11-03T09:00:00Z", approvedByUserId: 9 }),
    }); },
  });
  await controller.selectSubmission(41);
  assert.equal(controller.prepareDecision({ action: "approve", submissionId: 41, revisionId: 51 }), true);
  const sending = controller.confirmDecision();
  controller.deactivate();
  controller.activate();
  assert.equal(controller.getState().mutationPhase, "uncertain");
  assert.equal(controller.isNavigationBlocked(), true);
  const approved = decidedRevision("approve");
  first.resolve({ changed: true, testimonial: testimonial({ currentRevision: approved }), revision: approved });
  assert.equal(await sending, false);
  assert.equal(controller.getState().mutationPhase, "uncertain");
  assert.equal(await controller.retryDecision(), true);
  assert.deepEqual(calls.map(({ action, submissionId, revisionId, explanation }) => ({ action, submissionId, revisionId, explanation })), [
    { action: "approve", submissionId: 41, revisionId: 51, explanation: null },
    { action: "approve", submissionId: 41, revisionId: 51, explanation: null },
  ]);
  assert.equal(controller.getState().mutationPhase, "success");
});

test("reject and revoke validate bounded explanations before freezing their exact revision", async () => {
  const calls = [];
  const { controller } = harness({ moderate: async (input) => { calls.push(input); const acknowledged = decidedRevision(input.action, input.explanation); return {
    changed: true,
    testimonial: testimonial({ currentRevision: acknowledged }),
    revision: acknowledged,
  }; } });
  await controller.selectSubmission(41);
  controller.prepareDecision({ action: "reject", submissionId: 41, revisionId: 51 });
  assert.equal(await controller.confirmDecision(), false);
  assert.match(controller.getState().decisionError, /explanation/i);
  controller.setDecisionExplanation("  Contains private information.  ");
  assert.equal(await controller.confirmDecision(), true);
  assert.equal(calls[0].explanation, "Contains private information.");
});

test("invalid acknowledgements preserve the frozen operation and historical retries may differ from current", async () => {
  let response = {
    changed: true,
    testimonial: testimonial({ currentRevision: revision({ id: 70, moderationStatus: "pending" }) }),
    revision: revision({ moderationStatus: "approved" }),
  };
  const { controller } = harness({ moderate: async () => response });
  await controller.selectSubmission(41);
  controller.prepareDecision({ action: "approve", submissionId: 41, revisionId: 51 });
  assert.equal(await controller.confirmDecision(), false);
  assert.equal(controller.getState().mutationPhase, "uncertain");
  assert.match(controller.getState().mutationError, /confirmation/i);

  response = {
    changed: false,
    testimonial: testimonial({ currentRevision: revision({ id: 70, moderationStatus: "pending" }) }),
    revision: decidedRevision("approve", null, { moderationStatus: "revoked", revokedByUserId: 11, revokedAt: "2026-11-03T10:00:00Z" }),
  };
  assert.equal(await controller.retryDecision(), true);
  assert.equal(controller.getState().mutationPhase, "success");
});

test("a committed decision remains successful when authoritative refresh fails", async () => {
  let detailCalls = 0;
  const { controller } = harness({
    getTestimonial: async () => {
      detailCalls += 1;
      if (detailCalls > 1) throw Object.assign(new Error("refresh failed"), { response: { status: 503 } });
      return detailPayload();
    },
  });
  await controller.selectSubmission(41);
  controller.prepareDecision({ action: "approve", submissionId: 41, revisionId: 51 });
  assert.equal(await controller.confirmDecision(), true);
  assert.equal(controller.getState().mutationPhase, "success");
  assert.match(controller.getState().refreshError, /refresh/i);
});

test("stale lifecycle conflicts clear the decision, refresh, and require renewed review", async () => {
  let detailCalls = 0;
  const { controller } = harness({
    getTestimonial: async () => { detailCalls += 1; return detailPayload(); },
    moderate: async () => { throw Object.assign(new Error("changed"), { response: { status: 409, data: { code: "REVISION_CHANGED" } } }); },
  });
  await controller.selectSubmission(41);
  controller.prepareDecision({ action: "approve", submissionId: 41, revisionId: 51 });
  assert.equal(await controller.confirmDecision(), false);
  assert.equal(controller.getState().mutationPhase, "conflict");
  assert.equal(controller.isNavigationBlocked(), false);
  assert.equal(detailCalls, 2);
});

test("account scope changes synchronously clear private state and fence late callbacks", async () => {
  const pending = deferred();
  const { controller } = harness({ listPlatform: () => pending.promise });
  const load = controller.loadPlatform();
  controller.setScope({ accountId: 10, role: "admin" });
  assert.equal(controller.getState().platformFeedback.length, 0);
  pending.resolve(platformPayload());
  assert.equal(await load, false);
  assert.equal(controller.getState().platformFeedback.length, 0);
});

test("inactive administrator scope changes publish the cleared private snapshot immediately", async () => {
  const { controller, states } = harness();
  await controller.loadPlatform();
  assert.equal(states.at(-1).platformFeedback[0].message, "Private feedback");

  controller.deactivate();
  controller.setScope({ accountId: 10, role: "admin" });

  assert.deepEqual(states.at(-1).platformFeedback, []);
  assert.equal(states.at(-1).platformStatus, "idle");
});

test("rate limiting preserves the frozen decision and controlled retry deadline", async () => {
  let clock = 1_000;
  let scheduled;
  let calls = 0;
  const { controller } = harness({
    moderate: async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("limited"), { response: { status: 429, headers: { "retry-after": "5" } } });
      const approved = decidedRevision("approve");
      return { changed: true, testimonial: testimonial({ currentRevision: approved }), revision: approved };
    },
    now: () => clock,
    schedule: (callback, delay) => { scheduled = { callback, delay }; return 1; },
    cancelSchedule: () => { scheduled = null; },
  });
  await controller.selectSubmission(41);
  controller.prepareDecision({ action: "approve", submissionId: 41, revisionId: 51 });
  assert.equal(await controller.confirmDecision(), false);
  assert.equal(controller.getState().mutationPhase, "rate-limited");
  assert.equal(scheduled.delay, 5_000);
  assert.equal(await controller.retryDecision(), false);
  assert.equal(calls, 1);
  clock = 6_000;
  scheduled.callback();
  assert.equal(controller.getState().mutationPhase, "uncertain");
  assert.equal(await controller.retryDecision(), true);
  assert.equal(calls, 2);
});

test("StrictMode-style activation replacement resets interrupted reads and remains usable", async () => {
  const first = deferred();
  let calls = 0;
  const { controller } = harness({ listPlatform: () => (++calls === 1 ? first.promise : Promise.resolve(platformPayload())) });
  const interrupted = controller.loadPlatform();
  controller.deactivate();
  controller.activate();
  assert.equal(controller.getState().platformStatus, "idle");
  assert.equal(await controller.loadPlatform(), true);
  first.resolve(platformPayload());
  assert.equal(await interrupted, false);
  assert.equal(controller.getState().platformStatus, "success");
  assert.equal(controller.getState().platformFeedback.length, 1);
});

test("pending moderation cannot publish after logout or account switching", async () => {
  for (const scenario of [
    {
      name: "logout",
      scope: { accountId: null, role: null },
      settle(pending) {
        const approved = decidedRevision("approve");
        pending.resolve({ changed: true, testimonial: testimonial({ currentRevision: approved }), revision: approved });
      },
    },
    {
      name: "account switch",
      scope: { accountId: 10, role: "admin" },
      async prepare(controller) {
        await controller.loadPlatform();
      },
      settle(pending) {
        pending.reject(new Error("Old administrator failure"));
      },
    },
  ]) {
    const pending = deferred();
    const h = harness({ moderate: async () => pending.promise });

    await h.controller.selectSubmission(41);
    assert.equal(h.controller.prepareDecision({ action: "approve", submissionId: 41, revisionId: 51 }), true, scenario.name);
    const request = h.controller.confirmDecision();
    assert.equal(h.controller.getState().mutationPhase, "sending", scenario.name);

    h.controller.setScope(scenario.scope);
    await scenario.prepare?.(h.controller);
    const protectedState = h.controller.getState();
    const publicationCount = h.states.length;

    scenario.settle(pending);

    assert.equal(await request, false, scenario.name);
    assert.deepEqual(h.controller.getState(), protectedState, scenario.name);
    assert.equal(h.states.length, publicationCount, scenario.name);
  }
});
