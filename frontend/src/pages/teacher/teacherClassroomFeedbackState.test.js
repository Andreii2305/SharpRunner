import assert from "node:assert/strict";
import test from "node:test";
import {
  createTeacherClassroomFeedbackController,
  initialTeacherClassroomFeedbackState,
} from "./teacherClassroomFeedbackState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const payload = (classroomId, page = 1, feedback = []) => ({
  feedback,
  page,
  limit: 20,
  total: feedback.length,
  totalPages: feedback.length ? 1 : 0,
});

test("feedback controller loads only an active teacher scope and restores authoritative metadata", async () => {
  let state = initialTeacherClassroomFeedbackState();
  const calls = [];
  const controller = createTeacherClassroomFeedbackController({
    request: async (request) => {
      calls.push(request);
      return payload("25", request.page, [{ id: 9, classroomId: 25, message: "Private" }]);
    },
    onChange: (next) => { state = next; },
  });

  controller.setScope({ accountId: 7, classroomId: 25, isTeacher: true });
  assert.equal(await controller.setActive(true), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].classroomId, "25");
  assert.equal(state.status, "success");
  assert.equal(state.total, 1);

  controller.setScope({ accountId: 8, classroomId: 25, isTeacher: false });
  assert.deepEqual(state, initialTeacherClassroomFeedbackState());
  assert.equal(await controller.setActive(true), false);
  assert.equal(calls.length, 1);
});

test("scope, tab, page, and unmount transitions fence every stale completion", async () => {
  let state = initialTeacherClassroomFeedbackState();
  const requests = [];
  const controller = createTeacherClassroomFeedbackController({
    request: (request) => {
      const pending = deferred();
      requests.push({ request, pending });
      return pending.promise;
    },
    onChange: (next) => { state = next; },
  });

  controller.setScope({ accountId: 7, classroomId: 25, isTeacher: true });
  const first = controller.setActive(true);
  assert.equal(state.total, null);
  controller.setActive(false);
  requests[0].pending.resolve(payload("25", 1, [{ id: 1, classroomId: 25 }]));
  await first;
  assert.deepEqual(state, initialTeacherClassroomFeedbackState());

  const returning = controller.setActive(true);
  requests[1].pending.resolve(payload("25"));
  await returning;
  assert.equal(state.status, "success");

  const pageTwo = controller.setPage(2);
  assert.equal(state.page, 2);
  assert.equal(state.total, null);
  controller.setScope({ accountId: 7, classroomId: 26, isTeacher: true });
  requests[2].pending.reject(new Error("old classroom"));
  await pageTwo;
  assert.deepEqual(state, initialTeacherClassroomFeedbackState());

  const afterClassroom = controller.setActive(true);
  const stateAtUnmount = state;
  controller.dispose();
  requests[3].pending.resolve(payload("26"));
  await afterClassroom;
  assert.equal(state, stateAtUnmount);
});

test("a stale request resolving before its replacement begins cannot update state", async () => {
  let state = initialTeacherClassroomFeedbackState();
  const pending = deferred();
  const controller = createTeacherClassroomFeedbackController({
    request: () => pending.promise,
    onChange: (next) => { state = next; },
  });
  controller.setScope({ accountId: 7, classroomId: 25, isTeacher: true });
  const loading = controller.setActive(true);
  controller.setScope({ accountId: 7, classroomId: 26, isTeacher: true });
  pending.resolve(payload("25", 1, [{ id: 1, classroomId: 25 }]));
  await loading;
  assert.deepEqual(state, initialTeacherClassroomFeedbackState());
});

test("failure clears private data and metadata, maps 403 access, and retry uses the current page", async () => {
  let state = initialTeacherClassroomFeedbackState();
  const calls = [];
  const controller = createTeacherClassroomFeedbackController({
    request: async (request) => {
      calls.push(request);
      if (calls.length === 1) {
        const error = new Error("forbidden");
        error.response = { status: 403, data: { message: "Forbidden" } };
        throw error;
      }
      return payload("25", request.page);
    },
    onChange: (next) => { state = next; },
  });
  controller.setScope({ accountId: 7, classroomId: 25, isTeacher: true });
  await controller.setActive(true);
  assert.equal(state.status, "error");
  assert.equal(state.total, null);
  assert.deepEqual(state.feedback, []);
  assert.match(state.error, /access/i);
  await controller.retry();
  assert.equal(calls[1].page, 1);
  assert.equal(state.status, "success");
});

test("late errors and finally updates do not replace a current successful page", async () => {
  let state = initialTeacherClassroomFeedbackState();
  const first = deferred();
  const second = deferred();
  let call = 0;
  const controller = createTeacherClassroomFeedbackController({
    request: () => (++call === 1 ? first.promise : second.promise),
    onChange: (next) => { state = next; },
  });
  controller.setScope({ accountId: 7, classroomId: 25, isTeacher: true });
  const requestOne = controller.setActive(true);
  const requestTwo = controller.setPage(2);
  second.resolve({ ...payload("25", 2, [{ id: 2, classroomId: 25 }]), total: 21, totalPages: 2 });
  await requestTwo;
  first.reject(new Error("late"));
  await requestOne;
  assert.equal(state.status, "success");
  assert.equal(state.page, 2);
  assert.equal(state.total, 21);
});
