import assert from "node:assert/strict";
import test from "node:test";
import { createAssessmentInterruptionDialogBehavior } from "./assessmentInterruptionDialog.js";

const focusable = () => ({
  disabled: false,
  isConnected: true,
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
  prevented: false,
  preventDefault() { this.prevented = true; },
});

test("interruption dialog focuses Continue once and contains keyboard focus", () => {
  const continueButton = focusable();
  const dialog = dialogWith([continueButton]);
  const behavior = createAssessmentInterruptionDialogBehavior({ onContinue() {} });

  assert.equal(behavior.open(dialog, continueButton), true);
  assert.equal(behavior.open(dialog, continueButton), false);
  assert.equal(continueButton.focusCount, 1);

  const tab = keyEvent({ target: continueButton });
  assert.equal(behavior.handleKeyDown(tab, dialog), true);
  assert.equal(tab.prevented, true);
  assert.equal(continueButton.focusCount, 2);
});

test("Escape and the button share the Continue path and restore connected focus safely", () => {
  let continues = 0;
  const origin = focusable();
  const dialog = dialogWith();
  const behavior = createAssessmentInterruptionDialogBehavior({
    onContinue() { continues += 1; },
    restoreTarget: origin,
  });

  const escape = keyEvent({ key: "Escape", target: dialog });
  assert.equal(behavior.handleKeyDown(escape, dialog), true);
  assert.equal(escape.prevented, true);
  assert.equal(continues, 1);
  assert.equal(origin.focusCount, 1);

  origin.isConnected = false;
  assert.equal(behavior.requestContinue(), true);
  assert.equal(continues, 2);
  assert.equal(origin.focusCount, 1);
});
