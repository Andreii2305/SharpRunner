import assert from "node:assert/strict";
import test from "node:test";
import {
  createTestimonialAuthorController,
  initialTestimonialAuthorState,
} from "./testimonialAuthorState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const options = (suffix = "1") => ({
  consentVersion: `synthetic-v${suffix}`,
  consentText: `Synthetic public disclosure ${suffix}`,
  consentBinding: `${"B".repeat(42)}${suffix}`,
  namedDisplayPreview: "Ada L.",
  publicNamePreviewVersion: `${"P".repeat(42)}${suffix}`,
});

const revision = (overrides = {}) => ({
  id: 51,
  revisionNumber: 1,
  message: "A testimonial",
  attributionMode: "named",
  publicDisplayName: "Ada L.",
  consentVersion: "synthetic-v1",
  consentedAt: "2026-11-04T00:00:00.000Z",
  moderationStatus: "pending",
  moderationExplanation: null,
  approvedAt: null,
  revokedAt: null,
  createdAt: "2026-11-04T00:00:00.000Z",
  ...overrides,
});

const testimonial = (overrides = {}) => ({
  id: 41,
  withdrawnAt: null,
  publicationSuspendedAt: null,
  createdAt: "2026-11-04T00:00:00.000Z",
  currentRevision: revision(),
  ...overrides,
});

const listPayload = (overrides = {}) => ({
  testimonials: [testimonial()],
  page: 1,
  limit: 20,
  total: 1,
  totalPages: 1,
  ...overrides,
});

const detailPayload = (overrides = {}) => ({
  testimonial: testimonial(),
  revisions: [revision()],
  revisionPage: 1,
  revisionLimit: 20,
  revisionTotal: 1,
  revisionTotalPages: 1,
  ...overrides,
});

const operationResult = (overrides = {}) => ({
  changed: true,
  testimonial: testimonial(),
  revision: revision(),
  ...overrides,
});

const operationResultFor = (input, overrides = {}) => {
  const acknowledged = revision({
    message: input.payload.message,
    attributionMode: input.payload.attributionMode,
    publicDisplayName: input.payload.attributionMode === "named" ? "Ada L." : null,
    consentVersion: input.payload.consentVersion,
  });
  return operationResult({
    testimonial: testimonial({ currentRevision: acknowledged }),
    revision: acknowledged,
    ...overrides,
  });
};

const createHarness = (overrides = {}) => {
  let state = initialTestimonialAuthorState();
  const calls = { options: [], list: [], detail: [], create: [], revise: [], withdraw: [] };
  const controller = createTestimonialAuthorController({
    getOptions: async (input) => { calls.options.push(input); return options(); },
    list: async (input) => { calls.list.push(input); return listPayload({ page: input.page }); },
    detail: async (input) => { calls.detail.push(input); return detailPayload({ revisionPage: input.revisionPage }); },
    create: async (input) => { calls.create.push(input); return operationResultFor(input); },
    revise: async (input) => { calls.revise.push(input); return operationResultFor(input); },
    withdraw: async (input) => { calls.withdraw.push(input); return { changed: true, testimonial: testimonial({ withdrawnAt: "2026-11-04T01:00:00.000Z" }) }; },
    createKey: () => "testimonial_stable_key",
    onChange: (next) => { state = next; },
    ...overrides,
  });
  controller.setScope({ accountId: 7, eligible: true });
  return { controller, calls, get state() { return state; } };
};

const controlledScheduler = () => {
  let nextId = 0;
  const tasks = new Map();
  return {
    schedule(callback, delay) {
      const id = ++nextId;
      tasks.set(id, { callback, delay });
      return id;
    },
    cancel(id) {
      tasks.delete(id);
    },
    runNext() {
      const entry = tasks.entries().next().value;
      if (!entry) return false;
      const [id, task] = entry;
      tasks.delete(id);
      task.callback();
      return true;
    },
    get size() {
      return tasks.size;
    },
  };
};

