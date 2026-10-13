import assert from "node:assert/strict";
import test from "node:test";
import { createVisibleMapLegend } from "./mapPresentation.js";

test("legend describes the availability states emitted by map entries", () => {
  const legend = createVisibleMapLegend([
    { status: "current" },
    { status: "completed" },
    { status: "assessment-required" },
    { status: "locked" },
    { status: "unassigned" },
    { status: "unavailable" },
  ]);

  assert.deepEqual(legend.map(({ status, label }) => ({ status, label })), [
    { status: "completed", label: "Completed" },
    { status: "current", label: "Available" },
    { status: "assessment-required", label: "Assessment required" },
    { status: "locked", label: "Locked" },
    { status: "unassigned", label: "Not assigned" },
    { status: "unavailable", label: "Availability unavailable" },
  ]);
});

test("legend includes recovery and deadline states without inventing a playing state", () => {
  const legend = createVisibleMapLegend([
    { status: "assessment-recovery" },
    { status: "assessment-invalid" },
    { status: "expired" },
    { status: "current" },
  ]);

  assert.deepEqual(legend.map((item) => item.label), [
    "Available",
    "Action required",
    "Deadline passed",
  ]);
  assert.equal(legend.some((item) => /playing|quest/i.test(item.label)), false);
});

test("legend omits states that are not present and de-duplicates shared presentation states", () => {
  const legend = createVisibleMapLegend([
    { status: "current" },
    { status: "current" },
    { status: "assessment-recovery" },
    { status: "assessment-invalid" },
  ]);

  assert.deepEqual(legend.map((item) => item.label), ["Available", "Action required"]);
});
