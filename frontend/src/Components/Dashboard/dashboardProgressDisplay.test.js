import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import {
  DASHBOARD_REGION_KEYS,
  createDashboardProgressDisplay,
  createDashboardRegionProgressDisplay,
  createDashboardRegionTileDisplays,
} from "./dashboardProgressDisplay.js";

const require = createRequire(import.meta.url);
const { PLAYABLE_LEVEL_KEYS } = require("../../../../backend/src/constants/progressDefaults.js");

test("shows 97% game progress separately from 28 of 29 completed activities", () => {
  const display = createDashboardProgressDisplay({
    summary: {
      overallProgress: 97,
      completedLevels: 28,
      totalLevelsCleared: 28,
      totalLevels: 29,
    },
    lessons: [],
  });

  assert.equal(display.label, "Game progress");
  assert.equal(display.percentageText, "97%");
  assert.equal(display.countText, "28 of 29 game activities completed");
});

test("uses the Functions lesson payload for an 11 of 11 completed region", () => {
  const region = createDashboardRegionProgressDisplay({
    summary: { totalLevels: 29 },
    lessons: [{
      lessonKey: "functions",
      completedLevels: 11,
      totalLevels: 11,
      progressPercent: 100,
    }],
  }, "functions");

  assert.equal(region.countText, "11 / 11");
  assert.equal(region.progressPercent, 100);
  assert.equal(region.isCompleted, true);
});

test("uses the reduced applicable totals supplied for a classroom", () => {
  const progress = {
    summary: {
      overallProgress: 96,
      totalLevelsCleared: 25,
      totalLevels: 27,
    },
    lessons: [{
      lessonKey: "arrays",
      completedLevels: 7,
      totalLevels: 7,
      progressPercent: 100,
    }],
  };

  assert.equal(
    createDashboardProgressDisplay(progress).countText,
    "25 of 27 game activities completed",
  );
  assert.equal(
    createDashboardRegionProgressDisplay(progress, "arrays").countText,
    "7 / 7",
  );
});

test("keeps the next region locked when a disabled region has an unmet required assessment", () => {
  const progress = {
    summary: { overallProgress: 0, totalLevelsCleared: 0, totalLevels: 11 },
    lessons: [
      {
        lessonKey: "functions",
        completedLevels: 0,
        totalLevels: 11,
        progressPercent: 0,
        curriculumPrerequisiteSatisfied: false,
        gameUnlocked: false,
      },
    ],
  };

  const regions = createDashboardRegionTileDisplays(progress);
  assert.equal(
    regions.find(({ lessonKey }) => lessonKey === "arrays").countText,
    "No applicable game activities",
  );
  assert.equal(regions.find(({ lessonKey }) => lessonKey === "functions").availability, "locked");
});

test("shows the next region as available when disabled-region prerequisites are satisfied", () => {
  const progress = {
    summary: { overallProgress: 0, totalLevelsCleared: 0, totalLevels: 11 },
    lessons: [{
      lessonKey: "functions",
      completedLevels: 0,
      totalLevels: 11,
      progressPercent: 0,
      curriculumPrerequisiteSatisfied: true,
      gameUnlocked: true,
    }],
  };

  const functions = createDashboardRegionTileDisplays(progress)
    .find(({ lessonKey }) => lessonKey === "functions");
  assert.equal(functions.availability, "available");
  assert.match(functions.statusText, /In progress$/);
});

test("does not use completed game activities to bypass an unmet assessment gate", () => {
  const progress = {
    summary: { overallProgress: 42, totalLevelsCleared: 8, totalLevels: 19 },
    lessons: [
      {
        lessonKey: "arrays",
        completedLevels: 8,
        totalLevels: 8,
        progressPercent: 100,
        gameUnlocked: true,
        gameCompleted: true,
        postRequired: true,
        postCompleted: false,
        lessonCompleted: false,
      },
      {
        lessonKey: "functions",
        completedLevels: 0,
        totalLevels: 11,
        progressPercent: 0,
        curriculumPrerequisiteSatisfied: false,
        gameUnlocked: false,
      },
    ],
  };

  const regions = createDashboardRegionTileDisplays(progress);
  assert.equal(regions.find(({ lessonKey }) => lessonKey === "arrays").availability, "available");
  assert.equal(regions.find(({ lessonKey }) => lessonKey === "functions").availability, "locked");
});

