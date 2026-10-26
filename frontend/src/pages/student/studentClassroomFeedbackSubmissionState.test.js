import assert from "node:assert/strict";
import test from "node:test";
import {
  countFeedbackCharacters,
  createStudentClassroomFeedbackSubmissionController,
  initialStudentClassroomFeedbackSubmissionState,
} from "./studentClassroomFeedbackSubmissionState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const summary = (classrooms = [{ id: 25, className: "Programming", section: "A", schoolYear: "2026" }]) => ({ classrooms });
const saved = (changed = true) => ({ changed, feedback: { id: 7, classroomId: 25, message: "Helpful pace", createdAt: "2026-10-26T00:00:00.000Z" } });
const httpError = (status, code, headers = {}) => Object.assign(new Error(code), { response: { status, data: { code }, headers } });

const setup = (overrides = {}) => {
  let state = initialStudentClassroomFeedbackSubmissionState();
  const calls = [];
  const controller = createStudentClassroomFeedbackSubmissionController({
    loadClassrooms: async () => summary(),
    submit: async (input) => { calls.push(input); return saved(); },
    refreshHistory: async () => true,
    createKey: () => "feedback-key-123",
    onChange: (next) => { state = next; },
    ...overrides,
  });
  controller.setScope({ accountId: 51, isStudent: true });
  return { controller, calls, state: () => state };
};

test("classrooms load separately and require explicit selection", async () => {
  const { controller, state } = setup();
  assert.equal(await controller.loadClassrooms(), true);
  assert.equal(state().classroomsStatus, "success");
  assert.equal(state().selectedClassroomId, "");
  controller.updateMessage(" Helpful pace ");
  assert.equal(await controller.submit(), false);
  assert.match(state().submissionError, /Select a classroom/);
});

test("Unicode counting and normalized exact request contract", async () => {
  const { controller, calls, state } = setup();
  await controller.loadClassrooms();
  assert.equal(controller.selectClassroom("25"), true);
  assert.equal(controller.updateMessage("  Helpful pace  "), true);
  assert.equal(countFeedbackCharacters("😀"), 1);
  assert.equal(countFeedbackCharacters("😀".repeat(1000)), 1000);
  assert.equal(countFeedbackCharacters("😀".repeat(1001)), 1001);
  assert.equal(await controller.submit(), true);
  assert.equal(calls.length, 1);
  assert.deepEqual({ ...calls[0], signal: undefined }, {
    classroomId: 25, message: "Helpful pace", idempotencyKey: "feedback-key-123", signal: undefined,
  });
  assert.equal(state().phase, "success");
  assert.equal(state().historyRefreshStatus, "success");
});

test("submission is single-flight", async () => {
  const pending = deferred();
  let calls = 0;
  const { controller } = setup({ submit: () => { calls += 1; return pending.promise; } });
  await controller.loadClassrooms(); controller.selectClassroom("25"); controller.updateMessage("Helpful pace");
  const first = controller.submit();
  const duplicate = controller.submit();
  assert.equal(first, duplicate);
  assert.equal(calls, 1);
  pending.resolve(saved());
  assert.equal(await first, true);
});

test("network and every 5xx outcome retain an identical locked operation for retry", async () => {
  for (const status of [null, 500, 502, 503, 504]) {
    const calls = [];
    const { controller, state } = setup({
      submit: async (input) => {
        calls.push(input);
        if (calls.length === 1) throw status ? httpError(status, "SERVER_ERROR") : new Error("timeout");
        return saved(false);
      },
    });
    await controller.loadClassrooms();
    controller.selectClassroom("25");
    controller.updateMessage(" Helpful pace ");
    assert.equal(await controller.submit(), false);
    assert.equal(state().phase, "uncertain");
    assert.equal(controller.updateMessage("Changed"), false);
    assert.equal(controller.selectClassroom("99"), false);
    assert.equal(await controller.retrySubmission(), true);
    assert.equal(calls.length, 2);
    for (const field of ["classroomId", "message", "idempotencyKey"]) assert.equal(calls[1][field], calls[0][field]);
    assert.equal(state().phase, "success");
  }
});

