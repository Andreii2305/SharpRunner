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
    name: "admin-lesson-viewer-test-editor", enforce: "pre",
    resolveId(id) { return id === "@monaco-editor/react" ? "\0admin-lesson-viewer-test-editor" : null; },
    load(id) { return id === "\0admin-lesson-viewer-test-editor" ? 'import React from "react"; export default function Editor() { return React.createElement("div", { "data-practice-editor": "true" }); }' : null; },
  }],
});
test.after(async () => vite.close());

const { AdminLessonViewer } = await vite.ssrLoadModule("/src/pages/admin/AdminLessonViewer.jsx");
const { lessonPublicationLabel } = await vite.ssrLoadModule("/src/pages/admin/adminLessonViewerState.js");
const { lessonImageDeliveryPath } = await vite.ssrLoadModule("/src/Components/LessonRenderer/lessonResourceAvailability.js");
const { DetailPanel } = await vite.ssrLoadModule("/src/pages/admin/AdminDashboardPage.jsx");

const lesson = {
  id: 51, title: "Admin lesson", description: "Read-only description", status: "scheduled",
  publishAt: "2026-12-01T09:30:00.000Z", archivedAt: null, usageCount: 2,
  placements: [
    { id: 1, archivedAt: null, classroom: { className: "Alpha", section: "A" }, module: { title: "Foundations" } },
    { id: 2, archivedAt: "2026-10-01T00:00:00.000Z", classroom: { className: "Beta", section: "B" }, module: null },
  ],
  attachments: [
    { id: 7, originalName: "allowed.pdf", sizeBytes: 1000, available: true },
    { id: 8, originalName: "blocked.pdf", sizeBytes: 1000, available: false },
    { id: 9, originalName: "legacy.pdf", sizeBytes: 1000 },
  ],
  topics: [{ id: 2, title: "Topic", displayOrder: 0, images: [
    { id: 20, displayOrder: 0, available: false, altText: "Blocked diagram" },
    { id: 21, displayOrder: 1, altText: "Legacy diagram" },
  ], content: { blocks: [
    { id: "intro", type: "content", displayOrder: 0, body: "Lesson body" },
    { id: "image1", type: "image", displayOrder: 1, imageId: 20 },
    { id: "image2", type: "image", displayOrder: 2, imageId: 21 },
    { id: "practice", type: "practice", displayOrder: 3, title: "Static practice", prompt: "Inspect this", starterCode: "Console.WriteLine(1);" },
  ] } }],
};

test("admin lesson viewer renders read-only content, publication, and separate placement states", () => {
  const html = renderToStaticMarkup(React.createElement(AdminLessonViewer, { detail: { type: "lesson", status: "success", lesson, sourceItem: { id: 51, teacher: "not authoritative" } }, onClose() {}, onRetry() {}, onOpenAttachment() {} }));
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-labelledby="[^"]+"/);
  assert.match(html, /tabindex="-1"/);
  assert.match(html, /Admin lesson/);
  assert.match(html, /Read-only description/);
  assert.match(html, /Scheduled/);
  assert.match(html, /Release date and time/);
  assert.match(html, /(UTC|GMT)/);
  assert.match(html, /2 placement records/);
  assert.doesNotMatch(html, /active classroom/i);
  assert.match(html, /Active placement/);
  assert.match(html, /Archived placement/);
  assert.match(html, /Static practice/);
  assert.match(html, /Console\.WriteLine\(1\);/);
  assert.doesNotMatch(html, /Run code|data-practice-editor/);
  assert.match(html, /Owner/);
  assert.match(html, /Not available/);
  assert.doesNotMatch(html, /not authoritative/);
});

test("archived publication wins and owner appears only from the detail response", () => {
  assert.equal(lessonPublicationLabel({ status: "draft" }), "Draft");
  assert.equal(lessonPublicationLabel({ status: "scheduled" }), "Scheduled");
  assert.equal(lessonPublicationLabel({ status: "published" }), "Published");
  assert.equal(lessonPublicationLabel({ ...lesson, archivedAt: "2026-10-01", status: "published" }), "Archived");
  const html = renderToStaticMarkup(React.createElement(AdminLessonViewer, { detail: { type: "lesson", status: "success", lesson: { ...lesson, archivedAt: "2026-10-01", owner: { firstName: "Ada", lastName: "Owner", username: "ada" }, teacher: { firstName: "Wrong", lastName: "Source" } } }, onClose() {} }));
  assert.match(html, /Archived/);
  assert.match(html, /Ada Owner/);
  assert.doesNotMatch(html, /Wrong Source/);
});

