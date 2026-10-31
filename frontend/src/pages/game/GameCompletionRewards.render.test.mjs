import assert from "node:assert/strict";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  cacheDir: "node_modules/.vite-test-game-completion-rewards",
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
const { GameCompletionRewards } = await vite.ssrLoadModule("/src/pages/game/GameCompletionRewards.jsx");
after(async () => vite.close());

const render = (props) => renderToStaticMarkup(React.createElement(GameCompletionRewards, props));

test("renders authoritative signed deductions without a plus-minus sequence", () => {
  const html = render({
    xpAward: {
      amount: 15,
      originalAmount: 15,
      breakdown: [
        { key: "gross", label: "Gross completion XP", amount: 25 },
        { key: "deduction", label: "Interruption deduction", amount: -10 },
      ],
    },
    totalXp: 115,
    completionDeductions: {
      eventCount: 2,
      score: { base: 90, deducted: 2, final: 88 },
      xp: { gross: 25, deducted: 10, net: 15 },
    },
  });
  assert.match(html, /Original completion award: 15 XP/);
  assert.match(html, /XP · 115 total XP/);
  assert.doesNotMatch(html, /Â/);
  assert.match(html, /XP newly granted by this save: 15/);
  assert.match(html, /\+25 Gross completion XP/);
  assert.match(html, /-10 Interruption deduction/);
  assert.doesNotMatch(html, /\+-10/);
  assert.match(html, /Recorded interruptions/);
  assert.match(html, /90 - 2 = 88/);
});

test("distinguishes a retry from its original zero reward and supports legacy deductions", () => {
  const retry = render({
    xpAward: { amount: 0, originalAmount: 0, breakdown: [] },
    totalXp: 50,
    completionDeductions: {
      eventCount: 3,
      score: { base: 78, deducted: 3, final: 75 },
      xp: { gross: 25, deducted: 25, net: 0 },
    },
  });
  assert.match(retry, /Original completion award: 0 XP/);
  assert.match(retry, /XP newly granted by this save: 0/);
  assert.match(retry, /25 - 25 = 0/);

  const legacy = render({ xpAward: { amount: 20, breakdown: [] }, totalXp: 70, completionDeductions: null });
  assert.match(legacy, /Original completion award: 20 XP/);
  assert.doesNotMatch(legacy, /Recorded interruptions/);
});
