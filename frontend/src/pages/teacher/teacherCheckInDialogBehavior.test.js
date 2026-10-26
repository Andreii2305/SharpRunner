import assert from "node:assert/strict";
import test from "node:test";
import { closeTeacherCheckInDialog, createTeacherCheckInDialogBehavior } from "./teacherCheckInDialogBehavior.js";

const control = () => ({ disabled: false, focused: 0, getAttribute: () => null, focus() { this.focused += 1; } });
const dialog = (controls) => ({
  focused: 0,
  focus() { this.focused += 1; },
  querySelectorAll: () => controls,
  contains: (target) => target === dialog || controls.includes(target),
});

test("production dialog behavior focuses, traps Tab, and shares Escape/backdrop close", () => {
  const first = control(); const last = control();
  const panel = dialog([first, last]);
  let closes = 0;
  const behavior = createTeacherCheckInDialogBehavior({ onClose: () => { closes += 1; } });
  assert.equal(behavior.open(panel, first), true);
  assert.equal(first.focused, 1);
  const tab = { key: "Tab", target: last, preventDefault() { this.prevented = true; } };
  behavior.handleKeyDown(tab, panel);
  assert.equal(tab.prevented, true);
  assert.equal(first.focused, 2);
  behavior.handleKeyDown({ key: "Escape", preventDefault() {} }, panel);
  assert.equal(closes, 1);
  behavior.reset();
  assert.equal(behavior.open(panel, first), true);
  assert.equal(first.focused, 3);
  assert.equal(behavior.handleBackdropClick({ target: {}, currentTarget: {} }), false);
  const backdrop = {};
  assert.equal(behavior.handleBackdropClick({ target: backdrop, currentTarget: backdrop }), true);
  assert.equal(closes, 2);
});

test("ordinary close restores only a connected origin while navigation cancellation does not", () => {
  const origin = control();
  origin.isConnected = true;
  let closed = 0;
  const controller = { close() { closed += 1; } };
  assert.equal(closeTeacherCheckInDialog({ controller, origin }), true);
  assert.equal(closed, 1);
  assert.equal(origin.focused, 1);
  assert.equal(closeTeacherCheckInDialog({ controller, origin, restore: false }), true);
  assert.equal(closed, 2);
  assert.equal(origin.focused, 1);
  origin.isConnected = false;
  assert.equal(closeTeacherCheckInDialog({ controller, origin }), false);
});