test("direct classroom context remains separate from reusable placement records", () => {
  const direct = renderToStaticMarkup(React.createElement(AdminLessonViewer, {
    detail: { type: "lesson", status: "success", lesson: {
      ...lesson,
      classroomId: 12,
      classroom: { id: 12, className: "C# Foundations", section: "A", schoolYear: "2026-2027", isActive: true },
      placements: [],
      usageCount: 0,
    } },
    onClose() {},
  }));
  assert.match(direct, /Direct classroom/);
  assert.match(direct, /C# Foundations/);
  assert.match(direct, /2026-2027/);
  assert.match(direct, /0 placement records/);
  assert.match(direct, /No reusable placements/);

  const reusable = renderToStaticMarkup(React.createElement(AdminLessonViewer, {
    detail: { type: "lesson", status: "success", lesson: { ...lesson, classroomId: null, classroom: null } },
    onClose() {},
  }));
  assert.match(reusable, /No direct classroom/);
  assert.match(reusable, /2 placement records/);
});

test("inactive and missing direct-classroom or owner associations are represented neutrally", () => {
  const inactive = renderToStaticMarkup(React.createElement(AdminLessonViewer, {
    detail: { type: "lesson", status: "success", lesson: {
      ...lesson,
      owner: null,
      teacher: { firstName: "Untrusted", lastName: "Teacher" },
      classroomId: 13,
      classroom: { id: 13, className: "Legacy Class", section: "B", schoolYear: "2025-2026", isActive: false },
    } },
    onClose() {},
  }));
  assert.match(inactive, /Owner/);
  assert.match(inactive, /Not available/);
  assert.match(inactive, /Archived classroom/);
  assert.doesNotMatch(inactive, /Untrusted Teacher/);

  const missing = renderToStaticMarkup(React.createElement(AdminLessonViewer, {
    detail: { type: "lesson", status: "success", lesson: { ...lesson, owner: { email: "not-authoritative@example.test" }, classroomId: 999, classroom: null } },
    onClose() {},
  }));
  assert.match(missing, /Classroom details unavailable/);
  assert.match(missing, /Not available/);
  assert.doesNotMatch(missing, /not-authoritative@example\.test/);
});

test("blocked and missing availability render unavailable while allowed resources stay actionable", () => {
  const html = renderToStaticMarkup(React.createElement(AdminLessonViewer, { detail: { type: "lesson", status: "success", lesson }, onClose() {}, onOpenAttachment() {} }));
  assert.match(html, /allowed\.pdf/);
  assert.match(html, /blocked\.pdf/);
  assert.match(html, /legacy\.pdf/);
  assert.equal((html.match(/File unavailable/g) || []).length, 2);
  assert.equal((html.match(/This image is unavailable\./g) || []).length, 2);
  assert.equal((html.match(/Open or download/g) || []).length, 1);
  assert.equal(lessonImageDeliveryPath({ id: 20, available: false }, null, true), null);
  assert.equal(lessonImageDeliveryPath({ id: 21 }, null, true), null);
  assert.equal(lessonImageDeliveryPath({ id: 22, available: true }, null, true), "/api/lesson-content/classroom-files/22");
  assert.equal(lessonImageDeliveryPath({ id: 22, available: true }, 25, true), "/api/lesson-content/classroom-files/22?classroomId=25");
});

test("loading, retryable error, and empty lesson content have explicit states", () => {
  const loading = renderToStaticMarkup(React.createElement(AdminLessonViewer, { detail: { type: "lesson", status: "loading", sourceItem: { title: "Loading lesson" } }, onClose() {} }));
  const error = renderToStaticMarkup(React.createElement(AdminLessonViewer, { detail: { type: "lesson", status: "error", error: "Unable to load lesson.", sourceItem: { title: "Broken lesson" } }, onClose() {}, onRetry() {} }));
  const empty = renderToStaticMarkup(React.createElement(AdminLessonViewer, { detail: { type: "lesson", status: "success", lesson: { id: 99, title: "Empty", topics: [], attachments: [], placements: [], usageCount: 0 } }, onClose() {} }));
  assert.match(loading, /Loading lesson content/);
  assert.match(error, /Unable to load lesson/);
  assert.match(error, /Retry/);
  assert.match(empty, /No structured lesson content/);
});

test("lesson viewer exposes current download progress without changing the neutral file error", () => {
  const downloading = renderToStaticMarkup(React.createElement(AdminLessonViewer, {
    detail: { type: "lesson", status: "success", lesson },
    onClose() {},
    onOpenAttachment() {},
    fileLoading: true,
    fileError: "",
  }));
  const failed = renderToStaticMarkup(React.createElement(AdminLessonViewer, {
    detail: { type: "lesson", status: "success", lesson },
    onClose() {},
    onOpenAttachment() {},
    fileLoading: false,
    fileError: "This file is no longer available. The lesson details remain open.",
  }));
  assert.match(downloading, /Preparing file download/);
  assert.match(failed, /This file is no longer available\. The lesson details remain open\./);
});

test("module and assignment details retain the existing metadata panel", () => {
  for (const contentType of ["module", "assignment"]) {
    const html = renderToStaticMarkup(React.createElement(DetailPanel, { onClose() {}, detail: { type: "content", content: { id: 1, contentType, title: `${contentType} title`, isPublished: true, attachments: [] } } }));
    assert.match(html, /Read-only content detail/);
    assert.match(html, new RegExp(`${contentType} title`));
    assert.doesNotMatch(html, /Lesson topics/);
  }
});
