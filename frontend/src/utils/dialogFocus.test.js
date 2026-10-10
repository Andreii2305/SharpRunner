import assert from "node:assert/strict";
import test from "node:test";
import {
  focusDialog,
  handleDialogKeyDown,
  requestDialogDismiss,
  restoreDialogFocus,
} from "./dialogFocus.js";

const focusable = (name, { disabled = false, connected = true } = {}) => ({
  name,
  disabled,
  isConnected: connected,
  focus() { this.focused = true; },
  getAttribute() { return null; },
});

const dialogWith = (controls = []) => ({
  querySelectorAll() { return controls; },
  contains(target) { return controls.includes(target) || target === this; },
  focus() { this.focused = true; },
});

const keyEvent = ({ key = "Tab", target, shiftKey = false } = {}) => ({
  key,
  target,
  shiftKey,
  preventDefault() { this.prevented = true; },
});

test("Tab wraps from the last dialog control to the first", () => {
  const first = focusable("cancel");
  const last = focusable("confirm");
  const dialog = dialogWith([first, last]);
  const event = keyEvent({ target: last });

  handleDialogKeyDown({ event, dialog, disabled: false, onDismiss() {} });

  assert.equal(event.prevented, true);
  assert.equal(first.focused, true);
});

test("Shift+Tab wraps from the first dialog control to the last", () => {
  const first = focusable("cancel");
  const last = focusable("confirm");
  const dialog = dialogWith([first, last]);
  const event = keyEvent({ target: first, shiftKey: true });

  handleDialogKeyDown({ event, dialog, disabled: false, onDismiss() {} });

  assert.equal(event.prevented, true);
  assert.equal(last.focused, true);
});

test("Tab navigation re-enters enabled controls from the dialog container", () => {
  const first = focusable("cancel");
  const last = focusable("confirm");
  const dialog = dialogWith([first, last]);
  const reverse = keyEvent({ target: dialog, shiftKey: true });

  handleDialogKeyDown({ event: reverse, dialog, disabled: false, onDismiss() {} });

  assert.equal(reverse.prevented, true);
  assert.equal(last.focused, true);
});

test("a dialog with no enabled controls keeps Tab focus on the dialog", () => {
  const dialog = dialogWith([focusable("cancel", { disabled: true })]);
  const event = keyEvent({ target: dialog });

  handleDialogKeyDown({ event, dialog, disabled: true, onDismiss() {} });

  assert.equal(event.prevented, true);
  assert.equal(dialog.focused, true);
});

test("Escape dismisses an enabled dialog", () => {
  let dismissals = 0;
  const event = keyEvent({ key: "Escape" });

  handleDialogKeyDown({
    event,
    dialog: dialogWith(),
    disabled: false,
    onDismiss() { dismissals += 1; },
  });

  assert.equal(event.prevented, true);
  assert.equal(dismissals, 1);
});

test("pending dialogs reject Escape and direct dismissal requests", () => {
  let dismissals = 0;
  const event = keyEvent({ key: "Escape" });
  const onDismiss = () => { dismissals += 1; };

  handleDialogKeyDown({ event, dialog: dialogWith(), disabled: true, onDismiss });
  const dismissed = requestDialogDismiss({ disabled: true, onDismiss });

  assert.equal(event.prevented, true);
  assert.equal(dismissed, false);
  assert.equal(dismissals, 0);
});

test("initial focus falls back from a disabled preferred control to the dialog", () => {
  const disabledCancel = focusable("cancel", { disabled: true });
  const dialog = dialogWith([disabledCancel]);

  focusDialog(dialog, disabledCancel);

  assert.equal(disabledCancel.focused, undefined);
  assert.equal(dialog.focused, true);
});

test("focus restoration only targets an opener that is still connected", () => {
  const connected = focusable("open modal");
  const removed = focusable("removed opener", { connected: false });

  assert.equal(restoreDialogFocus(connected), true);
  assert.equal(connected.focused, true);
  assert.equal(restoreDialogFocus(removed), false);
  assert.equal(removed.focused, undefined);
});
