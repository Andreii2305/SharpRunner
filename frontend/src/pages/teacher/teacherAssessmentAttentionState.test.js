import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseAttentionClassroomId,
  createTeacherAssessmentAttentionController,
} from "./teacherAssessmentAttentionState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

const payload = (classroomId, overrides = {}) => ({
  classroom: { id: classroomId, className: `Class ${classroomId}`, section: "A", schoolYear: "2026-2027" },
  students: [],
  total: 0,
  limit: 5,
  ...overrides,
});

const makeController = (request) => {
  const events = [];
  const controller = createTeacherAssessmentAttentionController({
    request,
    onReset: () => events.push(["reset"]),
    onLoading: (value) => events.push(["loading", value]),
    onSuccess: (value) => events.push(["success", value]),
    onError: (value) => events.push(["error", value]),
    onFinish: () => events.push(["finish"]),
  });
  return { controller, events };
};

test("classroom selection preserves a valid selection and otherwise uses deterministic active order", () => {
  const classrooms = [
    { id: 9, className: "Zulu", section: "A" },
    { id: 3, className: "alpha", section: "B" },
    { id: 2, className: "Alpha", section: "A" },
    { id: 1, className: "Archived", section: "A", isActive: false },
  ];

  assert.equal(chooseAttentionClassroomId(classrooms, "9"), "9");
  assert.equal(chooseAttentionClassroomId(classrooms, "1"), "2");
  assert.equal(chooseAttentionClassroomId(classrooms, "missing"), "2");
  assert.equal(chooseAttentionClassroomId([], "9"), null);
});

test("controller validates classroom identity and retries only the current selection", async () => {
  const calls = [];
  const { controller, events } = makeController(async (input) => {
    calls.push(input);
    if (calls.length === 1) return payload(99);
    return payload(7, { total: 8, students: [{ id: 1 }] });
  });

  controller.setScope({ accountId: "5", classroomId: "7" });
  assert.equal(await controller.load(), false);
  assert.match(events.find((event) => event[0] === "error")[1], /selected classroom/i);
  assert.equal(await controller.retry(), true);
  assert.deepEqual(calls.map(({ classroomId, limit }) => [classroomId, limit]), [["7", 5], ["7", 5]]);
  assert.equal(events.at(-2)[0], "success");
  assert.equal(events.at(-2)[1].total, 8);
});

test("classroom and account changes synchronously reset and fence late success error and finish updates", async () => {
  const oldSuccess = deferred();
  const oldFailure = deferred();
  const requests = [oldSuccess, oldFailure];
  const { controller, events } = makeController(() => requests.shift().promise);

  controller.setScope({ accountId: "5", classroomId: "7" });
  const first = controller.load();
  controller.setScope({ accountId: "5", classroomId: "8" });
  oldSuccess.resolve(payload(7, { total: 1, students: [{ id: 70 }] }));
  assert.equal(await first, false);

  const second = controller.load();
  controller.setScope({ accountId: "6", classroomId: "8" });
  oldFailure.reject(new Error("old account failed"));
  assert.equal(await second, false);

  assert.equal(events.some((event) => event[0] === "success"), false);
  assert.equal(events.some((event) => event[0] === "error"), false);
  assert.equal(events.some((event) => event[0] === "finish"), false);
  assert.deepEqual(events.filter((event) => event[0] === "reset"), [["reset"], ["reset"], ["reset"]]);
});

test("dispose fences late completion and aborts the request where supported", async () => {
  const pending = deferred();
  let signal;
  const { controller, events } = makeController((input) => {
    signal = input.signal;
    return pending.promise;
  });
  controller.setScope({ accountId: "5", classroomId: "7" });
  const loading = controller.load();
  controller.dispose();
  assert.equal(signal.aborted, true);
  pending.resolve(payload(7));
  assert.equal(await loading, false);
  assert.deepEqual(events.slice(-1), [["loading", true]]);
});

test("invalid payload totals remain unavailable through the error path", async () => {
  const { controller, events } = makeController(async () => payload(7, { total: "0" }));
  controller.setScope({ accountId: "5", classroomId: "7" });
  assert.equal(await controller.load(), false);
  assert.match(events.find((event) => event[0] === "error")[1], /incomplete/i);
  assert.deepEqual(events.at(-1), ["finish"]);
});
