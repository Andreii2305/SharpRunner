import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

let storedUser = { id: 51, role: "student", firstName: "Student" };
globalThis.localStorage = {
  getItem: (key) => key === "user" ? JSON.stringify(storedUser) : "student-token",
  removeItem() {}, setItem() {},
};
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true } });
test.after(async () => vite.close());

const state = (overrides = {}) => ({
  status: "success", loading: false, feedback: [], page: 1, limit: 20,
  total: 0, totalPages: 0, error: "", ...overrides,
});

test("history view renders private identified plain text with archived and missing classroom context", async () => {
  const { StudentClassroomFeedbackHistoryView } = await vite.ssrLoadModule("/src/pages/student/StudentClassroomFeedbackPage.jsx");
  const html = renderToStaticMarkup(React.createElement(StudentClassroomFeedbackHistoryView, {
    state: state({
      total: 22,
      totalPages: 2,
      feedback: [
        { id: 1, classroomId: 25, message: "Line one\n<script>alert('no')</script>", createdAt: "2026-10-26T00:00:00.000Z", classroom: { id: 25, className: "Programming", section: "A", schoolYear: "2026-2027", isActive: false } },
        { id: 2, classroomId: 26, message: "Retained history", createdAt: "2026-10-25T00:00:00.000Z", classroom: null },
      ],
    }),
    onRetry() {}, onPageChange() {},
  }));

  assert.match(html, /identifies you to the classroom/);
  assert.match(html, /current owning teacher/);
  assert.match(html, /not anonymous/i);
  assert.match(html, /not public/i);
  assert.match(html, /Programming/);
  assert.match(html, /Archived classroom/);
  assert.match(html, /Classroom unavailable/);
  assert.match(html, /Line one\n&lt;script&gt;alert\(&#x27;no&#x27;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /22 submissions/);
});

test("history view keeps pagination mounted through loading error and empty states", async () => {
  const { StudentClassroomFeedbackHistoryView } = await vite.ssrLoadModule("/src/pages/student/StudentClassroomFeedbackPage.jsx");
  const render = (value) => renderToStaticMarkup(React.createElement(StudentClassroomFeedbackHistoryView, { state: value, onRetry() {}, onPageChange() {} }));
  const loading = render(state({ status: "loading", loading: true, total: null, totalPages: null }));
  const failed = render(state({ status: "error", total: null, totalPages: null, error: "Unable to load history." }));
  const empty = render(state());
  assert.match(loading, /Loading feedback history/);
  assert.match(loading, /Total unavailable/);
  assert.match(loading, /aria-label="Previous feedback page"[^>]*disabled=""/);
  assert.match(loading, /aria-label="Next feedback page"[^>]*disabled=""/);
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Retry/);
  assert.match(empty, /No classroom feedback yet/);
});

test("student navigation and route expose retained history without changing membership-guarded routes", async () => {
  const { default: Sidebar } = await vite.ssrLoadModule("/src/Components/SideBar/Sidebar.jsx");
  const studentNav = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ["/classroom-feedback"] }, React.createElement(Sidebar)));
  assert.match(studentNav, /href="\/classroom-feedback"/);
  assert.match(studentNav, />Classroom feedback</);

  storedUser = { id: 7, role: "teacher" };
  const teacherNav = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ["/teacher"] }, React.createElement(Sidebar)));
  assert.doesNotMatch(teacherNav, /href="\/classroom-feedback"/);

  const appSource = fs.readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
  assert.match(appSource, /path="\/classroom-feedback"[\s\S]{0,180}<ProtectedRoute allowedRoles=\{\["student"\]\}>/);
  const feedbackRoute = appSource.match(/<Route\s+path="\/classroom-feedback"[\s\S]*?<\/Route>/)?.[0] ?? "";
  assert.doesNotMatch(feedbackRoute, /requireClassMembership/);
  assert.match(appSource, /path="\/dashboard"[\s\S]{0,180}<ProtectedRoute requireClassMembership>/);
});

const submissionState = (overrides = {}) => ({
  classroomsStatus: "success", classroomsLoading: false,
  classrooms: [{ id: 25, className: "Programming", section: "A", schoolYear: "2026-2027" }],
  classroomsError: "", selectedClassroomId: "", message: "", characterCount: 0,
  phase: "editing", submissionErrorKind: "", submissionError: "", retryAt: null,
  feedback: null, historyRefreshStatus: "idle", historyRefreshError: "", ...overrides,
});

