import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

const vite = await createServer({
  server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true },
  ssr: { noExternal: ["@monaco-editor/react"] },
  plugins: [{
    name: "admin-built-in-catalogue-test-editor", enforce: "pre",
    resolveId(id) { return id === "@monaco-editor/react" ? "\0admin-built-in-catalogue-test-editor" : null; },
    load(id) { return id === "\0admin-built-in-catalogue-test-editor" ? 'import React from "react"; export default function Editor() { return React.createElement("div"); }' : null; },
  }],
});
test.after(async () => vite.close());

const dashboardModule = await vite.ssrLoadModule("/src/pages/admin/AdminDashboardPage.jsx");
const { AdminBuiltInLessonCatalogue, AdminContentSourceControls, AdminContentView } = dashboardModule;

const lessons = [
  { lessonKey: "tutorial", title: "C# Foundations", eyebrow: "Tutorial", description: "Start here.", displayOrder: 1, sectionCount: 9 },
  { lessonKey: "arrays", title: "Arrays", eyebrow: "Arrays", description: "Store values.", displayOrder: 2, sectionCount: 11 },
  { lessonKey: "functions", title: "Functions and Methods", eyebrow: "Functions", description: "Reuse behavior.", displayOrder: 3, sectionCount: 11 },
];

test("source controls default to teacher-created and expose both accessible choices", () => {
  assert.equal(typeof AdminContentSourceControls, "function");
  const html = renderToStaticMarkup(React.createElement(AdminContentSourceControls, { onChange() {} }));
  assert.match(html, /role="group"/);
  assert.match(html, /aria-label="Content source"/);
  assert.match(html, /aria-pressed="true"[^>]*>Teacher-created/);
  assert.match(html, /aria-pressed="false"[^>]*>Built-in lessons/);
});

test("built-in catalogue renders canonical order and only catalogue metadata", () => {
  assert.equal(typeof AdminBuiltInLessonCatalogue, "function");
  const html = renderToStaticMarkup(React.createElement(AdminBuiltInLessonCatalogue, {
    state: { status: "success", error: "", lessons },
    onRetry() {},
    onInspect() {},
  }));

  let previousIndex = -1;
  for (const lesson of lessons) {
    const nextIndex = html.indexOf(lesson.title, previousIndex + 1);
    assert.ok(nextIndex > previousIndex, `${lesson.title} should retain canonical order`);
    previousIndex = nextIndex;
    assert.match(html, new RegExp(lesson.eyebrow));
    assert.match(html, new RegExp(lesson.description.replace(".", "\\.")));
    assert.match(html, new RegExp(`${lesson.sectionCount} sections`));
  }
  assert.doesNotMatch(html, /Classroom|Teacher|Owner|Publish state|Archived|Scheduled|Draft/);
  assert.equal((html.match(/>Inspect</g) || []).length, lessons.length);
  for (const lesson of lessons) assert.match(html, new RegExp(`aria-label="Inspect ${lesson.title}`));
});

test("built-in catalogue presents loading, empty, error, and retry states", () => {
  const loading = renderToStaticMarkup(React.createElement(AdminBuiltInLessonCatalogue, {
    state: { status: "loading", error: "", lessons: [] }, onRetry() {},
  }));
  const empty = renderToStaticMarkup(React.createElement(AdminBuiltInLessonCatalogue, {
    state: { status: "success", error: "", lessons: [] }, onRetry() {},
  }));
  const failed = renderToStaticMarkup(React.createElement(AdminBuiltInLessonCatalogue, {
    state: { status: "error", error: "Unable to load built-in lessons.", lessons: [] }, onRetry() {},
  }));

  assert.match(loading, /Loading built-in lessons/);
  assert.match(loading, /role="status"/);
  assert.match(empty, /No built-in lessons are available/);
  assert.match(failed, /Unable to load built-in lessons/);
  assert.match(failed, /role="alert"/);
  assert.match(failed, />Retry</);
});

test("Content view hides teacher filters in built-in mode without changing teacher state", () => {
  assert.equal(typeof AdminContentView, "function");
  const sharedProps = {
    content: [{ id: 44, title: "Preserved teacher lesson", contentType: "lesson", status: "draft", owner: null, classroom: null, createdAt: "2026-10-01T00:00:00Z" }],
    contentFilters: { search: "loops", type: "lesson", status: "draft" },
    contentLoading: false,
    contentError: "",
    contentPage: 3,
    contentMeta: { total: 41, totalPages: 4 },
    builtInState: { status: "success", error: "", lessons },
    onSourceChange() {}, onContentFilterChange() {}, onContentPageChange() {}, onOpenContent() {}, onRetryBuiltIn() {},
  };

  const builtInHtml = renderToStaticMarkup(React.createElement(AdminContentView, {
    ...sharedProps,
    source: "built-in",
  }));
  assert.match(builtInHtml, /C# Foundations/);
  assert.doesNotMatch(builtInHtml, /Search content|Publish state|Preserved teacher lesson|41 items|Page 3 of 4/);

  const teacherHtml = renderToStaticMarkup(React.createElement(AdminContentView, {
    ...sharedProps,
    source: "teacher",
  }));
  assert.match(teacherHtml, /Preserved teacher lesson/);
  assert.match(teacherHtml, /value="loops"/);
  assert.match(teacherHtml, /value="lesson" selected/);
  assert.match(teacherHtml, /value="draft" selected/);
  assert.match(teacherHtml, /41 items/);
  assert.match(teacherHtml, /Page 3 of 4/);
});
