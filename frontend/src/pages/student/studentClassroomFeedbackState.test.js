import assert from "node:assert/strict";
import test from "node:test";
import {
  createStudentClassroomFeedbackController,
  initialStudentClassroomFeedbackState,
} from "./studentClassroomFeedbackState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const payload = (page = 1, overrides = {}) => ({
  feedback: [{ id: 1, classroomId: 25, classroom: null, message: "History", createdAt: "2026-10-26T00:00:00.000Z" }],
  page,
  limit: 20,
  total: 1,
  totalPages: 1,
  ...overrides,
});

test("student scope loads once per unchanged account and page without membership state", async () => {
  let state = initialStudentClassroomFeedbackState();
  const calls = [];
  const controller = createStudentClassroomFeedbackController({
    request: async (input) => { calls.push(input); return payload(input.page); },
    onChange: (next) => { state = next; },
  });
  controller.setScope({ accountId: 51, isStudent: true });
  assert.equal(await controller.load(), true);
  assert.equal(await controller.load(), true);
  assert.equal(calls.length, 1);
  assert.equal(state.status, "success");
  assert.equal(state.total, 1);

  controller.setScope({ accountId: 71, isStudent: false });
  assert.deepEqual(state, initialStudentClassroomFeedbackState());
  assert.equal(await controller.load(), false);
  assert.equal(calls.length, 1);
});

test("account and page changes synchronously clear private rows and fence stale success error and finally", async () => {
  let state = initialStudentClassroomFeedbackState();
  const requests = [];
  const controller = createStudentClassroomFeedbackController({
    request: () => {
      const pending = deferred();
      requests.push(pending);
      return pending.promise;
    },
    onChange: (next) => { state = next; },
  });
  controller.setScope({ accountId: 51, isStudent: true });
  const first = controller.load();
  assert.equal(state.loading, true);
  controller.setPage(2);
  assert.deepEqual(state, { ...initialStudentClassroomFeedbackState(), page: 2 });
  requests[0].resolve(payload(1));
  assert.equal(await first, false);
  assert.equal(state.status, "idle");

  const second = controller.load();
  controller.setScope({ accountId: 52, isStudent: true });
  assert.deepEqual(state, initialStudentClassroomFeedbackState());
  requests[1].reject(new Error("old account"));
  assert.equal(await second, false);
  assert.equal(state.error, "");
  assert.equal(state.loading, false);
});

test("current failure leaves totals unavailable and retry targets the current account and page", async () => {
  let state = initialStudentClassroomFeedbackState();
  const calls = [];
  const controller = createStudentClassroomFeedbackController({
    request: async (input) => {
      calls.push(input);
      if (calls.length === 1) throw new Error("History unavailable");
      return payload(input.page, { feedback: [], total: 0, totalPages: 0 });
    },
    onChange: (next) => { state = next; },
  });
  controller.setScope({ accountId: 51, isStudent: true });
  controller.setPage(3);
  assert.equal(await controller.load(), false);
  assert.equal(state.status, "error");
  assert.equal(state.total, null);
  assert.deepEqual(state.feedback, []);
  assert.equal(await controller.retry(), true);
  assert.equal(calls[1].page, 3);
  assert.equal(state.total, 0);
});

test("unmount aborts and ignores late completion", async () => {
  let state = initialStudentClassroomFeedbackState();
  let signal;
  const pending = deferred();
  const controller = createStudentClassroomFeedbackController({
    request: (input) => { signal = input.signal; return pending.promise; },
    onChange: (next) => { state = next; },
  });
  controller.setScope({ accountId: 51, isStudent: true });
  const loading = controller.load();
  const atUnmount = state;
  controller.dispose();
  assert.equal(signal.aborted, true);
  pending.resolve(payload());
  assert.equal(await loading, false);
  assert.equal(state, atUnmount);
});

test("reactivation after cleanup can load the same account again", async () => {
  let calls = 0;
  const first = deferred();
  const controller = createStudentClassroomFeedbackController({
    request: () => { calls += 1; return calls === 1 ? first.promise : Promise.resolve(payload()); },
  });
  controller.setScope({ accountId: 51, isStudent: true });
  const stale = controller.load();
  controller.dispose();
  first.resolve(payload());
  assert.equal(await stale, false);
  controller.activate();
  assert.equal(await controller.load(), true);
  assert.equal(calls, 2);
});

test("post-submission refresh moves to page one and fences an older page response", async () => {
  let state = initialStudentClassroomFeedbackState();
  const requests = [];
  const controller = createStudentClassroomFeedbackController({
    request: ({ page }) => {
      const pending = deferred();
      requests.push({ page, pending });
      return pending.promise;
    },
    onChange: (next) => { state = next; },
  });
  controller.setScope({ accountId: 51, isStudent: true });
  controller.setPage(2);
  const oldPage = controller.load();
  const refresh = controller.refreshFromFirstPage();
  assert.equal(state.page, 1);
  assert.equal(state.loading, true);
  requests[0].pending.resolve(payload(2, { feedback: [{ id: 2 }], total: 21, totalPages: 2 }));
  assert.equal(await oldPage, false);
  requests[1].pending.resolve(payload(1, { feedback: [{ id: 9 }], total: 21, totalPages: 2 }));
  assert.equal(await refresh, true);
  assert.equal(state.feedback[0].id, 9);
});
