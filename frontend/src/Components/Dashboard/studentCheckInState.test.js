import assert from "node:assert/strict";
import test from "node:test";
import { createStudentCheckInController } from "./studentCheckInState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const payload = (overrides = {}) => ({
  checkIns: [{ id: "check-in-81", senderRole: "teacher", sender: null, classroom: null, message: "Hello", createdAt: "2026-10-25T00:00:00.000Z", isRead: false }],
  page: 1, limit: 20, total: 1, totalPages: 1, unreadTotal: 1, ...overrides,
});
const harness = ({ list = async () => payload(), mark = async () => ({}) } = {}) => {
  const events = [];
  const controller = createStudentCheckInController({
    list,
    mark,
    onReset: (value) => events.push(["reset", value]),
    onListLoading: () => events.push(["list-loading"]),
    onListSuccess: (value) => events.push(["list-success", value]),
    onListError: (value) => events.push(["list-error", value]),
    onListFinish: () => events.push(["list-finish"]),
    onMarkStart: (id) => events.push(["mark-start", id]),
    onMarkSuccess: (id) => events.push(["mark-success", id]),
    onMarkError: (id, message) => events.push(["mark-error", id, message]),
    onRefreshStart: () => events.push(["refresh-start"]),
    onRefreshError: (message) => events.push(["refresh-error", message]),
    onRefreshFinish: () => events.push(["refresh-finish"]),
  });
  return { controller, events };
};

test("page changes synchronously reset metadata and fence late list success error and completion", async () => {
  const first = deferred();
  const second = deferred();
  const requests = [first, second];
  const { controller, events } = harness({ list: () => requests.shift().promise });
  controller.setAccount("51");
  const loadingOne = controller.load();
  controller.setPage(2);
  first.resolve(payload());
  assert.equal(await loadingOne, false);
  const loadingTwo = controller.load();
  controller.setPage(3);
  second.reject(new Error("old page failed"));
  assert.equal(await loadingTwo, false);
  assert.equal(events.some(([type]) => type === "list-success"), false);
  assert.equal(events.some(([type]) => type === "list-error"), false);
  assert.equal(events.some(([type]) => type === "list-finish"), false);
  assert.deepEqual(events.at(-1), ["reset", { page: 3 }]);
});

test("account changes and disposal fence private list and mark-read completions", async () => {
  const listing = deferred();
  const marking = deferred();
  const { controller, events } = harness({ list: () => listing.promise, mark: () => marking.promise });
  controller.setAccount("51");
  const listPromise = controller.load();
  const markPromise = controller.markAsRead("check-in-81");
  controller.setAccount("52");
  listing.resolve(payload());
  marking.resolve({});
  assert.equal(await listPromise, false);
  assert.equal(await markPromise, false);
  assert.equal(events.some(([type]) => type === "list-success" || type === "mark-success"), false);
  controller.dispose();
});

test("duplicate loads and duplicate per-message read actions share one request", async () => {
  const listing = deferred();
  const marking = deferred();
  let listCalls = 0;
  let markCalls = 0;
  const { controller, events } = harness({
    list: () => { listCalls += 1; return listing.promise; },
    mark: () => { markCalls += 1; return marking.promise; },
  });
  controller.setAccount("51");
  const loadOne = controller.load();
  const loadTwo = controller.load();
  assert.equal(listCalls, 1);
  listing.resolve(payload());
  await Promise.all([loadOne, loadTwo]);

  const readOne = controller.markAsRead("check-in-81");
  const readTwo = controller.markAsRead("check-in-81");
  assert.equal(markCalls, 1);
  marking.reject(new Error("offline"));
  await Promise.all([readOne, readTwo]);
  assert.equal(events.filter(([type]) => type === "mark-error").length, 1);
  assert.equal(events.some(([type]) => type === "mark-success"), false);
});

test("unmount aborts both request types and ignores their late failure paths", async () => {
  const listing = deferred();
  const marking = deferred();
  let listSignal;
  let markSignal;
  const { controller, events } = harness({
    list: ({ signal }) => { listSignal = signal; return listing.promise; },
    mark: ({ signal }) => { markSignal = signal; return marking.promise; },
  });
  controller.setAccount("51");
  const listPromise = controller.load();
  const markPromise = controller.markAsRead("check-in-81");
  controller.dispose();
  assert.equal(listSignal.aborted, true);
  assert.equal(markSignal.aborted, true);
  listing.reject(new Error("late list"));
  marking.reject(new Error("late mark"));
  await Promise.all([listPromise, markPromise]);
  assert.equal(events.some(([type]) => type === "list-error" || type === "mark-error"), false);
});

test("reactivation after effect cleanup can recover the same account without duplicate active loads", async () => {
  const first = deferred();
  let calls = 0;
  const { controller } = harness({
    list: () => {
      calls += 1;
      return calls === 1 ? first.promise : Promise.resolve(payload());
    },
  });
  controller.setAccount("51");
  const stale = controller.load();
  controller.dispose();
  first.resolve(payload());
  assert.equal(await stale, false);
  controller.activate();
  assert.equal(await controller.load(), true);
  assert.equal(calls, 2);
  assert.equal(await controller.load(), true);
  assert.equal(calls, 2);
});

test("confirmed read stays successful when its authoritative refresh fails and retry only lists", async () => {
  const listCalls = [];
  let markCalls = 0;
  const { controller, events } = harness({
    list: async (input) => {
      listCalls.push(input);
      if (listCalls.length === 1) return payload();
      if (listCalls.length === 2) throw new Error("refresh unavailable");
      return payload({ unreadTotal: 0, checkIns: [{ ...payload().checkIns[0], isRead: true }] });
    },
    mark: async () => { markCalls += 1; return {}; },
  });
  controller.setAccount("51");
  await controller.load();
  assert.equal(await controller.markAsRead("check-in-81"), true);
  assert.equal(markCalls, 1);
  assert.equal(events.some(([type]) => type === "mark-error"), false);
  assert.match(events.find(([type]) => type === "refresh-error")[1], /saved/i);
  assert.equal(await controller.refresh(), true);
  assert.equal(markCalls, 1);
  assert.equal(events.filter(([type]) => type === "list-success").at(-1)[1].checkIns[0].isRead, true);
});

test("a list started before confirmed read cannot revert that row to unread", async () => {
  const stale = deferred();
  let listCall = 0;
  const { controller, events } = harness({
    list: () => {
      listCall += 1;
      if (listCall === 1) return Promise.resolve(payload());
      if (listCall === 2) return stale.promise;
      return Promise.resolve(payload({ unreadTotal: 0, checkIns: [{ ...payload().checkIns[0], isRead: true }] }));
    },
  });
  controller.setAccount("51");
  await controller.load();
  const oldList = controller.load({ force: true });
  await controller.markAsRead("check-in-81");
  stale.resolve(payload());
  assert.equal(await oldList, false);
  const successes = events.filter(([type]) => type === "list-success");
  assert.equal(successes.at(-1)[1].checkIns[0].isRead, true);
});