test("named and anonymous creation use the exact loaded disclosure binding without client-owned text or names", async () => {
  const named = createHarness();
  await named.controller.loadOptions();
  named.controller.updateMessage("Named message");
  named.controller.setConsent(true);
  await named.controller.submitDraft();
  assert.deepEqual(named.calls.create[0].payload, {
    message: "Named message",
    attributionMode: "named",
    consent: true,
    consentVersion: "synthetic-v1",
    consentBinding: `${"B".repeat(42)}1`,
    publicNamePreviewVersion: `${"P".repeat(42)}1`,
  });
  assert.equal("consentText" in named.calls.create[0].payload, false);
  assert.equal("publicDisplayName" in named.calls.create[0].payload, false);

  const anonymous = createHarness();
  await anonymous.controller.loadOptions();
  anonymous.controller.setAttribution("anonymous");
  anonymous.controller.updateMessage("Anonymous message");
  anonymous.controller.setConsent(true);
  await anonymous.controller.submitDraft();
  assert.deepEqual(anonymous.calls.create[0].payload, {
    message: "Anonymous message",
    attributionMode: "anonymous",
    consent: true,
    consentVersion: "synthetic-v1",
    consentBinding: `${"B".repeat(42)}1`,
  });
});

test("content attribution and refreshed options invalidate affirmative consent", async () => {
  let optionNumber = 0;
  const h = createHarness({ getOptions: async () => options(String(++optionNumber)) });
  await h.controller.loadOptions();
  h.controller.updateMessage("Message");
  h.controller.setConsent(true);
  assert.equal(h.state.consentConfirmed, true);
  h.controller.updateMessage("Changed");
  assert.equal(h.state.consentConfirmed, false);
  h.controller.setConsent(true);
  h.controller.setAttribution("anonymous");
  assert.equal(h.state.consentConfirmed, false);
  h.controller.setConsent(true);
  await h.controller.loadOptions({ force: true });
  assert.equal(h.state.options.consentVersion, "synthetic-v2");
  assert.equal(h.state.consentConfirmed, false);
});

test("uncertain retries retain the identical idempotency key payload and original disclosure binding", async () => {
  const attempts = [];
  const h = createHarness({
    create: async (input) => {
      attempts.push(structuredClone({ payload: input.payload, idempotencyKey: input.idempotencyKey }));
      if (attempts.length === 1) throw new Error("network");
      return operationResultFor(input);
    },
  });
  await h.controller.loadOptions();
  h.controller.updateMessage("Frozen");
  h.controller.setConsent(true);
  await h.controller.submitDraft();
  assert.equal(h.state.mutationPhase, "uncertain");
  await h.controller.retryMutation();
  assert.deepEqual(attempts[1], attempts[0]);
  assert.equal(attempts[1].payload.consentBinding, `${"B".repeat(42)}1`);
});

test("rate-limited retries honor Retry-After and retain the same operation identity", async () => {
  let clock = 1_000;
  const attempts = [];
  const h = createHarness({
    now: () => clock,
    create: async (input) => {
      attempts.push({ payload: structuredClone(input.payload), idempotencyKey: input.idempotencyKey });
      if (attempts.length === 1) {
        const error = new Error("limited");
        error.response = { status: 429, headers: { "retry-after": "2" } };
        throw error;
      }
      return operationResultFor(input);
    },
  });
  await h.controller.loadOptions();
  h.controller.updateMessage("Rate limited");
  h.controller.setConsent(true);
  await h.controller.submitDraft();
  assert.equal(h.state.mutationPhase, "rate-limited");
  assert.equal(h.state.mutationRetryAt, 3_000);
  await h.controller.retryMutation();
  assert.equal(attempts.length, 1);
  clock = 3_000;
  await h.controller.retryMutation();
  assert.deepEqual(attempts[1], attempts[0]);
});

