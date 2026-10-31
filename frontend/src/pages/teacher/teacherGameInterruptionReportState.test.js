import assert from "node:assert/strict";
import test from "node:test";
import {
  createTeacherGameInterruptionReportController,
  initialTeacherGameInterruptionReportState,
} from "./teacherGameInterruptionReportState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

const report = ({ sessionPage = 1, eventPage = 1, classroomId = 25, studentId = 11, levelKey = "arrays-level-1" } = {}) => ({
  scope: {
    classroom: { id: classroomId, className: "Algorithms", section: "A", isActive: true },
    student: { id: studentId, firstName: "Ada", lastName: "Lovelace", username: "ada" },
    level: { levelKey, lessonTitle: "Arrays", levelNumber: 1 },
  },
  summary: {
    recordedEventCount: 2,
    appliedEventCount: 1,
    unappliedEventCount: 1,
    actualScoreDeduction: 0,
    actualXpDeduction: 0,
  },
  completionEvidence: { availability: "unavailable" },
  sessions: { items: [], page: sessionPage, limit: 20, total: 2, totalPages: 1 },
  events: {
    items: [
      { id: 2, sessionId: 7, type: "fullscreen_exit", receivedAt: "2026-10-31T01:00:00.000Z", applicationStatus: "applied", appliedAt: "2026-10-31T02:00:00.000Z", actualScoreDeduction: 0, actualXpDeduction: 0 },
      { id: 1, sessionId: 7, type: "hidden", receivedAt: "2026-10-31T00:00:00.000Z", applicationStatus: "unapplied", appliedAt: null, actualScoreDeduction: null, actualXpDeduction: null },
    ],
    page: eventPage,
    limit: 20,
    total: 2,
    totalPages: 1,
  },
  generatedAt: "2026-10-31T03:00:00.000Z",
});

const scope = (overrides = {}) => ({
  accountId: 7,
  classroomId: 25,
  studentId: 11,
  levelKey: "arrays-level-1",
  ...overrides,
});

test("controller requires an exact classroom and validates the authoritative response identity", async () => {
  const calls = [];
  let state = initialTeacherGameInterruptionReportState();
  const controller = createTeacherGameInterruptionReportController({
    request: async (input) => { calls.push(input); return report(); },
    onChange: (next) => { state = next; },
  });
  controller.activate();
  controller.setScope(scope({ classroomId: "all" }));
  await controller.open();
  assert.equal(state.status, "inaccessible");
  assert.equal(calls.length, 0);

  controller.setScope(scope());
  await controller.open();
  assert.equal(state.status, "success");
  assert.equal(state.report.summary.recordedEventCount, 2);
  assert.equal(calls[0].sessionPage, 1);
  assert.equal(calls[0].eventPage, 1);

  controller.close();
  controller.setScope(scope({ studentId: 12 }));
  calls.length = 0;
  calls.push = () => 1;
  controller.dispose();
});

test("independent pagination clears the snapshot and preserves the other page", async () => {
  const requests = [];
  let state;
  const controller = createTeacherGameInterruptionReportController({
    request: async (input) => { requests.push(input); return report({ sessionPage: input.sessionPage, eventPage: input.eventPage }); },
    onChange: (next) => { state = next; },
  });
  controller.activate();
  controller.setScope(scope());
  await controller.open();
  const sessionPromise = controller.setSessionPage(2);
  assert.equal(state.status, "loading");
  assert.equal(state.report, null);
  await sessionPromise;
  assert.deepEqual([requests.at(-1).sessionPage, requests.at(-1).eventPage], [2, 1]);
  await controller.setEventPage(3);
  assert.deepEqual([requests.at(-1).sessionPage, requests.at(-1).eventPage], [2, 3]);
  assert.equal(state.report.events.page, 3);
});

test("mismatched classroom student or canonical level responses never replace the snapshot", async () => {
  for (const payload of [
    report({ classroomId: 26 }),
    report({ studentId: 12 }),
    report({ levelKey: "arrays-level-2" }),
  ]) {
    let state;
    const controller = createTeacherGameInterruptionReportController({
      request: async () => payload,
      onChange: (next) => { state = next; },
    });
    controller.activate();
    controller.setScope(scope());
    await controller.open();
    assert.equal(state.status, "error");
    assert.equal(state.report, null);
    assert.match(state.error, /could not be verified/);
    controller.dispose();
  }
});

test("scope changes close and disposal fence late success error and finally updates", async () => {
  const firstPending = deferred();
  const secondPending = deferred();
  const thirdPending = deferred();
  const pending = [firstPending, secondPending, thirdPending];
  const states = [];
  const controller = createTeacherGameInterruptionReportController({
    request: () => pending.shift().promise,
    onChange: (next) => states.push(next),
  });
  controller.activate();
  controller.setScope(scope());
  const first = controller.open();
  controller.setScope(scope({ levelKey: "arrays-level-2" }));
  firstPending.resolve(report());
  await first;
  assert.equal(states.at(-1).status, "idle");

  const second = controller.open();
  controller.close();
  secondPending.reject(new Error("late private error"));
  await second;
  assert.equal(states.at(-1).status, "idle");

  controller.activate();
  const third = controller.open();
  controller.dispose();
  thirdPending.resolve(report({ levelKey: "arrays-level-2" }));
  await third;
  assert.notEqual(states.at(-1).status, "success");
});

test("errors are distinct and StrictMode-style activate dispose activate creates a usable replacement load", async () => {
  const errors = [
    Object.assign(new Error("denied"), { response: { status: 403 } }),
    Object.assign(new Error("contradiction"), { response: { status: 409, data: { code: "REPORT_INTEGRITY_ERROR" } } }),
    new Error("offline"),
  ];
  let state;
  const controller = createTeacherGameInterruptionReportController({
    request: async () => { if (errors.length) throw errors.shift(); return report(); },
    onChange: (next) => { state = next; },
  });
  controller.activate();
  controller.setScope(scope());
  await controller.open();
  assert.equal(state.status, "inaccessible");
  controller.close();
  await controller.open();
  assert.equal(state.status, "integrity-error");
  controller.close();
  await controller.open();
  assert.equal(state.status, "error");

  controller.dispose();
  controller.activate();
  await controller.open();
  assert.equal(state.status, "success");
});
