import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const { GameTutorialCard } = await vite.ssrLoadModule("/src/pages/game/tutorial/GameTutorial.jsx");

test.after(async () => { await vite.close(); });

test("the first step exposes dialog title, progress, Skip, Next, and disabled Back", () => {
  const html = renderToStaticMarkup(React.createElement(GameTutorialCard, {
    step: { id: "world", title: "Game World", description: "Observe the scene." },
    stepIndex: 0,
    stepCount: 3,
    position: { left: 16, top: 16 },
    onBack() {}, onNext() {}, onSkip() {}, onFinish() {},
  }));
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /Game World/);
  assert.match(html, /Observe the scene\./);
  assert.match(html, /1 of 3/);
  assert.match(html, /Skip Tutorial/);
  assert.match(html, /Next/);
  assert.match(html, /<button[^>]*disabled[^>]*>Back<\/button>/);
  assert.doesNotMatch(html, />Finish</);
});

test("the final step offers Finish instead of Next", () => {
  const html = renderToStaticMarkup(React.createElement(GameTutorialCard, {
    step: { id: "run", title: "Run Code", description: "Try your code." },
    stepIndex: 2,
    stepCount: 3,
    position: { left: 16, top: 16 },
    onBack() {}, onNext() {}, onSkip() {}, onFinish() {},
  }));
  assert.match(html, /3 of 3/);
  assert.match(html, />Finish</);
  assert.doesNotMatch(html, />Next</);
});
