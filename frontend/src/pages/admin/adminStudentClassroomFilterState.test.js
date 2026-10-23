import assert from "node:assert/strict";
import test from "node:test";

let stateModule = {};
try {
  stateModule = await import("./adminStudentClassroomFilterState.js");
} catch {
  // The first red run intentionally precedes the feature module.
}

const {
  buildAdminUserFilterSnapshot,
  buildClassroomLookupPath,
  buildUserExportPath,
  buildUserListPath,
  classroomOptionLabel,
  createAdminFilterTransitions,
  createLatestRequestController,
  createRequestFence,
} = stateModule;

const parseQuery = (path) => Object.fromEntries(new URL(path, "https://example.test").searchParams);

test("student list defaults to all classrooms and selected filters preserve search and account status", () => {
  assert.equal(typeof buildAdminUserFilterSnapshot, "function");
  const defaults = buildAdminUserFilterSnapshot({
    activeView: "students",
    userFilters: { search: "ada", status: "inactive", role: "" },
    selectedClassroom: null,
  });
  assert.deepEqual(defaults, { search: "ada", status: "inactive", role: "student" });

  const selected = buildAdminUserFilterSnapshot({
    activeView: "students",
    userFilters: { search: "ada", status: "inactive", role: "" },
    selectedClassroom: { id: 25, className: "Algorithms" },
  });
  assert.deepEqual(selected, { search: "ada", status: "inactive", role: "student", classroomId: 25 });

  const listQuery = parseQuery(buildUserListPath(selected, 3));
  const exportQuery = parseQuery(buildUserExportPath(selected));
  assert.deepEqual(
    { search: exportQuery.search, status: exportQuery.status, role: exportQuery.role, classroomId: exportQuery.classroomId },
    { search: listQuery.search, status: listQuery.status, role: listQuery.role, classroomId: listQuery.classroomId },
  );
  assert.equal(listQuery.page, "3");
  assert.equal(exportQuery.page, "1");
});

test("classroom selection never leaks into Users or Teachers requests", () => {
  const selectedClassroom = { id: 25, className: "Algorithms" };
  const userFilters = { search: "ada", status: "active", role: "admin" };

  assert.deepEqual(buildAdminUserFilterSnapshot({ activeView: "teachers", userFilters, selectedClassroom }), {
    search: "ada", status: "active", role: "teacher",
  });
  assert.deepEqual(buildAdminUserFilterSnapshot({ activeView: "users", userFilters, selectedClassroom }), userFilters);
});

test("classroom lookup uses the verified bounded API contract and includes archived results by default", () => {
  const query = parseQuery(buildClassroomLookupPath({ search: "systems", page: 3 }));
  assert.deepEqual(query, { page: "3", limit: "20", search: "systems" });
  assert.equal("status" in query, false);
  assert.equal(classroomOptionLabel({ className: "Web Systems", section: "B", isActive: false }), "Web Systems · B (Archived)");
});

test("request fences reject late list and classroom-search responses", () => {
  assert.equal(typeof createRequestFence, "function");
  const fence = createRequestFence();
  const first = fence.begin();
  const second = fence.begin();
  assert.equal(fence.isCurrent(first), false);
  assert.equal(fence.isCurrent(second), true);
  fence.invalidate();
  assert.equal(fence.isCurrent(second), false);
});

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
    activeView: "students",
    users: [{ id: 1, username: "old" }],
    userMeta: { total: 41, totalPages: 3 },
    userError: "old error",
    userLoading: false,
    userFilters: { search: "", status: "", role: "" },
    userPage: 4,
    selectedClassroom: { id: 25, className: "Web Systems" },
    classroomLookup: {
      options: [{ id: 25, className: "Web Systems" }],
      search: "web",
      page: 4,
      total: 73,
      totalPages: 4,
      status: "success",
      error: "old lookup error",
      retry: 0,
    },
  };

  const userRequests = createLatestRequestController({
    onStart() {
      state.users = [];
      state.userMeta = { total: null, totalPages: null };
      state.userError = "";
      state.userLoading = true;
    },
    onSuccess(response) {
      state.users = response.users;
      state.userMeta = { total: response.total, totalPages: response.totalPages };
    },
    onError(message) { state.userError = message; },
    onFinish() { state.userLoading = false; },
  });
  const classroomRequests = createLatestRequestController({
    onStart() {
      state.classroomLookup = {
        ...state.classroomLookup,
        options: [],
        total: null,
        totalPages: null,
        status: "loading",
        error: "",
      };
    },
    onSuccess(response) {
      state.classroomLookup = {
        ...state.classroomLookup,
        options: response.classrooms,
        total: response.total,
        totalPages: response.totalPages,
        status: "success",
      };
    },
    onError(message) {
      state.classroomLookup = {
        ...state.classroomLookup,
        options: [],
        total: null,
        totalPages: null,
        status: "error",
        error: message,
      };
    },
  });
  const transitions = createAdminFilterTransitions({
    userRequests,
    classroomRequests,
    setActiveView: assign(state, "activeView"),
    setUserFilters: assign(state, "userFilters"),
    setUserPage: assign(state, "userPage"),
    setSelectedClassroom: assign(state, "selectedClassroom"),
    setClassroomLookup: assign(state, "classroomLookup"),
  });
  return { state, userRequests, classroomRequests, transitions };
};

