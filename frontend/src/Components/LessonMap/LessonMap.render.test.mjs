import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
test.after(async () => vite.close());

const { default: LessonMap } = await vite.ssrLoadModule(
  "/src/Components/LessonMap/LessonMap.jsx",
);

const baseProps = {
  lessonTitle: "Tutorial",
  subtitle: "First Compile Trial",
  description: "Choose an assigned activity.",
  progressPercent: 40,
  progressSummary: "2 of 5 game activities completed",
  stages: [{ id: "start", title: "Start" }],
  connections: [],
  lessonDetails: [],
  onNodeClick() {},
  onExit() {},
  showContinue: false,
};

test("mobile Tutorial exposes enabled actions and preserves supported recovery actions", () => {
  const html = renderToStaticMarkup(React.createElement(LessonMap, {
    ...baseProps,
    nodes: [
      { id: "tutorial-level-1", levelNumber: 1, title: "Movement", x: 20, y: 20, status: "current", route: "/tutorial/level/1?classroomId=7", actionLabel: "Play level", disabled: false },
      { id: "tutorial-level-2", levelNumber: 2, title: "Recovery", x: 40, y: 40, status: "assessment-recovery", route: "/classrooms/7/recovery", actionLabel: "Resume assessment", disabled: false },
    ],
  }));

  assert.match(html, /aria-label="Tutorial activities"/);
  assert.match(html, /Play level/);
  assert.match(html, /Resume assessment/);
  assert.doesNotMatch(html, /Resume assessment<\/button>[^]*disabled/);
});

test("mobile Tutorial keeps nodes without enabled actions noninteractive", () => {
  const html = renderToStaticMarkup(React.createElement(LessonMap, {
    ...baseProps,
    nodes: [
      { id: "tutorial-level-1", levelNumber: 1, title: "Locked trial", x: 20, y: 20, status: "locked", route: null, actionLabel: "Level locked", disabled: true },
      { id: "tutorial-level-2", levelNumber: 2, title: "Unassigned trial", x: 40, y: 40, status: "unassigned", route: null, actionLabel: "Not assigned", disabled: true },
    ],
  }));

  assert.match(html, /Level locked/);
  assert.match(html, /Not assigned/);
  assert.equal((html.match(/disabled=""/g) ?? []).length >= 2, true);
});