test("shows unknown availability when an applicable lesson omits game eligibility", () => {
  const progress = {
    summary: { overallProgress: 0, totalLevelsCleared: 0, totalLevels: 8 },
    lessons: [{
      lessonKey: "arrays",
      completedLevels: 0,
      totalLevels: 8,
      progressPercent: 0,
      curriculumPrerequisiteSatisfied: true,
    }],
  };

  const arrays = createDashboardRegionTileDisplays(progress)
    .find(({ lessonKey }) => lessonKey === "arrays");
  assert.equal(arrays.availability, "unknown");
  assert.equal(arrays.statusText, "0 / 8 · Availability unavailable");
});

test("uses game eligibility for tutorial and final-challenge regions", () => {
  const progress = {
    summary: { overallProgress: 0, totalLevelsCleared: 0, totalLevels: 6 },
    lessons: [
      {
        lessonKey: "tutorial",
        completedLevels: 0,
        totalLevels: 5,
        progressPercent: 0,
        curriculumPrerequisiteSatisfied: true,
        gameUnlocked: true,
      },
      {
        lessonKey: "final",
        completedLevels: 0,
        totalLevels: 1,
        progressPercent: 0,
        curriculumPrerequisiteSatisfied: false,
        gameUnlocked: false,
      },
    ],
  };

  const regions = createDashboardRegionTileDisplays(progress);
  assert.equal(regions.find(({ lessonKey }) => lessonKey === "tutorial").availability, "available");
  assert.equal(regions.find(({ lessonKey }) => lessonKey === "final").availability, "locked");
});

test("keeps partial progress independent from the completed activity count", () => {
  const progress = {
    summary: {
      overallProgress: 50,
      completedLevels: 0,
      totalLevels: 1,
    },
    lessons: [{
      lessonKey: "final",
      completedLevels: 0,
      totalLevels: 1,
      progressPercent: 50,
    }],
  };

  const overall = createDashboardProgressDisplay(progress);
  const finalRegion = createDashboardRegionProgressDisplay(progress, "final");
  assert.equal(overall.percentageText, "50%");
  assert.equal(overall.countText, "0 of 1 game activity completed");
  assert.equal(finalRegion.progressPercent, 50);
  assert.equal(finalRegion.isCompleted, false);
});

test("reports missing and zero-applicable progress without implying completion", () => {
  const missingOverall = createDashboardProgressDisplay(null);
  const missingRegion = createDashboardRegionProgressDisplay(null, "tutorial");
  assert.equal(missingOverall.percentageText, "—");
  assert.equal(missingOverall.countText, "Progress unavailable");
  assert.equal(missingOverall.hasApplicableActivities, false);
  assert.equal(missingRegion.countText, "Progress unavailable");
  assert.equal(missingRegion.isCompleted, false);

  const zeroProgress = {
    summary: {
      overallProgress: 0,
      completedLevels: 0,
      totalLevels: 0,
    },
    lessons: [],
  };
  const zeroOverall = createDashboardProgressDisplay(zeroProgress);
  const zeroRegion = createDashboardRegionProgressDisplay(zeroProgress, "tutorial");
  assert.equal(zeroOverall.percentageText, "—");
  assert.equal(zeroOverall.countText, "No applicable game activities");
  assert.equal(zeroOverall.hasApplicableActivities, false);
  assert.equal(zeroRegion.countText, "No applicable game activities");
  assert.equal(zeroRegion.isCompleted, false);
});

test("treats null and blank summary fields as unavailable rather than zero", () => {
  for (const summary of [
    { overallProgress: 0, completedLevels: 0, totalLevels: null },
    { overallProgress: "", completedLevels: 0, totalLevels: 29 },
    { overallProgress: 97, completedLevels: null, totalLevels: 29 },
  ]) {
    const display = createDashboardProgressDisplay({ summary, lessons: [] });
    assert.equal(display.percentageText, "—");
    assert.equal(display.countText, "Progress unavailable");
  }
});

test("maps dashboard regions to the canonical backend lesson keys", () => {
  const backendLessonKeys = [...new Set(PLAYABLE_LEVEL_KEYS.map(
    (levelKey) => levelKey.replace(/-level-\d+$/, ""),
  ))];
  assert.deepEqual(DASHBOARD_REGION_KEYS, backendLessonKeys);
  assert.deepEqual(backendLessonKeys, [
    "tutorial",
    "arrays",
    "functions",
    "functions-with-arrays",
    "final",
  ]);
});