test("stale consent responses preserve the draft, load fresh options, and require renewed consent", async () => {
  let optionNumber = 0;
  const h = createHarness({
    getOptions: async () => options(String(++optionNumber)),
    create: async () => {
      const error = new Error("stale");
      error.response = { status: 409, data: { code: "CONSENT_VERSION_STALE", message: "Changed" } };
      throw error;
    },
  });
  await h.controller.loadOptions();
  h.controller.updateMessage("Keep my draft");
  h.controller.setConsent(true);
  await h.controller.submitDraft();
  assert.equal(h.state.message, "Keep my draft");
  assert.equal(h.state.consentConfirmed, false);
  assert.equal(h.state.options.consentVersion, "synthetic-v2");
  assert.equal(h.state.mutationErrorKind, "stale-consent");
});

test("unavailable consent blocks new operations while history detail and withdrawal remain usable", async () => {
  const unavailable = new Error("unavailable");
  unavailable.response = { status: 503, data: { code: "TESTIMONIAL_CONSENT_UNAVAILABLE" } };
  const h = createHarness({ getOptions: async () => { throw unavailable; } });
  await h.controller.loadOptions();
  assert.equal(h.state.optionsStatus, "unavailable");
  await h.controller.loadList();
  await h.controller.selectSubmission(41);
  await h.controller.withdrawSelected();
  assert.equal(h.calls.list.length, 2);
  assert.equal(h.calls.detail.length >= 1, true);
  assert.equal(h.calls.withdraw.length, 1);
  assert.ok(h.state.detail.testimonial.withdrawnAt);
});

test("edit and suspension recovery send the current base revision and revision history pages independently", async () => {
  const suspended = testimonial({ publicationSuspendedAt: "2026-11-04T00:30:00.000Z" });
  const h = createHarness({
    detail: async (input) => detailPayload({
      testimonial: suspended,
      revisionPage: input.revisionPage,
      revisions: [revision({ id: input.revisionPage === 2 ? 50 : 51 })],
      revisionTotal: 21,
      revisionTotalPages: 2,
    }),
  });
  await h.controller.loadOptions();
  await h.controller.selectSubmission(41);
  h.controller.startEdit();
  assert.equal(h.state.draftMode, "edit");
  assert.equal(h.state.consentConfirmed, false);
  h.controller.updateMessage("Recovered message");
  h.controller.setConsent(true);
  await h.controller.submitDraft();
  assert.equal(h.calls.revise[0].submissionId, 41);
  assert.equal(h.calls.revise[0].payload.baseRevisionId, 51);
  await h.controller.setRevisionPage(2);
  assert.equal(h.state.detail.revisionPage, 2);
});

test("a successful edit replaces the acknowledgement shortcut with authoritative revision history", async () => {
  let detailCalls = 0;
  const revisions = [
    revision({ id: 53, revisionNumber: 3, message: "Revision three" }),
    revision({ id: 52, revisionNumber: 2, message: "Revision two" }),
    revision({ id: 51, revisionNumber: 1, message: "Revision one" }),
  ];
  const h = createHarness({
    detail: async (input) => {
      detailCalls += 1;
      if (detailCalls === 1) return detailPayload({ revisionPage: input.revisionPage });
      return detailPayload({
        testimonial: testimonial({ currentRevision: revisions[0] }),
        revisions,
        revisionPage: input.revisionPage,
        revisionTotal: 3,
        revisionTotalPages: 1,
      });
    },
    revise: async (input) => operationResultFor(input, {
      testimonial: testimonial({ currentRevision: revisions[0] }),
      revision: revisions[0],
    }),
  });
  await h.controller.loadOptions();
  await h.controller.selectSubmission(41);
  h.controller.startEdit();
  h.controller.updateMessage("Revision three");
  h.controller.setConsent(true);

  assert.equal(await h.controller.submitDraft(), true);
  assert.equal(detailCalls, 2);
  assert.deepEqual(h.state.detail.revisions.map((item) => item.revisionNumber), [3, 2, 1]);
  assert.equal(h.state.detail.revisionTotal, 3);
  assert.equal(h.state.detail.revisionTotalPages, 1);
});

