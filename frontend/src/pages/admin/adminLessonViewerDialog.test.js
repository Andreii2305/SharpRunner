import assert from "node:assert/strict";
import test from "node:test";
import * as lessonDialog from "./adminLessonViewerDialog.js";

const focusable = (name, { disabled = false } = {}) => ({
  name,
  disabled,
  focusCount: 0,
  focus() { this.focusCount += 1; },
  getAttribute() { return null; },
});

const dialogWith = (controls = []) => ({
  focusCount: 0,
  querySelectorAll() { return controls; },
  contains(target) { return target === this || controls.includes(target); },
  focus() { this.focusCount += 1; },
});

const keyEvent = ({ key = "Tab", target, shiftKey = false } = {}) => ({
  key,
  target,
  shiftKey,
  preventDefaultCount: 0,
  preventDefault() { this.preventDefaultCount += 1; },
});

test("admin lesson dialog focuses its loading close control once and does not reset focus after content changes", () => {
  assert.equal(typeof lessonDialog.createAdminLessonDialogBehavior, "function");
  const close = focusable("loading close");
  const contentControl = focusable("content control");
  const dialog = dialogWith([close]);
  const behavior = lessonDialog.createAdminLessonDialogBehavior({ onClose() {} });

  assert.equal(behavior.open(dialog, close), true);
  assert.equal(close.focusCount, 1);
  dialog.querySelectorAll = () => [close, contentControl];
  assert.equal(behavior.open(dialog, contentControl), false);
  assert.equal(close.focusCount, 1);
  assert.equal(contentControl.focusCount, 0);
});

test("admin lesson dialog traps forward and backward Tab navigation", () => {
  const first = focusable("close");
  const last = focusable("download");
  const dialog = dialogWith([first, last]);
  const behavior = lessonDialog.createAdminLessonDialogBehavior({ onClose() {} });
  const forward = keyEvent({ target: last });
  const backward = keyEvent({ target: first, shiftKey: true });

  assert.equal(behavior.handleKeyDown(forward, dialog), true);
  assert.equal(forward.preventDefaultCount, 1);
  assert.equal(first.focusCount, 1);
  assert.equal(behavior.handleKeyDown(backward, dialog), true);
  assert.equal(backward.preventDefaultCount, 1);
  assert.equal(last.focusCount, 1);
});

test("admin lesson dialog Escape, button, and direct backdrop dismissal share one close callback", () => {
  let closes = 0;
  const behavior = lessonDialog.createAdminLessonDialogBehavior({ onClose() { closes += 1; } });
  const dialog = dialogWith();
  const escape = keyEvent({ key: "Escape", target: dialog });
  const backdrop = {};

  assert.equal(behavior.handleKeyDown(escape, dialog), true);
  assert.equal(escape.preventDefaultCount, 1);
  assert.equal(behavior.requestClose(), true);
  assert.equal(behavior.handleBackdropClick({ target: backdrop, currentTarget: backdrop }), true);
  assert.equal(closes, 3);
});

test("admin lesson dialog ignores clicks originating inside the panel", () => {
  let closes = 0;
  const behavior = lessonDialog.createAdminLessonDialogBehavior({ onClose() { closes += 1; } });
  const backdrop = {};
  const inside = {};

  assert.equal(behavior.handleBackdropClick({ target: inside, currentTarget: backdrop }), false);
  assert.equal(closes, 0);
});

test("admin lesson dialog keeps focus on its fallback when no enabled controls exist", () => {
  const disabled = focusable("disabled", { disabled: true });
  const dialog = dialogWith([disabled]);
  const behavior = lessonDialog.createAdminLessonDialogBehavior({ onClose() {} });

  assert.equal(behavior.open(dialog, disabled), true);
  assert.equal(dialog.focusCount, 1);
  const tab = keyEvent({ target: dialog });
  assert.equal(behavior.handleKeyDown(tab, dialog), true);
  assert.equal(dialog.focusCount, 2);
});