test("429 retains the operation and honors Retry-After", async () => {
  let clock = 1_000;
  const calls = [];
  const { controller, state } = setup({
    now: () => clock,
    submit: async (input) => {
      calls.push(input);
      if (calls.length === 1) throw httpError(429, "FEEDBACK_RATE_LIMITED", { "retry-after": "2" });
      return saved(false);
    },
  });
  await controller.loadClassrooms(); controller.selectClassroom("25"); controller.updateMessage("Helpful pace");
  assert.equal(await controller.submit(), false);
  assert.equal(state().phase, "rate-limited");
  assert.equal(await controller.retrySubmission(), false);
  clock = 3_001;
  assert.equal(await controller.retrySubmission(), true);
  assert.equal(calls[1].idempotencyKey, calls[0].idempotencyKey);
});

test("definitive errors unlock editing and a fresh intentional submission gets a new key", async () => {
  let key = 0;
  const calls = [];
  const { controller, state } = setup({
    createKey: () => `feedback-key-${++key}-long`,
    submit: async (input) => {
      calls.push(input);
      if (calls.length === 1) throw httpError(403, "FORBIDDEN");
      return { ...saved(), feedback: { ...saved().feedback, message: input.message } };
    },
  });
  await controller.loadClassrooms(); controller.selectClassroom("25"); controller.updateMessage("Helpful pace");
  assert.equal(await controller.submit(), false);
  assert.equal(state().phase, "error");
  assert.equal(controller.updateMessage("Helpful pace again"), true);
  assert.equal(await controller.submit(), true);
  assert.notEqual(calls[1].idempotencyKey, calls[0].idempotencyKey);
});

test("eligible-classroom changes do not destroy an uncertain operation", async () => {
  let loadCount = 0;
  const calls = [];
  const { controller, state } = setup({
    loadClassrooms: async () => (++loadCount === 1 ? summary() : summary([])),
    submit: async (input) => { calls.push(input); if (calls.length === 1) throw new Error("timeout"); return saved(false); },
  });
  await controller.loadClassrooms(); controller.selectClassroom("25"); controller.updateMessage("Helpful pace");
  await controller.submit();
  await controller.loadClassrooms({ force: true });
  assert.equal(state().selectedClassroomId, "25");
  assert.equal(state().phase, "uncertain");
  assert.equal(await controller.retrySubmission(), true);
});

test("confirmed save with refresh failure remains success and retry refresh never resubmits", async () => {
  let refreshes = 0;
  const calls = [];
  const { controller, state } = setup({
    submit: async (input) => { calls.push(input); return saved(); },
    refreshHistory: async () => { refreshes += 1; return refreshes > 1; },
  });
  await controller.loadClassrooms(); controller.selectClassroom("25"); controller.updateMessage("Helpful pace");
  assert.equal(await controller.submit(), true);
  assert.equal(state().phase, "success");
  assert.equal(state().historyRefreshStatus, "error");
  assert.equal(await controller.retryHistoryRefresh(), true);
  assert.equal(calls.length, 1);
  assert.equal(refreshes, 2);
});

test("account changes and unmount clear private state and fence all late completions", async () => {
  const classroomPending = deferred();
  const submitPending = deferred();
  let state = initialStudentClassroomFeedbackSubmissionState();
  const controller = createStudentClassroomFeedbackSubmissionController({
    loadClassrooms: () => classroomPending.promise,
    submit: () => submitPending.promise,
    refreshHistory: async () => true,
    createKey: () => "feedback-key-123",
    onChange: (next) => { state = next; },
  });
  controller.setScope({ accountId: 51, isStudent: true });
  const loading = controller.loadClassrooms();
  controller.setScope({ accountId: 52, isStudent: true });
  classroomPending.resolve(summary());
  assert.equal(await loading, false);
  assert.deepEqual(state, initialStudentClassroomFeedbackSubmissionState());

  assert.equal(await controller.loadClassrooms(), true);
  controller.selectClassroom("25");
  controller.updateMessage("Helpful pace");
  const sending = controller.submit();
  controller.dispose();
  submitPending.resolve(saved());
  assert.equal(await sending, false);
});