test("submission form requires explicit classroom selection and explains privacy and Unicode limit", async () => {
  const { StudentClassroomFeedbackSubmissionView } = await vite.ssrLoadModule("/src/pages/student/StudentClassroomFeedbackPage.jsx");
  const html = renderToStaticMarkup(React.createElement(StudentClassroomFeedbackSubmissionView, {
    state: submissionState({ message: "😀", characterCount: 1 }),
    onClassroomChange() {}, onMessageChange() {}, onSubmit() {}, onRetrySubmission() {},
    onRetryClassrooms() {}, onRetryHistoryRefresh() {}, onSendAnother() {},
  }));
  assert.match(html, /Send classroom feedback/);
  assert.match(html, /Select a classroom/);
  assert.doesNotMatch(html, /option value="25" selected/);
  assert.match(html, /identified feedback/i);
  assert.match(html, /current owning teacher/i);
  assert.match(html, /private from classmates/i);
  assert.match(html, /not anonymous/i);
  assert.match(html, /1 of 1,000 characters/);
  assert.match(html, /placeholder="Share a specific classroom learning experience…"/);
  assert.doesNotMatch(html, /â€¦/);
  assert.match(html, /disabled=""[^>]*>Submit feedback/);
});

test("classroom loading errors and successful empty lists are distinct from history", async () => {
  const { StudentClassroomFeedbackSubmissionView } = await vite.ssrLoadModule("/src/pages/student/StudentClassroomFeedbackPage.jsx");
  const render = (value) => renderToStaticMarkup(React.createElement(StudentClassroomFeedbackSubmissionView, {
    state: value, onClassroomChange() {}, onMessageChange() {}, onSubmit() {}, onRetrySubmission() {},
    onRetryClassrooms() {}, onRetryHistoryRefresh() {}, onSendAnother() {},
  }));
  const loading = render(submissionState({ classroomsStatus: "loading", classroomsLoading: true, classrooms: [] }));
  const failed = render(submissionState({ classroomsStatus: "error", classrooms: [], classroomsError: "Unable to load classrooms." }));
  const empty = render(submissionState({ classrooms: [] }));
  assert.match(loading, /Loading eligible classrooms…/);
  assert.doesNotMatch(loading, /â€¦/);
  assert.doesNotMatch(loading, /No active classrooms/);
  assert.match(failed, /Unable to load classrooms/);
  assert.match(failed, /Retry classroom loading/);
  assert.doesNotMatch(failed, /No active classrooms/);
  assert.match(empty, /No active classrooms are available for new feedback/);
});

test("uncertain, rate-limited, and confirmed-refresh-failure states expose only safe retries", async () => {
  const { StudentClassroomFeedbackSubmissionView } = await vite.ssrLoadModule("/src/pages/student/StudentClassroomFeedbackPage.jsx");
  const render = (value) => renderToStaticMarkup(React.createElement(StudentClassroomFeedbackSubmissionView, {
    state: value, onClassroomChange() {}, onMessageChange() {}, onSubmit() {}, onRetrySubmission() {},
    onRetryClassrooms() {}, onRetryHistoryRefresh() {}, onSendAnother() {},
  }));
  const uncertain = render(submissionState({ selectedClassroomId: "25", message: "Saved maybe", characterCount: 11, phase: "uncertain", submissionError: "The result is uncertain." }));
  assert.match(uncertain, /Retry same feedback/);
  assert.match(uncertain, /textarea[^>]*disabled=""/);
  assert.match(uncertain, /select[^>]*disabled=""/);

  const success = render(submissionState({
    selectedClassroomId: "25", message: "Saved", characterCount: 5, phase: "success",
    historyRefreshStatus: "error", historyRefreshError: "Your feedback was saved, but the history could not refresh.",
  }));
  assert.match(success, /feedback was saved/i);
  assert.match(success, /does not mean it has been read/i);
  assert.match(success, /Retry history refresh/);
  assert.match(success, /Send another/);
  assert.doesNotMatch(success, /Submit feedback/);
});

test("submission progress and confirmed history refresh use correctly encoded status text", async () => {
  const { StudentClassroomFeedbackSubmissionView } = await vite.ssrLoadModule("/src/pages/student/StudentClassroomFeedbackPage.jsx");
  const render = (value) => renderToStaticMarkup(React.createElement(StudentClassroomFeedbackSubmissionView, {
    state: value, onClassroomChange() {}, onMessageChange() {}, onSubmit() {}, onRetrySubmission() {},
    onRetryClassrooms() {}, onRetryHistoryRefresh() {}, onSendAnother() {},
  }));
  const submitting = render(submissionState({
    selectedClassroomId: "25", message: "A clear message", characterCount: 15, phase: "sending",
  }));
  assert.match(submitting, />Submitting…<\/button>/);
  assert.doesNotMatch(submitting, /â€¦/);

  const refreshing = render(submissionState({
    selectedClassroomId: "25", message: "Saved", characterCount: 5, phase: "success",
    historyRefreshStatus: "loading",
  }));
  assert.match(refreshing, /Refreshing feedback history…/);
  assert.doesNotMatch(refreshing, /â€¦/);
});
