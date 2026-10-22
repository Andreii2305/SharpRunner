import assert from "node:assert/strict";
import test from "node:test";
import {
  createJoinRequestController,
  getJoinRequestFocusTarget,
  normalizeJoinRequestError,
} from "./teacherJoinRequestState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const page = ({ total = 1, currentPage = 1, requests = [{ studentId: 7 }] } = {}) => ({
  total,
  page: currentPage,
  limit: 10,
  totalPages: Math.max(1, Math.ceil(total / 10)),
  requests,
});

test("join-request controller sends exact identities and single-flights each student decision", async () => {
  const mutation = deferred();
  const decisions = [];
  const pending = [];
  const controller = createJoinRequestController({
    listRequests: async () => page({ total: 0, requests: [] }),
    decideRequest: (input) => { decisions.push(input); return mutation.promise; },
    onDecisionPending: (studentId, value) => pending.push([studentId, value]),
  });
  controller.setClassroom("25");

  const first = controller.decide({ classroomId: "25", studentId: 7, decision: "approve", page: 1, rowIndex: 0 });
  assert.equal(await controller.decide({ classroomId: "25", studentId: 7, decision: "reject", page: 1, rowIndex: 0 }), false);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].classroomId, "25");
  assert.equal(decisions[0].studentId, 7);
  assert.equal(decisions[0].decision, "approve");

  mutation.resolve({ changed: true, decision: "approve", membership: { studentId: 7, status: "active" } });
  assert.equal(await first, true);
  assert.deepEqual(pending, [[7, true], [7, false]]);
});

test("a confirmed decision reports success only after both refreshes succeed", async () => {
  const rosterRefresh = deferred();
  const completions = [];
  const controller = createJoinRequestController({
    decideRequest: async () => ({ changed: true, decision: "approve", membership: { studentId: 7, status: "active" } }),
    listRequests: async () => page({ total: 0, requests: [] }),
    onRosterRefresh: () => rosterRefresh.promise,
    onRefreshAfterDecisionComplete: (outcome, context) => completions.push([outcome, context]),
  });
  controller.setClassroom("25");

  let settled = false;
  const decision = controller.decide({ classroomId: "25", studentId: 7, decision: "approve", page: 1, rowIndex: 0 })
    .then((value) => { settled = true; return value; });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false);
  rosterRefresh.resolve(true);
  assert.equal(await decision, true);
  assert.deepEqual(completions, [[
    { pendingList: true, roster: true },
    { classroomId: "25", studentId: 7, decision: "approve", rowIndex: 0 },
  ]]);
});

test("a confirmed decision reports roster refresh failure separately", async () => {
  const completions = [];
  const controller = createJoinRequestController({
    decideRequest: async () => ({ changed: true }),
    listRequests: async () => page({ total: 0, requests: [] }),
    onRosterRefresh: async () => false,
    onRefreshAfterDecisionComplete: (outcome) => completions.push(outcome),
  });
  controller.setClassroom("25");

  assert.equal(await controller.decide({ classroomId: "25", studentId: 7, decision: "reject" }), true);
  assert.deepEqual(completions, [{ pendingList: true, roster: false }]);
});

test("a confirmed decision reports pending-list refresh failure separately", async () => {
  const completions = [];
  const controller = createJoinRequestController({
    decideRequest: async () => ({ changed: true }),
    listRequests: async () => { throw new Error("offline"); },
    onRosterRefresh: async () => true,
    onRefreshAfterDecisionComplete: (outcome) => completions.push(outcome),
  });
  controller.setClassroom("25");

  assert.equal(await controller.decide({ classroomId: "25", studentId: 7, decision: "approve" }), true);
  assert.deepEqual(completions, [{ pendingList: false, roster: true }]);
});

test("a confirmed decision remains successful when both refreshes fail", async () => {
  const completions = [];
  const controller = createJoinRequestController({
    decideRequest: async () => ({ changed: true }),
    listRequests: async () => { throw new Error("offline"); },
    onRosterRefresh: async () => false,
    onRefreshAfterDecisionComplete: (outcome) => completions.push(outcome),
  });
  controller.setClassroom("25");

  assert.equal(await controller.decide({ classroomId: "25", studentId: 7, decision: "approve" }), true);
  assert.deepEqual(completions, [{ pendingList: false, roster: false }]);
});

test("refresh retry updates data without repeating the decision", async () => {
  let decisionCalls = 0;
  let listCalls = 0;
  let rosterCalls = 0;
  const completions = [];
  const controller = createJoinRequestController({
    decideRequest: async () => { decisionCalls += 1; return { changed: true }; },
    listRequests: async () => { listCalls += 1; return page({ total: 0, requests: [] }); },
    onRosterRefresh: async () => { rosterCalls += 1; return rosterCalls > 1; },
    onRefreshAfterDecisionComplete: (outcome) => completions.push(outcome),
  });
  controller.setClassroom("25");
  const context = { classroomId: "25", studentId: 7, decision: "approve", rowIndex: 0 };

  assert.equal(await controller.decide({ ...context, page: 1, limit: 10 }), true);
  assert.equal(typeof controller.refreshAfterDecision, "function");
  assert.equal(await controller.refreshAfterDecision({ context, page: 1, limit: 10 }), true);
  assert.equal(decisionCalls, 1);
  assert.equal(listCalls, 2);
  assert.equal(rosterCalls, 2);
  assert.deepEqual(completions, [
    { pendingList: true, roster: false },
    { pendingList: true, roster: true },
  ]);
});

