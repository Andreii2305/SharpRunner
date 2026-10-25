import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true },
});
test.after(async () => vite.close());

const { TeacherAssessmentAttentionCard } = await vite.ssrLoadModule(
  "/src/pages/teacher/TeacherAssessmentAttention.jsx",
);

const classrooms = [
  { id: 7, className: "Algorithms", section: "A", schoolYear: "2026-2027" },
  { id: 8, className: "Data Structures", section: "B", schoolYear: "2026-2027" },
];
const base = {
  classrooms,
  classroomStatus: "success",
  classroomError: "",
  selectedClassroomId: "7",
  state: { status: "success", loading: false, students: [], total: 0, limit: 5, error: "" },
  onClassroomChange() {},
  onRetry() {},
  onRetryClassrooms() {},
};

const render = (overrides = {}) => renderToStaticMarkup(React.createElement(
  TeacherAssessmentAttentionCard,
  { ...base, ...overrides },
));

test("card renders scoped recovery reasons without ranks and separates shown rows from total", () => {
  const html = render({
    state: {
      ...base.state,
      total: 9,
      students: [{
        id: 42,
        firstName: "Ada",
        lastName: "Lovelace",
        username: "ada",
        reasons: [{
          code: "POST_RECOVERY_REQUIRED",
          assessment: { id: 20, title: "Arrays post-assessment", type: "POST" },
          target: { kind: "BUILT_IN", lessonKey: "arrays", lessonTitle: "Arrays" },
          message: "No POST attempts remain for Arrays post-assessment; teacher recovery is required.",
        }],
      }],
    },
  });

  assert.match(html, /Students needing attention/);
  assert.match(html, /Built-in POST assessments requiring teacher recovery\./);
  assert.match(html, /Ada Lovelace/);
  assert.match(html, /@ada/);
  assert.match(html, /Arrays/);
  assert.match(html, /Arrays post-assessment/);
  assert.match(html, /1 shown of 9 students requiring recovery/);
  assert.doesNotMatch(html, /rank|inactive|low ability|disengaged/i);
});

test("card exposes accessible classroom selection and all non-success states", () => {
  const selected = render();
  assert.match(selected, /<label[^>]*for="teacher-attention-classroom"/);
  assert.match(selected, /<select[^>]*id="teacher-attention-classroom"[^>]*aria-label="Classroom for students needing attention"/);
  assert.match(selected, /<option value="7" selected="">Algorithms · A/);
  assert.match(selected, /No built-in POST assessments currently require recovery in this classroom\./);

  assert.match(render({ classroomStatus: "loading", classrooms: [] }), /Loading active classrooms/);
  assert.match(render({ classroomStatus: "success", classrooms: [], selectedClassroomId: "" }), /No active classrooms are available/);
  const classroomError = render({ classroomStatus: "error", classroomError: "Unable to load active classrooms.", classrooms: [] });
  assert.match(classroomError, /role="alert"/);
  assert.match(classroomError, /Retry classrooms/);

  assert.match(render({ state: { ...base.state, status: "loading", loading: true, total: null } }), /Loading students needing attention/);
  const failed = render({ state: { ...base.state, status: "error", error: "Recovery data is unavailable.", total: null } });
  assert.match(failed, /Recovery data is unavailable/);
  assert.match(failed, />Retry</);
  assert.doesNotMatch(failed, /0 shown|of 0/);
});
