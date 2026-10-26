import assert from "node:assert/strict";
import test from "node:test";
import {
  countMessageCharacters,
  createTeacherCheckInController,
  normalizeCheckInMessage,
} from "./teacherCheckInState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const target = (studentId = 51) => ({
  classroom: { id: 7, className: "C# Foundations", section: "A" },
  student: { userId: studentId, studentName: "Ada Lovelace", username: "ada" },
});
const makeController = (overrides = {}) => {
  const states = [];
  const calls = [];
  let keyIndex = 0;
  const controller = createTeacherCheckInController({
    send: async (input) => { calls.push(input); return { changed: true, checkIn: { id: 1, classroomId: 7, recipientStudentId: 51, message: input.message } }; },
    createKey: () => `checkin_key_${++keyIndex}`,
    onChange: (state) => states.push(state),
    ...overrides,
  });
  controller.setScope({ accountId: 42, classroomId: 7 });
  controller.open(target());
  return { controller, states, calls };
};

test("message validation trims content and uses Unicode code-point boundaries", () => {
  assert.equal(normalizeCheckInMessage("  hello \n"), "hello");
  assert.equal(countMessageCharacters("😀".repeat(1000)), 1000);
  assert.equal(countMessageCharacters("😀".repeat(1001)), 1001);
  const { controller, calls } = makeController();
  controller.updateMessage("   ");
  assert.equal(controller.send(), false);
  controller.updateMessage("😀".repeat(1001));
  assert.equal(controller.send(), false);
  assert.equal(calls.length, 0);
});

test("submission is single-flight and matching retries reuse the normalized payload and key", async () => {
  const first = deferred();
  const retry = deferred();
  const calls = [];
  const responses = [first, retry];
  const { controller } = makeController({ send: (input) => { calls.push(input); return responses[calls.length - 1].promise; } });
  controller.updateMessage("  Please check in tomorrow.  ");
  const one = controller.send();
  assert.equal(controller.send(), one);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].message, "Please check in tomorrow.");
  first.reject(Object.assign(new Error("timeout"), { code: "ECONNABORTED" }));
  assert.equal(await one, false);
  assert.equal(controller.getState().phase, "uncertain");
  assert.equal(controller.updateMessage("Different message"), false);

  const retried = controller.retry();
  assert.equal(calls[1].idempotencyKey, calls[0].idempotencyKey);
  assert.equal(calls[1].message, calls[0].message);
  retry.resolve({ changed: false, checkIn: { id: 88, classroomId: 7, recipientStudentId: 51, message: calls[0].message } });
  assert.equal(await retried, true);
  assert.equal(controller.getState().phase, "success");
});

test("HTTP 500 remains uncertain across close and reopen and retries the exact operation", async () => {
  const calls = [];
  const { controller } = makeController({
    send: async (input) => {
      calls.push(input);
      if (calls.length === 1) {
        throw { response: { status: 500, data: { code: "SERVER_ERROR" } } };
      }
      return {
        changed: false,
        checkIn: {
          id: 88,
          classroomId: input.classroomId,
          recipientStudentId: input.studentId,
          message: input.message,
        },
      };
    },
  });

  controller.updateMessage("  Please check in tomorrow.  ");
  assert.equal(await controller.send(), false);
  assert.equal(controller.getState().phase, "uncertain");
  assert.equal(controller.getState().message, "Please check in tomorrow.");
  assert.equal(controller.updateMessage("Different message"), false);

  controller.close();
  controller.open(target());
  assert.equal(controller.getState().phase, "uncertain");
  assert.equal(controller.getState().message, "Please check in tomorrow.");

  assert.equal(await controller.retry(), true);
  assert.deepEqual(
    calls.map(({ classroomId, studentId, message, idempotencyKey }) => ({
      classroomId, studentId, message, idempotencyKey,
    })),
    [
      { classroomId: 7, studentId: 51, message: "Please check in tomorrow.", idempotencyKey: "checkin_key_1" },
      { classroomId: 7, studentId: 51, message: "Please check in tomorrow.", idempotencyKey: "checkin_key_1" },
    ],
  );
  assert.equal(controller.getState().phase, "success");
});