test("student filter transition invalidates request A before request B begins", () => {
  assert.equal(typeof createLatestRequestController, "function");
  assert.equal(typeof createAdminFilterTransitions, "function");
  const { state, userRequests, transitions } = createHarness();
  const requestA = userRequests.begin();

  transitions.changeUserFilter("search", "ada");

  assert.deepEqual(state.users, []);
  assert.deepEqual(state.userMeta, { total: null, totalPages: null });
  assert.equal(state.userError, "");
  assert.equal(state.userLoading, true);
  assert.equal(state.userFilters.search, "ada");
  assert.equal(state.userPage, 1);
  assert.equal(userRequests.succeed(requestA, { users: [{ id: 9 }], total: 1, totalPages: 1 }), false);
  assert.equal(userRequests.fail(requestA, "late error"), false);
  assert.equal(userRequests.finish(requestA), false);
  assert.deepEqual(state.users, []);
  assert.deepEqual(state.userMeta, { total: null, totalPages: null });
  assert.equal(state.userError, "");
  assert.equal(state.userLoading, true);
});

test("current student response restores metadata and current failure leaves it unavailable", () => {
  const { state, userRequests, transitions } = createHarness();
  transitions.changeUserPage(2);
  assert.equal(state.userPage, 2);
  const successful = userRequests.begin();
  assert.equal(userRequests.succeed(successful, { users: [{ id: 2 }], total: 21, totalPages: 2 }), true);
  assert.equal(userRequests.finish(successful), true);
  assert.deepEqual(state.userMeta, { total: 21, totalPages: 2 });
  assert.equal(state.userLoading, false);

  transitions.changeUserFilter("status", "active");
  const failed = userRequests.begin();
  assert.equal(userRequests.fail(failed, "Unable to load students."), true);
  assert.equal(userRequests.finish(failed), true);
  assert.deepEqual(state.users, []);
  assert.deepEqual(state.userMeta, { total: null, totalPages: null });
  assert.equal(state.userError, "Unable to load students.");
  assert.equal(state.userLoading, false);
});

test("role and view changes synchronously invalidate the displayed user result", () => {
  const { state, userRequests, transitions } = createHarness();
  const roleRequest = userRequests.begin();
  transitions.changeUserFilter("role", "teacher");
  assert.deepEqual(state.users, []);
  assert.deepEqual(state.userMeta, { total: null, totalPages: null });
  assert.equal(userRequests.succeed(roleRequest, { users: [{ id: 2 }], total: 1, totalPages: 1 }), false);

  const viewRequest = userRequests.begin();
  transitions.changeView("teachers", state.activeView);
  assert.equal(state.activeView, "teachers");
  assert.equal(userRequests.fail(viewRequest, "late view error"), false);
  assert.equal(userRequests.finish(viewRequest), false);
  assert.equal(state.userError, "");
  assert.equal(state.userLoading, true);
});

