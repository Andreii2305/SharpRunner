import assert from "node:assert/strict";
import test from "node:test";
import { createLevelAccessErrorState } from "./levelRouteAccess.js";

test("failed access checks retain an explicit requested classroom", () => {
  assert.deepEqual(createLevelAccessErrorState("arrays-1", "42"), {
    levelKey: "arrays-1",
    status: "error",
    classroomId: "42",
    entry: null,
  });
});

test("failed access checks do not invent classroom identity", () => {
  assert.equal(createLevelAccessErrorState("arrays-1", null).classroomId, null);
});
