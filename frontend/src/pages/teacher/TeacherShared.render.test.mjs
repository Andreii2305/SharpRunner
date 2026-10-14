import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true },
});
test.after(async () => vite.close());
const teacherStyles = fs.readFileSync(new URL("./TeacherPage.module.css", import.meta.url), "utf8");

const form = {
  className: "Draft class",
  section: "BSIT 1A",
  schoolYear: "2025-2026",
  maxStudents: "40",
  description: "Draft description",
};

test("create stage exposes a labelled modal and blocks every visible dismissal control while pending", async () => {
  const { ClassCreationDialogFlow } = await vite.ssrLoadModule("/src/pages/teacher/TeacherShared.jsx");
  const html = renderToStaticMarkup(React.createElement(ClassCreationDialogFlow, {
    stage: "create",
    form,
    onChange() {},
    onSubmit() {},
    onClose() {},
    isCreating: true,
    error: "Please wait",
  }));

  assert.match(html, /role="dialog"/);
  assert.match(html, /class="[^"]*classDialog[^"]*"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="[^"]+"/);
  assert.match(html, /<input[^>]*autofocus=""[^>]*name="className"[^>]*value="Draft class"/);
  assert.match(html, /<button[^>]*aria-label="Close create class dialog"[^>]*disabled=""/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Cancel<\/button>/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Creating\.\.\.<\/button>/);
});

test("class-dialog target and focus rules stay scoped away from unrelated teacher controls", () => {
  assert.match(teacherStyles, /\.classDialogTrigger/);
  assert.match(teacherStyles, /\.classDialog\s+\.modalCloseBtn/);
  assert.match(teacherStyles, /\.classDialog\s+\.modalActions/);
  assert.doesNotMatch(teacherStyles, /\.pageActions\s*>\s*\.btnPrimary/);
  assert.doesNotMatch(teacherStyles, /(^|\n)\.modalCloseBtn\s*\{[^}]*min-height:\s*44px/s);
});

test("success stage remains a labelled dialog and exposes the final close action", async () => {
  const { ClassCreationDialogFlow } = await vite.ssrLoadModule("/src/pages/teacher/TeacherShared.jsx");
  const html = renderToStaticMarkup(React.createElement(ClassCreationDialogFlow, {
    stage: "success",
    form,
    classCode: "ABC123",
    onChange() {},
    onSubmit() {},
    onClose() {},
    isCreating: false,
    error: "",
  }));

  assert.match(html, /role="dialog"/);
  assert.match(html, /Classroom created!/);
  assert.match(html, /ABC123/);
  assert.match(html, />Done<\/button>/);
  assert.doesNotMatch(html, /name="className"/);
});

test("classroom section tabs identify the selected tab and its currently rendered panel", async () => {
  const { ClassroomSectionTabs, ClassroomSectionPanel } = await vite.ssrLoadModule("/src/pages/teacher/TeacherClassDetailPage.jsx");
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(ClassroomSectionTabs, {
      idBase: "classroom-sections",
      activeTab: "analytics",
      onSelect() {},
      lessonCount: 3,
      hasClassroomIdentity: true,
    }),
    React.createElement(ClassroomSectionPanel, {
      idBase: "classroom-sections",
      activeTab: "analytics",
      className: "content",
    }, "Analytics content"),
  ));

  assert.match(html, /role="tablist"/);
  assert.match(html, /id="classroom-sections-tab-analytics"[^>]*aria-selected="true"[^>]*aria-controls="classroom-sections-panel"/);
  assert.match(html, /role="tabpanel"[^>]*id="classroom-sections-panel"[^>]*aria-labelledby="classroom-sections-tab-analytics"/);
  assert.match(html, /id="classroom-sections-tab-students"[^>]*aria-selected="false"[^>]*aria-controls="classroom-sections-panel"[^>]*tabindex="-1"/);
});