test("view transition fences an older non-user request catch and finally", async () => {
  const { state, userRequests, transitions } = createHarness();
  state.activeView = "dashboard";
  const requestA = deferred();
  const completionA = userRequests.run(
    () => requestA.promise,
    { mapError: () => "stale dashboard failure" },
  );

  assert.equal(transitions.changeView("students", state.activeView), true);
  assert.equal(state.activeView, "students");
  assert.equal(state.userLoading, true);
  requestA.reject(new Error("dashboard failed"));
  assert.equal(await completionA, false);
  assert.equal(state.userError, "");
  assert.equal(state.userLoading, true);
  assert.deepEqual(state.userMeta, { total: null, totalPages: null });
});

test("reselecting the active view is a no-op while a real view change resets user pagination", () => {
  const { state, transitions } = createHarness();
  state.users = [{ id: 7 }];
  state.userMeta = { total: 41, totalPages: 3 };
  state.userLoading = false;

  assert.equal(transitions.changeView("students", state.activeView), false);
  assert.deepEqual(state.users, [{ id: 7 }]);
  assert.deepEqual(state.userMeta, { total: 41, totalPages: 3 });
  assert.equal(state.userLoading, false);

  assert.equal(transitions.changeView("teachers", state.activeView), true);
  assert.equal(state.activeView, "teachers");
  assert.equal(state.userPage, 1);
  assert.deepEqual(state.users, []);
  assert.deepEqual(state.userMeta, { total: null, totalPages: null });
});

test("classroom lookup transition invalidates request A and preserves applied selection", () => {
  const { state, classroomRequests, transitions } = createHarness();
  const selectedClassroom = state.selectedClassroom;
  const studentPage = state.userPage;
  const requestA = classroomRequests.begin();

  transitions.changeClassroomSearch("algo");

  assert.equal(state.classroomLookup.search, "algo");
  assert.equal(state.classroomLookup.page, 1);
  assert.deepEqual(state.classroomLookup.options, []);
  assert.equal(state.classroomLookup.total, null);
  assert.equal(state.classroomLookup.totalPages, null);
  assert.equal(state.classroomLookup.status, "loading");
  assert.equal(state.classroomLookup.error, "");
  assert.equal(state.selectedClassroom, selectedClassroom);
  assert.equal(state.userPage, studentPage);
  assert.equal(classroomRequests.succeed(requestA, { classrooms: [{ id: 31 }], total: 1, totalPages: 1 }), false);
  assert.equal(classroomRequests.fail(requestA, "late lookup error"), false);
  assert.deepEqual(state.classroomLookup.options, []);
  assert.equal(state.classroomLookup.error, "");
});

test("current classroom lookup success restores metadata and failure removes it", () => {
  const { state, classroomRequests, transitions } = createHarness();
  transitions.changeClassroomLookupPage(2);
  const successful = classroomRequests.begin();
  assert.equal(classroomRequests.succeed(successful, {
    classrooms: [{ id: 31, className: "Algorithms" }], total: 33, totalPages: 2,
  }), true);
  assert.equal(state.classroomLookup.total, 33);
  assert.equal(state.classroomLookup.totalPages, 2);
  assert.equal(state.classroomLookup.status, "success");

  transitions.retryClassroomLookup();
  const failed = classroomRequests.begin();
  assert.equal(classroomRequests.fail(failed, "Unable to load classrooms."), true);
  assert.equal(state.classroomLookup.total, null);
  assert.equal(state.classroomLookup.totalPages, null);
  assert.equal(state.classroomLookup.status, "error");
});

test("classroom selection resets only student pagination and keeps CSV scope aligned", () => {
  const { state, transitions } = createHarness();
  state.classroomLookup.page = 3;
  const nextClassroom = { id: 31, className: "Algorithms" };

  transitions.changeAppliedClassroom(nextClassroom);

  assert.equal(state.selectedClassroom, nextClassroom);
  assert.equal(state.userPage, 1);
  assert.equal(state.classroomLookup.page, 3);
  const snapshot = buildAdminUserFilterSnapshot({
    activeView: "students",
    userFilters: state.userFilters,
    selectedClassroom: state.selectedClassroom,
  });
  const listQuery = parseQuery(buildUserListPath(snapshot, state.userPage));
  const csvQuery = parseQuery(buildUserExportPath(snapshot));
  assert.equal(listQuery.classroomId, "31");
  assert.equal(csvQuery.classroomId, "31");
});
