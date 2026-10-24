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

const { AdminBuiltInLessonViewer } = await vite.ssrLoadModule(
  "/src/pages/admin/AdminBuiltInLessonViewer.jsx",
);

const canonicalLesson = {
  lessonKey: "arrays",
  title: "Arrays",
  eyebrow: "Canonical lesson",
  description: "Store related values.",
  objectives: ["Inspect arrays"],
  sections: [{
    id: "practice",
    title: "Practice and check",
    blocks: [
      { type: "practice", id: "p1", prompt: "Write an array.", starterCode: "int[] values = [];", expectedOutput: "2", solution: "int[] values = [1, 2];" },
      { type: "check", id: "c1", prompt: "Which index is first?", options: ["Zero", "One"], answer: 0, feedback: "Arrays are zero-indexed." },
    ],
  }],
  references: [],
};

test("built-in detail dialog exposes loading, retryable error, and authoritative renderer content", () => {
  const loading = renderToStaticMarkup(React.createElement(AdminBuiltInLessonViewer, {
    detail: { status: "loading", lessonKey: "arrays", sourceItem: { title: "Arrays" } },
    onClose() {}, onRetry() {},
  }));
  const failed = renderToStaticMarkup(React.createElement(AdminBuiltInLessonViewer, {
    detail: { status: "error", lessonKey: "arrays", sourceItem: { title: "Arrays" }, error: "Detail unavailable." },
    onClose() {}, onRetry() {},
  }));
  const success = renderToStaticMarkup(React.createElement(AdminBuiltInLessonViewer, {
    detail: { status: "success", lessonKey: "arrays", response: { schemaVersion: 1, contentRevision: "rev", mode: "read-only", lesson: canonicalLesson } },
    onClose() {}, onRetry() {},
  }));

  assert.match(loading, /role="dialog"/);
  assert.match(loading, /aria-modal="true"/);
  assert.match(loading, /tabindex="-1"/);
  assert.match(loading, /Loading built-in lesson/);
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Detail unavailable/);
  assert.match(failed, />Retry</);
  assert.match(success, /Store related values/);
  assert.match(success, /Write an array/);
  assert.match(success, /Solution/);
  assert.match(success, /Which index is first/);
  assert.match(success, /Correct answer/);
  assert.match(success, />Zero</);
  assert.doesNotMatch(success, /Run code|Finish lesson|Complete lesson|Award XP|Start game|<textarea|contenteditable=/i);
});

test("built-in dialog has one accessible name and a shared close control in every state", () => {
  for (const detail of [
    { status: "loading", lessonKey: "arrays", sourceItem: { title: "Arrays" } },
    { status: "error", lessonKey: "arrays", sourceItem: { title: "Arrays" }, error: "No detail." },
    { status: "success", lessonKey: "arrays", response: { lesson: canonicalLesson, mode: "read-only" } },
  ]) {
    const html = renderToStaticMarkup(React.createElement(AdminBuiltInLessonViewer, { detail, onClose() {}, onRetry() {} }));
    assert.match(html, /aria-labelledby="[^\"]+"/);
    assert.match(html, /aria-label="Close built-in lesson"/);
    assert.match(html, /Read-only built-in lesson/);
  }
});
