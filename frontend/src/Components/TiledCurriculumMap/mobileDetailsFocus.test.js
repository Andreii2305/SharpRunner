import assert from "node:assert/strict";
import test from "node:test";
import { createMobileDetailsFocusController } from "./mobileDetailsFocus.js";

const focusable = () => ({
  focusCount: 0,
  isConnected: true,
  focus() { this.focusCount += 1; },
});

test("explicit opening focuses new details once without resetting on rerenders", () => {
  const controller = createMobileDetailsFocusController();
  const opener = focusable();
  const heading = focusable();

  controller.open("arrays-level-1", opener);
  assert.equal(controller.focusOpenedDetails("arrays-level-1", heading), true);
  assert.equal(controller.focusOpenedDetails("arrays-level-1", heading), false);
  assert.equal(heading.focusCount, 1);
});

test("closing restores a connected opener and Escape requests the same close path", () => {
  const controller = createMobileDetailsFocusController();
  const opener = focusable();
  const event = { key: "Escape", prevented: false, preventDefault() { this.prevented = true; } };

  controller.open("arrays-level-1", opener);
  assert.equal(controller.shouldCloseFromKey(event), true);
  assert.equal(event.prevented, true);
  controller.close();
  assert.equal(opener.focusCount, 1);
});

test("closing does not focus a disconnected opener", () => {
  const controller = createMobileDetailsFocusController();
  const opener = focusable();
  opener.isConnected = false;

  controller.open("arrays-level-1", opener);
  controller.close();
  assert.equal(opener.focusCount, 0);
});

test("region changes clear pending focus without restoring a stale map node", () => {
  const controller = createMobileDetailsFocusController();
  const opener = focusable();
  const staleHeading = focusable();

  controller.open("arrays-level-1", opener);
  controller.clearForRegionChange();

  assert.equal(controller.focusOpenedDetails("arrays-level-1", staleHeading), false);
  assert.equal(staleHeading.focusCount, 0);
  assert.equal(opener.focusCount, 0);
});
