import assert from "node:assert/strict";
import test from "node:test";
import { revealDashboardNotifications } from "./dashboardInteractions.js";

test("reveals notifications before scrolling and focusing their visible destination", () => {
  const events = [];
  let scheduledFocus = null;
  const destination = {
    scrollIntoView: (options) => events.push(["scroll", options]),
    focus: (options) => events.push(["focus", options]),
  };

  revealDashboardNotifications({
    selectNotifications: () => events.push(["select"]),
    getDestination: () => destination,
    schedule: (callback) => {
      events.push(["schedule"]);
      scheduledFocus = callback;
    },
  });

  assert.deepEqual(events, [["select"], ["schedule"]]);
  assert.equal(typeof scheduledFocus, "function");

  scheduledFocus();
  assert.deepEqual(events, [
    ["select"],
    ["schedule"],
    ["scroll", { behavior: "smooth", block: "center" }],
    ["focus", { preventScroll: true }],
  ]);
});

test("notification reveal remains safe when its destination unmounts", () => {
  let scheduledFocus = null;

  assert.doesNotThrow(() => {
    revealDashboardNotifications({
      selectNotifications: () => {},
      getDestination: () => null,
      schedule: (callback) => {
        scheduledFocus = callback;
      },
    });
    scheduledFocus();
  });
});
