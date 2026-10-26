import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  cacheDir: "node_modules/.vite-test-teacher-classroom-feedback",
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
test.after(async () => vite.close());

test("production feedback panel renders identified plain-text history and authoritative totals", async () => {
  const { TeacherClassroomFeedbackView } = await vite.ssrLoadModule("/src/pages/teacher/TeacherClassroomFeedback.jsx");
  const html = renderToStaticMarkup(React.createElement(TeacherClassroomFeedbackView, {
    state: {
      status: "success",
      loading: false,
      feedback: [
        { id: 1, classroomId: 25, message: "First line\n<script>alert(1)</script>", createdAt: "2026-10-26T10:00:00.000Z", student: { id: 4, firstName: "Ada", lastName: "Lovelace", username: "ada" } },
        { id: 2, classroomId: 25, message: "Still available", createdAt: "2026-10-25T10:00:00.000Z", student: null },
      ],
      page: 1,
      limit: 20,
      total: 27,
      totalPages: 2,
      error: "",
    },
    onRetry() {}, onPageChange() {},
  }));

  assert.match(html, /identified classroom feedback, not anonymous/i);
  assert.match(html, /Ada Lovelace/);
  assert.match(html, /@ada/);
  assert.match(html, /Student identity unavailable/);
  assert.match(html, /27 submissions/);
  assert.match(html, /First line\n&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Previous/);
  assert.match(html, /Next/);
});

test("feedback panel exposes loading, empty, retryable error, and unavailable pagination states", async () => {
  const { TeacherClassroomFeedbackView } = await vite.ssrLoadModule("/src/pages/teacher/TeacherClassroomFeedback.jsx");
  const base = { feedback: [], page: 1, limit: 20, total: null, totalPages: null, loading: false, error: "" };
  const loading = renderToStaticMarkup(React.createElement(TeacherClassroomFeedbackView, { state: { ...base, status: "loading", loading: true }, onRetry() {}, onPageChange() {} }));
  const error = renderToStaticMarkup(React.createElement(TeacherClassroomFeedbackView, { state: { ...base, status: "error", error: "Access denied" }, onRetry() {}, onPageChange() {} }));
  const empty = renderToStaticMarkup(React.createElement(TeacherClassroomFeedbackView, { state: { ...base, status: "success", total: 0, totalPages: 0 }, onRetry() {}, onPageChange() {} }));
  assert.match(loading, /Loading classroom feedback/);
  assert.match(loading, /Total unavailable/);
  assert.match(error, /role="alert"/);
  assert.match(error, /Retry/);
  assert.match(empty, /No feedback has been submitted/);
  assert.match(loading, /<button[^>]*disabled=""[^>]*aria-label="Previous feedback page"/);
  assert.match(loading, /<button[^>]*disabled=""[^>]*aria-label="Next feedback page"/);
});

test("production classroom page wires a teacher-only feedback tab to its controller-backed component", async () => {
  const { ClassroomSectionTabs } = await vite.ssrLoadModule("/src/pages/teacher/TeacherClassDetailPage.jsx");
  const teacher = renderToStaticMarkup(React.createElement(ClassroomSectionTabs, { idBase: "tabs", activeTab: "students", onSelect() {}, lessonCount: 0, hasClassroomIdentity: true, showFeedback: true }));
  const admin = renderToStaticMarkup(React.createElement(ClassroomSectionTabs, { idBase: "tabs", activeTab: "students", onSelect() {}, lessonCount: 0, hasClassroomIdentity: true, showFeedback: false }));
  const source = fs.readFileSync(new URL("./TeacherClassDetailPage.jsx", import.meta.url), "utf8");
  assert.match(teacher, />Feedback</);
  assert.doesNotMatch(admin, />Feedback</);
  assert.match(source, /<TeacherClassroomFeedback[\s\S]*isActive=\{activeTab === "feedback"\}/);
});
