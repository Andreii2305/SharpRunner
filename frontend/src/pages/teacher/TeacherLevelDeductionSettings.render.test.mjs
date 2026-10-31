import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  cacheDir: "node_modules/.vite-test-teacher-level-settings",
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
test.after(async () => vite.close());

test("production deduction controls render stored values, accessible descriptions, and policy limits", async () => {
  const { default: LevelInterruptionDeductionFields } = await vite.ssrLoadModule("/src/pages/teacher/LevelInterruptionDeductionFields.jsx");
  const html = renderToStaticMarkup(React.createElement(LevelInterruptionDeductionFields, {
    levelKey: "tutorial-1",
    scoreValue: 0,
    xpValue: 0,
    errors: {},
    onChange() {},
  }));

  assert.match(html, /for="tutorial-1-interruption-score-deduction"/);
  assert.match(html, /id="tutorial-1-interruption-score-deduction"[^>]*value="0"/);
  assert.match(html, /step="0.01"/);
  assert.match(html, /for="tutorial-1-interruption-xp-deduction"/);
  assert.match(html, /id="tutorial-1-interruption-xp-deduction"[^>]*step="1"[^>]*value="0"/);
  assert.match(html, /fullscreen exits and leaving the visible game page/i);
  assert.match(html, /minimum score of 75/i);
  assert.match(html, /completion reward, down to zero/i);
  assert.match(html, /new game sessions/i);
  assert.doesNotMatch(html, /cheat/i);
});

test("production deduction controls expose field-specific validation errors", async () => {
  const { default: LevelInterruptionDeductionFields } = await vite.ssrLoadModule("/src/pages/teacher/LevelInterruptionDeductionFields.jsx");
  const html = renderToStaticMarkup(React.createElement(LevelInterruptionDeductionFields, {
    levelKey: "tutorial-1",
    scoreValue: "1.234",
    xpValue: "2.5",
    errors: {
      interruptionScoreDeduction: "Enter a number from 0 to 100 with up to two decimal places.",
      interruptionXpDeduction: "Enter a whole number from 0 to 100.",
    },
    onChange() {},
  }));

  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /up to two decimal places/);
  assert.match(html, /whole number from 0 to 100/);
});

test("production settings controls disable editing during a classroom mutation", async () => {
  const { default: LevelInterruptionDeductionFields } = await vite.ssrLoadModule("/src/pages/teacher/LevelInterruptionDeductionFields.jsx");
  const html = renderToStaticMarkup(React.createElement(LevelInterruptionDeductionFields, {
    levelKey: "tutorial-1",
    scoreValue: 1,
    xpValue: 10,
    errors: {},
    disabled: true,
    onChange() {},
  }));

  assert.match(html, /id="tutorial-1-interruption-score-deduction"[^>]*disabled=""/);
  assert.match(html, /id="tutorial-1-interruption-xp-deduction"[^>]*disabled=""/);
});

test("production action bar disables both mutations and announces the owned operation", async () => {
  const { default: LevelSettingsActionBar } = await vite.ssrLoadModule("/src/pages/teacher/LevelSettingsActionBar.jsx");
  const savingHtml = renderToStaticMarkup(React.createElement(LevelSettingsActionBar, {
    mutationKind: "save",
    status: null,
    onSave() {},
    onReset() {},
  }));
  const resettingHtml = renderToStaticMarkup(React.createElement(LevelSettingsActionBar, {
    mutationKind: "reset",
    status: null,
    onSave() {},
    onReset() {},
  }));

  assert.match(savingHtml, /aria-busy="true"/);
  assert.equal((savingHtml.match(/disabled=""/g) ?? []).length, 2);
  assert.match(savingHtml, /role="status"[^>]*aria-live="polite"[^>]*>Saving classroom settings…/);
  assert.equal((resettingHtml.match(/disabled=""/g) ?? []).length, 2);
  assert.match(resettingHtml, /role="status"[^>]*aria-live="polite"[^>]*>Resetting classroom settings…/);
});
