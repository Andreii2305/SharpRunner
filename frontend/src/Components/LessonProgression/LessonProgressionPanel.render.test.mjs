import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const { default: LessonProgressionPanel } = await vite.ssrLoadModule(
  "/src/Components/LessonProgression/LessonProgressionPanel.jsx",
);
test.after(async () => vite.close());

test("renders named steps, text states, and an exact-classroom semantic action", () => {
  const html = renderToStaticMarkup(React.createElement(LessonProgressionPanel, {
    title: "Arrays journey",
    model: {
      steps: [
        { key: "pre", label: "Pre-Test", state: "completed" },
        { key: "module", label: "Module / Lesson", state: "current" },
        { key: "game", label: "Game Levels", state: "locked" },
      ],
      action: { label: "Continue to Module", href: "/lesson/built-in/arrays?classroomId=7", disabled: false },
    },
  }));
  assert.match(html, /<section[^>]+aria-labelledby=/);
  assert.match(html, /Pre-Test/);
  assert.match(html, /Completed/);
  assert.match(html, /Current/);
  assert.match(html, /Locked/);
  assert.match(html, /<a[^>]+href="\/lesson\/built-in\/arrays\?classroomId=7"[^>]*>Continue to Module<\/a>/);
});

test("renders exhausted POST as status text without a bypass link", () => {
  const html = renderToStaticMarkup(React.createElement(LessonProgressionPanel, {
    model: {
      steps: [{ key: "post", label: "Post-Test", state: "blocked" }],
      action: { label: "Post-Test attempts exhausted", href: null, disabled: true },
    },
  }));
  assert.match(html, /Post-Test attempts exhausted/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /<a/);
});