test("a late post-save history response cannot overwrite an explicitly selected testimonial", async () => {
  const postSaveHistory = deferred();
  const replacementHistory = deferred();
  let detailCalls = 0;
  const h = createHarness({
    detail: async (input) => {
      detailCalls += 1;
      if (detailCalls === 1) return detailPayload({ revisionPage: input.revisionPage });
      if (detailCalls === 2) return postSaveHistory.promise;
      return replacementHistory.promise;
    },
  });
  await h.controller.loadOptions();
  await h.controller.selectSubmission(41);
  h.controller.startEdit();
  h.controller.updateMessage("Saved edit");
  h.controller.setConsent(true);

  const save = h.controller.submitDraft();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(detailCalls, 2);

  const selected = h.controller.selectSubmission(42);
  assert.equal(detailCalls, 3);
  postSaveHistory.resolve(detailPayload({
    revisions: [revision({ message: "Stale saved history" })],
  }));
  replacementHistory.resolve(detailPayload({
    testimonial: testimonial({ id: 42 }),
    revisions: [revision({ message: "Selected history" })],
  }));

  assert.equal(await save, true);
  assert.equal(await selected, true);
  assert.equal(h.state.selectedSubmissionId, 42);
  assert.equal(h.state.detail.testimonial.id, 42);
  assert.equal(h.state.detail.revisions[0].message, "Selected history");
});

test("detail responses with a different submission identity are rejected without exposing them", async () => {
  const h = createHarness({
    detail: async () => detailPayload({ testimonial: testimonial({ id: 99 }) }),
  });
  await h.controller.selectSubmission(41);
  assert.equal(h.state.detailStatus, "error");
  assert.equal(h.state.detail, null);
  assert.match(h.state.detailError, /incomplete/);
});

test("a replaced detail request fences late error and finally updates even for the same page", async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const h = createHarness({
    detail: async () => (++calls === 1 ? first.promise : second.promise),
  });
  const oldRequest = h.controller.selectSubmission(41);
  const replacementRequest = h.controller.selectSubmission(41);
  assert.equal(h.state.detailStatus, "loading");

  first.reject(new Error("late old failure"));
  assert.equal(await oldRequest, false);
  assert.equal(h.state.detailStatus, "loading");
  assert.equal(h.state.detailLoading, true);
  assert.equal(h.state.detailError, "");

  second.resolve(detailPayload({ revisions: [revision({ message: "Replacement response" })] }));
  assert.equal(await replacementRequest, true);
  assert.equal(h.state.detailStatus, "success");
  assert.equal(h.state.detail.revisions[0].message, "Replacement response");
});

test("interrupted withdrawal becomes uncertain and retries the exact submission after reactivation", async () => {
  const first = deferred();
  const attempts = [];
  const h = createHarness({
    withdraw: async (input) => {
      attempts.push(input.submissionId);
      if (attempts.length === 1) return first.promise;
      return { changed: false, testimonial: testimonial({ withdrawnAt: "2026-11-04T01:00:00.000Z" }) };
    },
  });
  await h.controller.selectSubmission(41);
  const interrupted = h.controller.withdrawSelected();
  assert.equal(h.state.withdrawalPhase, "sending");
  h.controller.deactivate();
  h.controller.activate();
  assert.equal(h.state.withdrawalPhase, "uncertain");
  assert.match(h.state.withdrawalError, /uncertain/i);

  first.resolve({ changed: true, testimonial: testimonial({ withdrawnAt: "2026-11-04T00:30:00.000Z" }) });
  assert.equal(await interrupted, false);
  assert.equal(h.state.withdrawalPhase, "uncertain");
  assert.equal(h.state.detail.testimonial.withdrawnAt, null);

  assert.equal(await h.controller.withdrawSelected(), true);
  assert.deepEqual(attempts, [41, 41]);
  assert.equal(h.state.withdrawalPhase, "success");
  assert.equal(h.state.detail.testimonial.withdrawnAt, "2026-11-04T01:00:00.000Z");
});

