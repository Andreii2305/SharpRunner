import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  cacheDir: "node_modules/.vite-test-game-fullscreen-gate",
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
const { GameFullscreenGate } = await vite.ssrLoadModule(
  "/src/pages/game/GameFullscreenGate.jsx",
);

test.after(async () => { await vite.close(); });

const renderGate = (overrides = {}) => renderToStaticMarkup(React.createElement(
  GameFullscreenGate,
  {
    state: {
      status: "gated",
      gameplayPermitted: false,
      interruptionCount: 0,
      interruptionReason: null,
      error: null,
    },
    onContinue() {},
    onLeave() {},
    ...overrides,
  },
));

test("production gate presents the required warning, counter, and explicit actions", () => {
  const html = renderGate();

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /Please enter fullscreen to continue playing\./);
  assert.match(html, /Tab changes/);
  assert.match(html, /0/);
  assert.match(html, /Fullscreen exits and leaving the game tab are included\./);
  assert.match(html, />Continue</);
  assert.match(html, />Leave level</);
});

test("failure feedback remains neutral while Continue stays available", () => {
  const html = renderGate({
    state: {
      status: "error",
      gameplayPermitted: false,
      interruptionCount: 2,
      interruptionReason: "fullscreen-exit",
      error: "Fullscreen could not be started. Gameplay remains paused.",
    },
  });

  assert.match(html, /Fullscreen could not be started\. Gameplay remains paused\./);
  assert.match(html, /Tab changes/);
  assert.match(html, /2/);
  assert.match(html, />Try fullscreen again</);
});

test("incomplete levels gate fullscreen on the authoritative reporting session and show zero rates", () => {
  const loading = renderGate({
    reportingRequired: true,
    reportingState: {
      sessionStatus: "starting", session: null, sessionError: null,
      pendingCount: 0, deliveryStatus: "idle", deliveryError: null,
    },
  });
  assert.match(loading, /Preparing the interruption reporting session/);
  assert.match(loading, /disabled=""/);

  const ready = renderGate({
    reportingRequired: true,
    reportingState: {
      sessionStatus: "current",
      session: { scoreDeductionSnapshot: 0, xpDeductionSnapshot: 0 },
      sessionError: null,
      pendingCount: 2,
      deliveryStatus: "uncertain",
      deliveryError: { message: "The request result is uncertain." },
    },
  });
  assert.match(ready, /Saved rates for this session: 0 score point\(s\)/);
  assert.match(ready, /0 XP per recorded interruption/);
  assert.match(ready, /Pending interruption reports: 2/);
  assert.match(ready, /Retry pending reports/);
});

test("GamePage wires the gate to every gameplay pause foundation", async () => {
  const source = await readFile(new URL("./GamePage.jsx", import.meta.url), "utf8");

  assert.match(source, /createGameFullscreenInterruptionController/);
  assert.match(source, /createGameInterruptionReportingController/);
  assert.match(source, /createGameInterruptionLifecycleController/);
  assert.match(source, /interruptionLifecycleRef\.current\.setup/);
  assert.match(source, /interruptionLifecycleRef\.current\.cleanup\(owned\)/);
  assert.match(source, /reportingControllerRef\.current === owned\.reportingController/);
  assert.match(source, /completionFlowRef\.current === owned\.completionFlow/);
  assert.match(source, /onInterruption: \(interruption\)/);
  assert.match(source, /completionFlowRef\.current\.begin/);
  assert.match(source, /reportingRequired/);
  assert.match(source, /beginCompletionBoundary/);
  assert.match(source, /resetCompletionBoundary/);
  assert.match(source, /interruptionEvents/);
  assert.match(source, /reportingControllerRef\.current\?\.retrySession/);
  assert.match(source, /reportingControllerRef\.current\?\.retryEvents/);
  assert.match(source, /reportingState\.deliveryError[\s\S]*Retry pending reports/);
  assert.match(source, /<GameFullscreenGate/);
  assert.match(source, /paused=\{!fullscreenState\.gameplayPermitted\}/);
  assert.match(source, /const owner = fullscreenBgmOwnerRef\.current;/);
  assert.match(source, /bgmManager\.pauseTemporarily\(owner\)/);
  assert.match(source, /dialogueSfxManager\.stop\(\)/);
  assert.match(source, /if \(!gameplayPermittedRef\.current\) return;/);
  assert.match(source, /pendingEvaluationOutcomeRef/);
  assert.match(source, /sessionPermissionSyncRef\.current\?\.\(fullscreenState\.gameplayPermitted\)/);
  assert.match(source, /reportGameActivity\(fullscreenState\.gameplayPermitted\)/);
  assert.match(source, /readOnly: isCodeLocked \|\| tutorialRequested \|\| !fullscreenState\.gameplayPermitted/);
  assert.match(source, /portalTarget=\{gamePageRef\.current\}/);
  assert.match(source, /subscribeToAuthChanges/);
  assert.match(source, /!deadlineExpired\s+&& !accessRevoked\s+&& !gradeModal/);
  assert.match(source, /controller\.dispose\(\)/);
  assert.match(source, /disabled: true,\s+onDismiss: \(\) => \{\}/);
});

test("game dialogs opt into the fullscreen boundary without changing shared defaults", async () => {
  const [confirmModal, tutorial] = await Promise.all([
    readFile(new URL("../../Components/ConfirmModal/ConfirmModal.jsx", import.meta.url), "utf8"),
    readFile(new URL("./tutorial/GameTutorial.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(confirmModal, /portalTarget \?\? document\.body/);
  assert.match(confirmModal, /restoreFocusOnClose = true/);
  assert.match(tutorial, /portalTarget \?\? document\.body/);
  assert.match(tutorial, /disableRootInert = false/);
  assert.match(tutorial, /restoreFocusOnClose = true/);
});
