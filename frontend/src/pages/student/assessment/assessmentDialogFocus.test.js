import assert from "node:assert/strict";
import test from "node:test";
import { containDialogTabFocus } from "./assessmentDialogFocus.js";

const focusable = (name) => ({
  name,
  disabled: false,
  focus() { this.focused = true; },
  getAttribute() { return null; },
});

const eventFor = ({ target, shiftKey = false, key = "Tab" }) => ({
  key,
  shiftKey,
  target,
  preventDefault() { this.prevented = true; },
});

test("confirmation dialog contains forward and reverse Tab focus", () => {
  const first = focusable("cancel");
  const last = focusable("submit");
  const panel = { querySelectorAll: () => [first, last] };

  const forward = eventFor({ target: last });
  assert.equal(containDialogTabFocus(forward, panel), true);
  assert.equal(forward.prevented, true);
  assert.equal(first.focused, true);

  const reverse = eventFor({ target: first, shiftKey: true });
  assert.equal(containDialogTabFocus(reverse, panel), true);
  assert.equal(reverse.prevented, true);
  assert.equal(last.focused, true);
});

test("dialog focus helper ignores non-boundary keys", () => {
  const first = focusable("cancel");
  const last = focusable("submit");
  const panel = { querySelectorAll: () => [first, last] };

  assert.equal(containDialogTabFocus(eventFor({ target: first, key: "Escape" }), panel), false);
  assert.equal(containDialogTabFocus(eventFor({ target: first }), panel), false);
  assert.equal(containDialogTabFocus(eventFor({ target: last, shiftKey: true }), panel), false);
});

test("confirmation dialog keeps Tab on a focusable panel when every action is disabled", () => {
  const panel = {
    focused: false,
    querySelectorAll: () => [],
    focus() { this.focused = true; },
  };
  const forward = eventFor({ target: panel });
  const reverse = eventFor({ target: panel, shiftKey: true });

  assert.equal(containDialogTabFocus(forward, panel), true);
  assert.equal(forward.prevented, true);
  assert.equal(panel.focused, true);

  panel.focused = false;
  assert.equal(containDialogTabFocus(reverse, panel), true);
  assert.equal(reverse.prevented, true);
  assert.equal(panel.focused, true);
});