test("withdrawal rate limits use a controlled deadline and clear task-owned timers on lifecycle changes", async () => {
  let clock = 1_000;
  let attempts = 0;
  const scheduler = controlledScheduler();
  const h = createHarness({
    now: () => clock,
    schedule: (callback, delay) => scheduler.schedule(callback, delay),
    cancelSchedule: (id) => scheduler.cancel(id),
    withdraw: async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("limited");
        error.response = { status: 429, headers: { "retry-after": "2" } };
        throw error;
      }
      return { changed: false, testimonial: testimonial({ withdrawnAt: "2026-11-04T01:00:00.000Z" }) };
    },
  });
  await h.controller.selectSubmission(41);
  await h.controller.withdrawSelected();
  assert.equal(h.state.withdrawalPhase, "rate-limited");
  assert.equal(h.state.withdrawalRetryAt, 3_000);
  assert.equal(scheduler.size, 1);

  await h.controller.withdrawSelected();
  assert.equal(attempts, 1);
  h.controller.deactivate();
  assert.equal(scheduler.size, 0);
  h.controller.activate();
  assert.equal(scheduler.size, 1);
  clock = 3_000;
  assert.equal(scheduler.runNext(), true);
  assert.equal(h.state.withdrawalPhase, "uncertain");
  assert.match(h.state.withdrawalError, /retry/i);
  assert.equal(await h.controller.withdrawSelected(), true);
  assert.equal(attempts, 2);
  assert.equal(scheduler.size, 0);
});

test("operation acknowledgements validate new current linkage while allowing valid historical retries", async () => {
  const invalidCurrent = revision({ id: 99 });
  let invalidAttempts = 0;
  const invalid = createHarness({
    create: async () => {
      invalidAttempts += 1;
      return operationResult({
        changed: true,
        testimonial: testimonial({ currentRevision: invalidCurrent }),
        revision: revision(),
      });
    },
  });
  await invalid.controller.loadOptions();
  invalid.controller.updateMessage("A testimonial");
  invalid.controller.setConsent(true);
  assert.equal(await invalid.controller.submitDraft(), false);
  assert.equal(invalid.state.mutationPhase, "uncertain");
  assert.equal(invalid.state.mutationErrorKind, "invalid-acknowledgement");
  assert.equal(invalid.state.message, "A testimonial");
  assert.equal(invalid.state.detail, null);
  assert.equal(await invalid.controller.retryMutation(), false);
  assert.equal(invalidAttempts, 2);

  const historicalRevision = revision({ id: 51, message: "Original operation" });
  const laterCurrent = revision({ id: 52, revisionNumber: 2, message: "Later revision" });
  const historical = createHarness({
    create: async () => operationResult({
      changed: false,
      testimonial: testimonial({ currentRevision: laterCurrent }),
      revision: historicalRevision,
    }),
    detail: async (input) => detailPayload({
      testimonial: testimonial({ currentRevision: laterCurrent }),
      revisions: [laterCurrent, historicalRevision],
      revisionPage: input.revisionPage,
      revisionTotal: 2,
      revisionTotalPages: 1,
    }),
  });
  await historical.controller.loadOptions();
  historical.controller.updateMessage("Original operation");
  historical.controller.setConsent(true);
  assert.equal(await historical.controller.submitDraft(), true);
  assert.equal(historical.state.mutationPhase, "success");
  assert.equal(historical.state.detail.testimonial.currentRevision.id, 52);
  assert.deepEqual(historical.state.detail.revisions.map((item) => item.id), [52, 51]);
});

