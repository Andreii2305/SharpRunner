import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("map and direct route share the canonical level assessment interpreter", async () => {
  const [map, route] = await Promise.all([
    source("../map/LessonMapPage.jsx"),
    source("./LevelRoutePage.jsx"),
  ]);
  assert.match(map, /createLevelEntryViewModel/);
  assert.match(route, /createLevelEntryViewModel/);
  assert.match(map, /completed:\s*row\?\.isCompleted\s*===\s*true/);
  assert.doesNotMatch(route, /isAccessible\s*\|\|\s*level\?\.isCompleted/);
});

test("direct level routes use verified exact-classroom progress before mounting gameplay", async () => {
  const route = await source("./LevelRoutePage.jsx");
  assert.match(route, /loadExactProgress/);
  assert.match(route, /getProgress/);
  assert.match(route, /fetchPrimaryClassroomId/);
  assert.match(route, /progress\.classroomId/);
  assert.match(route, /<Navigate[^>]+replace/);
  assert.match(route, /<GamePage[^>]+classroomId=/);
  assert.match(route, /role="alert"/);
  assert.match(route, /accessPanelRef/);
  assert.match(route, /accessPanelRef\.current\?\.focus\(\)/);
});

test("map debt and recovery states remain keyboard-visible and mobile-usable", async () => {
  const [component, css] = await Promise.all([
    source("../../Components/TiledCurriculumMap/TiledCurriculumMap.jsx"),
    source("../../Components/TiledCurriculumMap/TiledCurriculumMap.module.css"),
  ]);
  assert.match(component, /assessment-required/);
  assert.match(component, /assessment-recovery/);
  assert.match(component, /aria-label=.*actionLabel/s);
  assert.match(component, /aria-disabled/);
  assert.match(component, /onClick=\{\(\) => onNodeClick\?\.\(node\)\}/);
  assert.match(css, /\.assessment-required/);
  assert.match(css, /\.assessment-recovery/);
  assert.match(css, /focus-visible/);
  assert.match(css, /min-height:\s*44px/);
});

test("stale gameplay denials share the canonical interpreter and stop interaction", async () => {
  const [game, css] = await Promise.all([
    source("./GamePage.jsx"),
    source("./GamePage.module.css"),
  ]);

  assert.match(game, /function GamePage\(\{ levelConfig, classroomId \}\)/);
  assert.match(game, /resolveLevelAssessmentAction\(\{ classroomId, level: payload \}\)/);
  assert.match(game, /isLevelAssessmentRestriction\(payload\)/);
  assert.match(game, /const handleStaleAccessError = useCallback/);
  assert.match(game, /navigate\(action\.href, \{ replace: true \}\)/);
  assert.match(game, /heartbeatStopRef\.current\?\.\(\)/);
  assert.match(game, /levelSessionActiveRef\.current = false/);
  assert.match(game, /evaluationInFlightRef\.current = false/);
  assert.match(game, /bgmManager\.fadeOut/);
  assert.match(game, /dialogueSfxManager\.stop/);
  assert.match(game, /role="alert"/);
  assert.match(game, /buildMapHref\(classroomId\)/);
  assert.match(css, /\.accessChangedPanel/);
  assert.doesNotMatch(game, /useSearchParams/);
  assert.doesNotMatch(game, /redirectUrl/);
});

test("every mounted protected GamePage request routes denials through the shared handler", async () => {
  const game = await source("./GamePage.jsx");
  for (const marker of [
    "protected-content",
    "session-start",
    "session-heartbeat",
    "session-end",
    "completion-save",
    "failed-attempt",
    "basic-hint",
    "detailed-hint",
    "hint-feedback",
  ]) {
    assert.match(game, new RegExp(`handleStaleAccessError\\(error, "${marker}"\\)`), marker);
  }
  assert.match(game, /progressPayload === STALE_ACCESS_HANDLED/);
  assert.match(game, /if \(keepalive\)[\s\S]+fetch\([\s\S]+keepalive: true/);
  assert.match(game, /if \(!cancelled\) handleStaleAccessError\(error, "session-end"\)/);
});
