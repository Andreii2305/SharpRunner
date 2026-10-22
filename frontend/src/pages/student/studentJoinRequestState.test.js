import assert from "node:assert/strict";
import test from "node:test";
import {
  createStudentJoinRequestController,
  getSubmissionNotice,
  reconcileMembershipSummary,
} from "./studentJoinRequestState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const classroom = (id, className = `Class ${id}`) => ({
  id,
  className,
  section: "A",
  schoolYear: "2026-2027",
});

const summary = ({ active = [], pending = [] } = {}) => ({
  hasActiveMembership: active.length > 0,
  classrooms: active,
  pendingRequests: pending.map((item) => ({
    classroom: item,
    status: "pending",
    requestedAt: "2026-10-22T08:00:00.000Z",
  })),
});

test("membership reconciliation matches approval against actual /me.classrooms IDs", () => {
  const pendingClassroom = classroom(8, "Pending B");
  const previous = new Map([["8", pendingClassroom]]);

  const approved = reconcileMembershipSummary(summary({ active: [classroom(8)] }), previous);
  assert.equal(approved.requestStates[0].state, "approved");

  const activeElsewhere = reconcileMembershipSummary(summary({ active: [classroom(7)] }), previous);
  assert.equal(activeElsewhere.requestStates[0].state, "no-longer-pending");
  assert.equal(activeElsewhere.hasActiveMembership, true);
});

test("submission notices distinguish new pending, existing pending, and already active", () => {
  const classroomRecord = classroom(8, "Web Systems");
  assert.match(getSubmissionNotice({ changed: true, classroom: classroomRecord, membership: { status: "pending" } }).message, /submitted/i);
  assert.match(getSubmissionNotice({ changed: false, classroom: classroomRecord, membership: { status: "pending" } }).message, /already awaiting/i);
  assert.match(getSubmissionNotice({ changed: false, classroom: classroomRecord, membership: { status: "active" } }).message, /already an active member/i);
});

test("initial load restores pending requests and active-plus-pending state", async () => {
  const results = [];
  const controller = createStudentJoinRequestController({
    getMembershipSummary: async () => summary({
      active: [classroom(7, "Active A")],
      pending: [classroom(8, "Pending B")],
    }),
    submitJoinRequest: async () => assert.fail("must not submit"),
    onSummary: (value) => results.push(value),
  });
  controller.setAccount("51");

  assert.equal(await controller.load({ reason: "initial" }), true);
  assert.equal(results[0].hasActiveMembership, true);
  assert.deepEqual(results[0].requestStates.map((item) => [item.classroom.id, item.state]), [[8, "pending"]]);
});

test("submission is single-flight and sends only the normalized class code", async () => {
  const mutation = deferred();
  const calls = [];
  const pending = [];
  const controller = createStudentJoinRequestController({
    getMembershipSummary: async () => summary({ pending: [classroom(8)] }),
    submitJoinRequest: (input) => { calls.push(input); return mutation.promise; },
    onSubmitPending: (value) => pending.push(value),
  });
  controller.setAccount("51");

  const first = controller.submit({ classCode: "ABC234" });
  assert.equal(await controller.submit({ classCode: "OTHER" }), false);
  mutation.resolve({
    changed: true,
    membership: { status: "pending", requestedAt: "2026-10-22T08:00:00.000Z" },
    classroom: classroom(8),
    message: "Join request submitted",
  });
  assert.equal(await first, true);
  assert.deepEqual(calls, [{ classCode: "ABC234" }]);
  assert.deepEqual(pending, [true, false]);
});

test("confirmed pending submission survives a failed follow-up refresh", async () => {
  const events = [];
  const controller = createStudentJoinRequestController({
    submitJoinRequest: async () => ({
      changed: true,
      membership: { status: "pending", requestedAt: "2026-10-22T08:00:00.000Z" },
      classroom: classroom(8, "Pending B"),
      message: "Join request submitted",
    }),
    getMembershipSummary: async () => { throw new Error("offline"); },
    onSubmitConfirmed: (value) => events.push(["confirmed", value.membership.status]),
    onRefreshAfterSubmitError: (error) => events.push(["refresh-error", error.message]),
    onSubmitError: () => events.push(["submission-error"]),
  });
  controller.setAccount("51");

  assert.equal(await controller.submit({ classCode: "ABC234" }), true);
  assert.deepEqual(events, [
    ["confirmed", "pending"],
    ["refresh-error", "offline"],
  ]);
});

test("status checks distinguish approval from a disappearing request", async () => {
  const responses = [
    summary({ pending: [classroom(8, "Pending B")] }),
    summary({ active: [classroom(7, "Active A")] }),
  ];
  const results = [];
  const controller = createStudentJoinRequestController({
    getMembershipSummary: async () => responses.shift(),
    submitJoinRequest: async () => assert.fail("must not submit"),
    onSummary: (value) => results.push(value),
  });
  controller.setAccount("51");
  await controller.load({ reason: "initial" });
  await controller.load({ reason: "check" });

  assert.equal(results[1].requestStates[0].classroom.id, 8);
  assert.equal(results[1].requestStates[0].state, "no-longer-pending");
  assert.notEqual(results[1].requestStates[0].state, "approved");
});

test("account changes reset immediately and fence old list and decision responses", async () => {
  const oldList = deferred();
  const oldMutation = deferred();
  const resets = [];
  const summaries = [];
  const confirmations = [];
  let account = "old";
  const controller = createStudentJoinRequestController({
    getMembershipSummary: () => account === "old" ? oldList.promise : Promise.resolve(summary()),
    submitJoinRequest: () => oldMutation.promise,
    onReset: (value) => resets.push(value),
    onSummary: (value) => summaries.push(value),
    onSubmitConfirmed: (value) => confirmations.push(value),
  });
  controller.setAccount("old");
  const listResult = controller.load({ reason: "initial" });
  const submitResult = controller.submit({ classCode: "ABC234" });

  account = "new";
  controller.setAccount("new");
  assert.deepEqual(resets, ["old", "new"]);
  oldList.resolve(summary({ pending: [classroom(8)] }));
  oldMutation.resolve({ membership: { status: "pending" }, classroom: classroom(8) });
  assert.equal(await listResult, false);
  assert.equal(await submitResult, false);
  assert.deepEqual(summaries, []);
  assert.deepEqual(confirmations, []);
});
