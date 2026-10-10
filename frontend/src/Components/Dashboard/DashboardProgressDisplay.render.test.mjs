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

const {
  DashboardGameProgressPanel,
  DashboardGameProgressStat,
} = await vite.ssrLoadModule(
  "/src/Components/Dashboard/DashboardProgressDisplay.jsx",
);

const render = (Component, progressData) => renderToStaticMarkup(
  React.createElement(Component, { progressData }),
);

test("renders both overall displays from the 28 of 29 backend summary", () => {
  const progressData = {
    summary: {
      overallProgress: 97,
      totalLevelsCleared: 28,
      totalLevels: 29,
    },
    lessons: [],
  };

  const stat = render(DashboardGameProgressStat, progressData);
  const panel = render(DashboardGameProgressPanel, progressData);
  assert.match(stat, />Game progress</);
  assert.match(stat, />97%</);
  assert.match(stat, />28 of 29 game activities completed</);
  assert.match(panel, />28 \/ 29 game activities</);
  assert.match(panel, />97%</);
  assert.doesNotMatch(`${stat}${panel}`, /(?:of|\/) 30/);
});

test("keeps backend counts visible for a locked region", () => {
  const progressData = {
    summary: { overallProgress: 31, totalLevelsCleared: 4, totalLevels: 29 },
    lessons: [
      { lessonKey: "tutorial", completedLevels: 1, totalLevels: 5, progressPercent: 20, gameUnlocked: true },
      { lessonKey: "arrays", completedLevels: 3, totalLevels: 8, progressPercent: 38, gameUnlocked: false },
    ],
  };

  const panel = render(DashboardGameProgressPanel, progressData);
  assert.match(panel, /3 \/ 8 · Locked/);
});

test("renders a fully completed Functions region as 11 of 11 and 100 percent", () => {
  const progressData = {
    summary: { overallProgress: 83, totalLevelsCleared: 24, totalLevels: 29 },
    lessons: [
      { lessonKey: "tutorial", completedLevels: 5, totalLevels: 5, progressPercent: 100, gameUnlocked: true },
      { lessonKey: "arrays", completedLevels: 8, totalLevels: 8, progressPercent: 100, gameUnlocked: true },
      { lessonKey: "functions", completedLevels: 11, totalLevels: 11, progressPercent: 100, gameUnlocked: true },
    ],
  };

  const panel = render(DashboardGameProgressPanel, progressData);
  assert.match(panel, /✓ 11 \/ 11 · Completed/);
  assert.match(panel, /width:100%/);
});

test("renders backend game eligibility when a preceding region has no applicable activities", () => {
  const progressData = {
    summary: { overallProgress: 0, totalLevelsCleared: 0, totalLevels: 8 },
    lessons: [{
      lessonKey: "arrays",
      completedLevels: 0,
      totalLevels: 8,
      progressPercent: 0,
      curriculumPrerequisiteSatisfied: false,
      gameUnlocked: false,
    }],
  };

  const panel = render(DashboardGameProgressPanel, progressData);
  assert.match(panel, /No applicable game activities/);
  assert.match(panel, /0 \/ 8 · Locked/);
});

test("renders missing game eligibility as unavailable instead of unlocked", () => {
  const progressData = {
    summary: { overallProgress: 0, totalLevelsCleared: 0, totalLevels: 8 },
    lessons: [{
      lessonKey: "arrays",
      completedLevels: 0,
      totalLevels: 8,
      progressPercent: 0,
      curriculumPrerequisiteSatisfied: true,
    }],
  };

  const panel = render(DashboardGameProgressPanel, progressData);
  assert.match(panel, /0 \/ 8 · Availability unavailable/);
  assert.doesNotMatch(panel, /0 \/ 8 · In progress/);
});
