import assert from "node:assert/strict";
import test from "node:test";
import * as contentListState from "./adminContentListState.js";

const {
  buildAdminContentListPath,
  createAdminContentRequestController,
  createAdminContentTransitions,
} = contentListState;

const assign = (target, key) => (next) => {
  target[key] = typeof next === "function" ? next(target[key]) : next;
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createHarness = () => {
  const state = {
    content: [{ id: 1, title: "Previous result" }],
    meta: { total: 41, totalPages: 3 },
    error: "Previous error",
    loading: false,
    filters: { search: "loops", type: "lesson", status: "published" },
    page: 4,
  };
  const requests = createAdminContentRequestController({
    setContent: assign(state, "content"),
    setMeta: assign(state, "meta"),
    setError: assign(state, "error"),
    setLoading: assign(state, "loading"),
  });
  const transitions = createAdminContentTransitions({
    requests,
    setFilters: assign(state, "filters"),
    setPage: assign(state, "page"),
  });
  return { state, requests, transitions };
};

test("admin content requests use the selected status and preserve other filters", () => {
  assert.equal(
    buildAdminContentListPath({ search: "loops", type: "lesson", status: "scheduled" }, 3),
    "/api/admin/content?page=3&limit=20&search=loops&type=lesson&status=scheduled",
  );
  assert.equal(
    buildAdminContentListPath({ search: "loops", type: "lesson", status: "" }, 1),
    "/api/admin/content?page=1&limit=20&search=loops&type=lesson",
  );
});

test("content transitions fence late success error and loading updates before replacement requests begin", async () => {
  assert.equal(typeof createAdminContentRequestController, "function");
  assert.equal(typeof createAdminContentTransitions, "function");
  const cases = [
    ["search", ({ transitions }) => transitions.changeFilter("search", "arrays")],
    ["type", ({ transitions }) => transitions.changeFilter("type", "module")],
    ["status", ({ transitions }) => transitions.changeFilter("status", "archived")],
    ["page", ({ transitions }) => transitions.changePage(2)],
    ["view", ({ transitions }) => transitions.changeView("students", "content")],
    ["unmount", ({ requests }) => requests.invalidate()],
  ];

  for (const [name, transition] of cases) {
    for (const outcome of ["resolve", "reject"]) {
      const harness = createHarness();
      const requestA = deferred();
      const completionA = harness.requests.run(
        () => requestA.promise,
        { mapError: () => "late failure" },
      );

      transition(harness);
      if (outcome === "resolve") {
        requestA.resolve({ content: [{ id: 99 }], total: 1, totalPages: 1 });
      } else {
        requestA.reject(new Error("request A failed"));
      }

      assert.equal(await completionA, false, `${name} ${outcome} is stale`);
      assert.deepEqual(harness.state.content, [], `${name} ${outcome} cannot restore stale rows`);
      assert.deepEqual(harness.state.meta, { total: null, totalPages: null }, `${name} ${outcome} cannot restore stale metadata`);
      assert.equal(harness.state.error, "", `${name} ${outcome} cannot restore a stale error`);
      assert.equal(harness.state.loading, true, `${name} ${outcome} cannot finish replacement loading`);
    }
  }
});

test("content filter transitions reset pagination while page navigation preserves filters", () => {
  for (const [name, value] of [["search", "arrays"], ["type", "module"], ["status", "scheduled"]]) {
    const { state, transitions } = createHarness();
    if (name === "status") state.filters.published = "true";
    transitions.changeFilter(name, value);
    assert.equal(state.filters[name], value);
    if (name === "status") assert.equal(Object.hasOwn(state.filters, "published"), false);
    assert.equal(state.page, 1);
    assert.deepEqual(state.content, []);
    assert.deepEqual(state.meta, { total: null, totalPages: null });
    assert.equal(state.error, "");
    assert.equal(state.loading, true);
  }

  const { state, transitions } = createHarness();
  const appliedFilters = state.filters;
  transitions.changePage(2);
  assert.equal(state.page, 2);
  assert.equal(state.filters, appliedFilters);
});

test("current content success restores rows and metadata while current failure leaves totals unavailable", async () => {
  const successful = createHarness();
  successful.transitions.changeFilter("search", "arrays");
  const response = {
    content: [{ id: 2, title: "Current result" }],
    total: 21,
    totalPages: 2,
  };
  assert.equal(await successful.requests.run(async () => response), true);
  assert.deepEqual(successful.state.content, response.content);
  assert.deepEqual(successful.state.meta, { total: 21, totalPages: 2 });
  assert.equal(successful.state.error, "");
  assert.equal(successful.state.loading, false);

  const failed = createHarness();
  failed.transitions.changeFilter("type", "assignment");
  assert.equal(await failed.requests.run(
    async () => { throw new Error("network failure"); },
    { mapError: () => "Unable to load content." },
  ), false);
  assert.deepEqual(failed.state.content, []);
  assert.deepEqual(failed.state.meta, { total: null, totalPages: null });
  assert.equal(failed.state.error, "Unable to load content.");
  assert.equal(failed.state.loading, false);
});
