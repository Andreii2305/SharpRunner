import assert from "node:assert/strict";
import test from "node:test";
import {
  createClassroomIdentityTracker,
  createExactClassroomRequestFence,
  createSingleFlightGuard,
  getRemoteCollectionView,
  getFiniteMetric,
  getRequiredCollection,
  removeStudentFromRoster,
  isExactClassroomPayload,
  isSameClassroomIdentity,
  mergeClassroomPerformance,
} from "./teacherClassroomState.js";

test("classroom operation scopes reject an old A completion after switching A to B to A", () => {
  const tracker = createClassroomIdentityTracker("A");
  const oldA = tracker.capture();
  tracker.enter("B");
  const currentA = tracker.enter("A");

  assert.equal(tracker.isCurrent(oldA), false);
  assert.equal(tracker.isCurrent(currentA), true);
});

test("missing collection fields stay unavailable while a confirmed empty array remains empty", () => {
  assert.equal(getRequiredCollection({}, "classrooms"), null);
  assert.equal(getRequiredCollection({ classrooms: null }, "classrooms"), null);
  assert.equal(getRequiredCollection({ classrooms: {} }, "classrooms"), null);
  assert.deepEqual(getRequiredCollection({ classrooms: [] }, "classrooms"), []);
});

test("missing metrics stay unavailable while a genuine zero remains measurable", () => {
  assert.equal(getFiniteMetric(null), null);
  assert.equal(getFiniteMetric(undefined), null);
  assert.equal(getFiniteMetric("0"), null);
  assert.equal(getFiniteMetric(0), 0);
});

test("classrooms remain available when optional metrics are unavailable", () => {
  const rows = mergeClassroomPerformance([
    { id: 11, className: "Section A", isActive: true, studentCount: 4 },
    { id: 12, className: "Archived", isActive: false, studentCount: 2 },
  ], null);

  assert.deepEqual(rows.map((row) => ({ id: row.classId, progress: row.averageProgressPercent })), [
    { id: 11, progress: null },
    { id: 12, progress: null },
  ]);
});

test("missing or malformed progress is unavailable while a measured zero remains zero", () => {
  const rows = mergeClassroomPerformance([
    { id: 11, className: "Measured zero" },
    { id: 12, className: "Missing" },
    { id: 13, className: "Malformed" },
  ], [
    { classId: 11, averageProgressPercent: 0 },
    { classId: 13, averageProgressPercent: "unknown" },
  ]);

  assert.equal(rows[0].averageProgressPercent, 0);
  assert.equal(rows[1].averageProgressPercent, null);
  assert.equal(rows[2].averageProgressPercent, null);
});

test("failed classroom loading is distinct from a confirmed empty list", () => {
  assert.deepEqual(getRemoteCollectionView({ status: "error", data: null, error: "Unavailable" }), {
    showLoading: false,
    showError: true,
    showEmpty: false,
    showData: false,
  });
  assert.deepEqual(getRemoteCollectionView({ status: "success", data: [], error: "" }), {
    showLoading: false,
    showError: false,
    showEmpty: true,
    showData: false,
  });
});

test("a failed refresh can retain successful section data while exposing the error", () => {
  assert.deepEqual(getRemoteCollectionView({ status: "error", data: [{ id: 1 }], error: "Refresh failed" }), {
    showLoading: false,
    showError: true,
    showEmpty: false,
    showData: true,
  });
});

test("request fences reject responses from an old classroom and superseded retries", () => {
  const fence = createExactClassroomRequestFence();
  fence.reset("10");
  const first = fence.begin("10");
  const retry = fence.begin("10");
  assert.equal(fence.isCurrent(first), false);
  assert.equal(fence.isCurrent(retry), true);

  fence.reset("20");
  assert.equal(fence.isCurrent(retry), false);
  const current = fence.begin("20");
  assert.equal(fence.isCurrent(current), true);
});

test("successful removal invalidates an older roster response for the same classroom", () => {
  const fence = createExactClassroomRequestFence();
  fence.reset("10");
  const rosterBeforeRemoval = fence.begin("10");
  fence.reset("10");

  assert.equal(fence.isCurrent(rosterBeforeRemoval), false);
});

test("successful removal updates the roster once and preserves other students", () => {
  const roster = [
    { userId: 1, studentName: "Ada" },
    { userId: 2, studentName: "Grace" },
  ];

  assert.deepEqual(removeStudentFromRoster(roster, 1), [
    { userId: 2, studentName: "Grace" },
  ]);
  assert.equal(removeStudentFromRoster(roster, 99), roster);
});

test("classroom payload identity must match the exact requested classroom", () => {
  assert.equal(isExactClassroomPayload({ classroom: { id: 7 } }, "7"), true);
  assert.equal(isExactClassroomPayload({ classroom: { id: 8 } }, "7"), false);
  assert.equal(isExactClassroomPayload({}, "7"), false);
});

test("mutation completions are accepted only for the exact active classroom", () => {
  assert.equal(isSameClassroomIdentity(7, "7"), true);
  assert.equal(isSameClassroomIdentity("8", "7"), false);
  assert.equal(isSameClassroomIdentity(null, "7"), false);
});

test("student removal is synchronous single-flight and can retry after failure", () => {
  const guard = createSingleFlightGuard();
  const first = guard.begin("7", 41);
  assert.ok(first);
  assert.equal(guard.begin("7", 41), null);
  assert.equal(guard.finish(first), true);

  const retry = guard.begin("7", 41);
  assert.ok(retry);
  guard.reset("8");
  const nextClass = guard.begin("8", 52);
  assert.ok(nextClass);
  assert.equal(guard.finish(retry), false);
  assert.equal(guard.isCurrent(nextClass), true);
});
