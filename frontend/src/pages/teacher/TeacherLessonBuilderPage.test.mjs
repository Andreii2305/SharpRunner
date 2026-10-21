import assert from "node:assert/strict";
import test from "node:test";
import { saveLessonAndNotify } from "./teacherLessonSaveNotification.js";

test("lesson save success wording follows the authoritative saved status", async () => {
  for (const [status, expected] of [
    ["draft", "Draft saved."],
    ["published", "Lesson published."],
    ["scheduled", "Lesson scheduled."],
    ["unexpected", "Lesson saved."],
    ["constructor", "Lesson saved."],
  ]) {
    const notices = [];
    const lesson = await saveLessonAndNotify({
      save: async () => ({ id: 17, status }),
      onSuccess: (message) => notices.push(message),
    });

    assert.equal(lesson.status, status);
    assert.deepEqual(notices, [expected]);
  }
});

test("a failed lesson save does not announce success", async () => {
  const notices = [];
  const failure = new Error("save failed");

  await assert.rejects(
    saveLessonAndNotify({
      save: async () => { throw failure; },
      onSuccess: (message) => notices.push(message),
    }),
    failure,
  );
  assert.deepEqual(notices, []);
});