test("operation acknowledgements verify every available immutable author field", async () => {
  const mismatches = [
    { message: "Different content" },
    { attributionMode: "anonymous", publicDisplayName: null },
    { consentVersion: "synthetic-v-other" },
    { publicDisplayName: "Different N." },
  ];
  for (const mismatch of mismatches) {
    const acknowledged = revision(mismatch);
    const h = createHarness({
      create: async () => operationResult({
        changed: false,
        testimonial: testimonial({ currentRevision: revision({ id: 52, revisionNumber: 2 }) }),
        revision: acknowledged,
      }),
    });
    await h.controller.loadOptions();
    h.controller.updateMessage("A testimonial");
    h.controller.setConsent(true);
    assert.equal(await h.controller.submitDraft(), false);
    assert.equal(h.state.mutationErrorKind, "invalid-acknowledgement");
    assert.equal(h.state.message, "A testimonial");
  }
});

test("account changes and StrictMode replacement fence old list and mutation callbacks", async () => {
  const listPending = deferred();
  const mutationPending = deferred();
  const h = createHarness({
    list: async () => listPending.promise,
    create: async () => mutationPending.promise,
  });
  const load = h.controller.loadList();
  h.controller.setScope({ accountId: 8, eligible: true });
  assert.deepEqual(h.state.testimonials, []);
  listPending.resolve(listPayload());
  assert.equal(await load, false);

  await h.controller.loadOptions();
  h.controller.updateMessage("Strict operation");
  h.controller.setConsent(true);
  const mutation = h.controller.submitDraft();
  h.controller.deactivate();
  h.controller.activate();
  h.controller.setScope({ accountId: 8, eligible: true });
  assert.equal(h.state.mutationPhase, "uncertain");
  mutationPending.resolve(operationResult());
  assert.equal(await mutation, false);
  assert.equal(h.state.mutationPhase, "uncertain");
});

test("inactive account changes publish the cleared testimonial snapshot immediately", async () => {
  const h = createHarness();
  await h.controller.loadList();
  assert.equal(h.state.testimonials[0].id, 41);

  h.controller.deactivate();
  h.controller.setScope({ accountId: 8, eligible: true });

  assert.deepEqual(h.state, initialTestimonialAuthorState());
});

const runPendingAuthorMutationScopeChecks = async ({ mode }) => {
  for (const scenario of [
    {
      name: "logout",
      scope: { accountId: null, eligible: false },
      settle(pending, input) {
        pending.resolve(operationResultFor(input));
      },
    },
    {
      name: "account switch",
      scope: { accountId: 8, eligible: true },
      async prepare(controller) {
        await controller.loadOptions();
        controller.updateMessage("New account draft");
      },
      settle(pending) {
        pending.reject(new Error("Old account failure"));
      },
    },
  ]) {
    const pending = deferred();
    let mutationInput;
    const h = createHarness({
      create: async (input) => {
        mutationInput = input;
        return pending.promise;
      },
      revise: async (input) => {
        mutationInput = input;
        return pending.promise;
      },
    });

    await h.controller.loadOptions();
    if (mode === "edit") {
      await h.controller.selectSubmission(41);
      assert.equal(h.controller.startEdit(), true, scenario.name);
    }
    h.controller.updateMessage(`Old account ${mode} draft`);
    h.controller.setConsent(true);
    const request = h.controller.submitDraft();
    assert.equal(h.state.mutationPhase, "sending", scenario.name);

    h.controller.setScope(scenario.scope);
    await scenario.prepare?.(h.controller);
    const protectedState = h.state;

    scenario.settle(pending, mutationInput);

    assert.equal(await request, false, scenario.name);
    assert.deepEqual(h.state, protectedState, scenario.name);
    assert.notEqual(h.state.mutationPhase, "success", scenario.name);
    assert.notEqual(h.state.mutationPhase, "error", scenario.name);
  }
};

test("pending testimonial creation cannot publish after logout or account switching", async () => {
  await runPendingAuthorMutationScopeChecks({ mode: "create" });
});

test("pending testimonial editing cannot publish after logout or account switching", async () => {
  await runPendingAuthorMutationScopeChecks({ mode: "edit" });
});
