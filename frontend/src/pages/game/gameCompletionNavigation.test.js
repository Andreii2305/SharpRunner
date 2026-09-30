import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as navigation from "./gameCompletionNavigation.js";

const { createGameCompletionAction } = navigation;

const level = { lessonKey: "arrays", progressKey: "arrays-level-8" };
const progress = (lesson) => ({ classroomId: 7, lessons: [{ lessonKey: "arrays", ...lesson }] });

test("intermediate completion never exposes POST", () => {
  assert.equal(createGameCompletionAction({ progress: progress({ gameCompleted: false, nextAction: "PLAY_GAME" }), levelConfig: level }), null);
});

test("final required playable completion exposes authoritative POST without opening it", () => {
  const action = createGameCompletionAction({
    progress: progress({ gameCompleted: true, postRequired: true, postAssessmentId: 12, postUnlocked: true, nextAction: "TAKE_POST" }),
    levelConfig: level,
  });
  assert.deepEqual(action, {
    label: "Take Post-Test",
    href: "/classrooms/7/lessons/arrays/assessment/post",
    disabled: false,
  });
});

test("retry, exhaustion, completion, and the narrow final exception remain distinct", () => {
  assert.equal(createGameCompletionAction({ progress: progress({ gameCompleted: true, nextAction: "RETRY_POST", postRequired: true }), levelConfig: level }).label, "Retry Post-Test");
  assert.equal(createGameCompletionAction({ progress: progress({ gameCompleted: true, nextAction: "POST_RECOVERY_REQUIRED", postRequired: true }), levelConfig: level }).disabled, true);
  assert.equal(createGameCompletionAction({ progress: progress({ gameCompleted: true, lessonCompleted: true, nextAction: "LESSON_COMPLETE" }), levelConfig: level }).label, "Lesson Complete");
  assert.equal(createGameCompletionAction({ progress: { classroomId: 7, lessons: [{ lessonKey: "final", gameCompleted: true, nextAction: "LESSON_COMPLETE" }] }, levelConfig: { lessonKey: "final" } }), null);
});

test("gameplay progress requests preserve an explicit classroom identity", () => {
  assert.equal(
    navigation.buildExactClassroomProgressUrl?.("/api/progress/level/arrays-level-1/start", "12"),
    "/api/progress/level/arrays-level-1/start?classroomId=12",
  );
  assert.equal(
    navigation.buildExactClassroomProgressUrl?.("/api/progress/me?view=compact", 12),
    "/api/progress/me?view=compact&classroomId=12",
  );
  assert.equal(
    navigation.buildExactClassroomProgressUrl?.("/api/progress/me", null),
    "/api/progress/me",
  );
});

test("level access and gameplay mutations apply the exact-classroom URL helper", async () => {
  const routeSource = await readFile(new URL("./LevelRoutePage.jsx", import.meta.url), "utf8");
  const gameSource = await readFile(new URL("./GamePage.jsx", import.meta.url), "utf8");

  assert.match(routeSource, /buildExactClassroomProgressUrl\("\/api\/progress\/me", classroomId\)/);
  assert.equal(
    [...gameSource.matchAll(/buildExactClassroomProgressUrl\(`/g)].length,
    9,
  );
  assert.doesNotMatch(gameSource, /buildApiUrl\(`\/api\/progress\/level/);
});