test("representative gateway and service HTTP 5xx responses remain uncertain", async () => {
  for (const status of [502, 503, 504]) {
    const { controller } = makeController({
      send: async () => { throw { response: { status, data: { code: "SERVER_ERROR" } } }; },
    });
    controller.updateMessage(`Check-in after ${status}`);
    assert.equal(await controller.send(), false);
    assert.equal(controller.getState().phase, "uncertain");
    assert.equal(controller.updateMessage("Replacement payload"), false);
  }
});

test("rate limits preserve the operation and respect Retry-After before retrying", async () => {
  let now = 10_000;
  const calls = [];
  const { controller } = makeController({
    now: () => now,
    send: async (input) => {
      calls.push(input);
      if (calls.length === 1) throw { response: { status: 429, data: { code: "CHECK_IN_RATE_LIMITED" }, headers: { "retry-after": "3" } } };
      return { changed: true, checkIn: { id: 9, classroomId: 7, recipientStudentId: 51, message: input.message } };
    },
  });
  controller.updateMessage("Hello");
  assert.equal(await controller.send(), false);
  assert.equal(controller.getState().phase, "rate-limited");
  assert.equal(controller.getState().retryAt, 13_000);
  assert.equal(controller.retry(), false);
  now = 13_000;
  assert.equal(await controller.retry(), true);
  assert.equal(calls[1].idempotencyKey, calls[0].idempotencyKey);
});

test("known service errors are distinct and failed mutations remain editable", async () => {
  const scenarios = [
    ["INVALID_REQUEST", "validation"],
    ["ACTIVE_STUDENT_NOT_FOUND", "unavailable"],
    ["CLASSROOM_INACTIVE", "unavailable"],
    ["IDEMPOTENCY_KEY_CONFLICT", "conflict"],
  ];
  for (const [code, kind] of scenarios) {
    const { controller } = makeController({ send: async () => { throw { response: { status: 409, data: { code, message: "private detail" } } }; } });
    controller.updateMessage("Hello");
    assert.equal(await controller.send(), false);
    assert.equal(controller.getState().errorKind, kind);
    assert.doesNotMatch(controller.getState().error, /private detail/);
    assert.equal(controller.updateMessage("New draft"), true);
  }
});

test("close and reopen retain an unresolved operation while recipient changes fence completions", async () => {
  const pending = deferred();
  const calls = [];
  const { controller } = makeController({ send: (input) => { calls.push(input); return pending.promise; } });
  controller.updateMessage("Still there?");
  const inFlight = controller.send();
  controller.close();
  assert.equal(controller.getState().open, false);
  controller.open(target());
  assert.equal(controller.getState().phase, "uncertain");
  assert.equal(controller.getState().message, "Still there?");
  controller.open(target(52));
  pending.resolve({ changed: true, checkIn: { id: 1, classroomId: 7, recipientStudentId: 51, message: "Still there?" } });
  assert.equal(await inFlight, false);
  assert.equal(controller.getState().target.student.userId, 52);
  assert.notEqual(controller.getState().phase, "success");
});

test("account changes and disposal abort and clear every private operation", async () => {
  const pending = deferred();
  let aborted = false;
  const { controller } = makeController({ send: ({ signal }) => { signal.addEventListener("abort", () => { aborted = true; }); return pending.promise; } });
  controller.updateMessage("Private");
  const inFlight = controller.send();
  controller.setScope({ accountId: 43, classroomId: 7 });
  assert.equal(aborted, true);
  assert.equal(controller.getState().open, false);
  assert.equal(controller.getState().message, "");
  pending.resolve({ changed: true, checkIn: { id: 1 } });
  assert.equal(await inFlight, false);
  controller.dispose();
  assert.equal(controller.getState().message, "");
});

test("late failures after recipient changes and unmount cannot expose private errors", async () => {
  const recipientFailure = deferred();
  const unmountFailure = deferred();
  const responses = [recipientFailure, unmountFailure];
  let call = 0;
  const { controller } = makeController({ send: () => responses[call++].promise });
  controller.updateMessage("First private message");
  const first = controller.send();
  controller.open(target(52));
  recipientFailure.reject(new Error("private transport detail"));
  assert.equal(await first, false);
  assert.equal(controller.getState().error, "");

  controller.updateMessage("Second private message");
  const second = controller.send();
  controller.dispose();
  unmountFailure.reject(new Error("private transport detail"));
  assert.equal(await second, false);
  assert.equal(controller.getState().message, "");
  assert.equal(controller.getState().error, "");
});