test("switching classrooms while refreshes are pending ignores every stale completion", async () => {
  const listRefresh = deferred();
  const rosterRefresh = deferred();
  const completions = [];
  const listSuccesses = [];
  const controller = createJoinRequestController({
    decideRequest: async () => ({ changed: true }),
    listRequests: () => listRefresh.promise,
    onRosterRefresh: () => rosterRefresh.promise,
    onListSuccess: (result) => listSuccesses.push(result),
    onRefreshAfterDecisionComplete: (outcome) => completions.push(outcome),
  });
  controller.setClassroom("A");

  let settled = false;
  const decision = controller.decide({ classroomId: "A", studentId: 7, decision: "approve" })
    .then((value) => { settled = true; return value; });
  await Promise.resolve();
  assert.equal(settled, false);

  controller.setClassroom("B");
  listRefresh.resolve(page({ total: 0, requests: [] }));
  rosterRefresh.resolve(true);
  assert.equal(await decision, false);
  assert.deepEqual(completions, []);
  assert.deepEqual(listSuccesses, []);
});

test("stale conflicts explain the change and refresh without retrying the mutation", async () => {
  const conflict = Object.assign(new Error("conflict"), {
    response: { status: 409, data: { code: "CLASSROOM_MEMBERSHIP_DECISION_CONFLICT" } },
  });
  let decisionCalls = 0;
  let listCalls = 0;
  const errors = [];
  const controller = createJoinRequestController({
    decideRequest: async () => { decisionCalls += 1; throw conflict; },
    listRequests: async () => { listCalls += 1; return page({ total: 0, requests: [] }); },
    onDecisionError: (error) => errors.push(error),
  });
  controller.setClassroom("25");

  assert.equal(await controller.decide({ classroomId: "25", studentId: 7, decision: "approve", page: 1, rowIndex: 0 }), false);
  assert.equal(decisionCalls, 1);
  assert.equal(listCalls, 1);
  assert.equal(errors[0].code, "CLASSROOM_MEMBERSHIP_DECISION_CONFLICT");
  assert.match(errors[0].message, /request changed/i);
});

test("failed decisions leave the pending collection untouched", async () => {
  const error = Object.assign(new Error("full"), {
    response: { status: 409, data: { code: "CLASSROOM_CAPACITY_REACHED" } },
  });
  let listCalls = 0;
  let confirmed = 0;
  const failures = [];
  const controller = createJoinRequestController({
    decideRequest: async () => { throw error; },
    listRequests: async () => { listCalls += 1; return page(); },
    onDecisionConfirmed: () => { confirmed += 1; },
    onDecisionError: (result) => failures.push(result),
  });
  controller.setClassroom("25");

  assert.equal(await controller.decide({ classroomId: "25", studentId: 7, decision: "approve", page: 1, rowIndex: 0 }), false);
  assert.equal(confirmed, 0);
  assert.equal(listCalls, 0);
  assert.equal(failures[0].code, "CLASSROOM_CAPACITY_REACHED");
});

test("list requests ignore late classroom responses and recover an emptied final page", async () => {
  const first = deferred();
  const successes = [];
  const pages = [];
  const calls = [];
  const controller = createJoinRequestController({
    decideRequest: async () => ({}),
    listRequests: (input) => {
      calls.push(input);
      if (input.classroomId === "A") return first.promise;
      if (input.page === 2) return Promise.resolve(page({ total: 10, currentPage: 2, requests: [] }));
      return Promise.resolve(page({ total: 10, currentPage: 1, requests: [{ studentId: 9 }] }));
    },
    onListSuccess: (payload) => successes.push(payload),
    onPageChange: (value) => pages.push(value),
  });
  controller.setClassroom("A");
  const late = controller.load({ classroomId: "A", page: 1 });
  controller.setClassroom("B");
  assert.equal(await controller.load({ classroomId: "B", page: 2 }), true);
  first.resolve(page({ requests: [{ studentId: 1 }] }));
  assert.equal(await late, false);

  assert.deepEqual(pages, [1]);
  assert.deepEqual(successes.map((result) => result.requests.map((row) => row.studentId)), [[9]]);
  assert.deepEqual(calls.slice(1).map((call) => call.page), [2, 1]);
});

test("focus target advances to the next row, falls back to the previous row, then the section", () => {
  assert.deepEqual(getJoinRequestFocusTarget([{ studentId: 8 }, { studentId: 9 }], 0), { type: "student", studentId: 8 });
  assert.deepEqual(getJoinRequestFocusTarget([{ studentId: 8 }], 4), { type: "student", studentId: 8 });
  assert.deepEqual(getJoinRequestFocusTarget([], 0), { type: "section" });
});

test("join-request errors give useful capacity and inactive-classroom guidance", () => {
  assert.match(normalizeJoinRequestError({ response: { data: { code: "CLASSROOM_CAPACITY_REACHED" } } }).message, /full/i);
  assert.match(normalizeJoinRequestError({ response: { data: { code: "CLASSROOM_INACTIVE" } } }).message, /inactive/i);
});
