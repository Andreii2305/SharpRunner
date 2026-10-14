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

const {
  AnalyticsDefaultLayout,
  AnalyticsRequestBoundary,
  AnalyticsSummary,
  SimplifiedAnalyticsDashboard,
} = await vite.ssrLoadModule("/src/pages/teacher/TeacherAnalyticsPage.jsx");
const {
  AssessmentResultsBoundary,
  CodingQuestionBreakdown,
} = await vite.ssrLoadModule("/src/pages/teacher/assessment/TeacherAssessmentAnalyticsPanel.jsx");

const render = (component) => renderToStaticMarkup(component);

test("default analytics hierarchy places decisions before disclosed evidence", () => {
  const html = render(React.createElement(AnalyticsDefaultLayout, {
    summary: React.createElement("div", null, "summary marker"),
    attention: React.createElement("div", null, "attention marker"),
    lessons: React.createElement("div", null, "lessons marker"),
    students: React.createElement("div", null, "students marker"),
    assessment: React.createElement("button", null, "assessment marker"),
    supporting: React.createElement("button", null, "supporting marker"),
  }));

  const markers = ["summary marker", "attention marker", "lessons marker", "students marker", "PRE/POST assessment evidence", "assessment marker", "Supporting evidence", "supporting marker"];
  for (let index = 1; index < markers.length; index += 1) {
    assert.ok(html.indexOf(markers[index - 1]) < html.indexOf(markers[index]), `${markers[index - 1]} before ${markers[index]}`);
  }
  assert.match(html, /<details[^>]*><summary[^>]*>PRE\/POST assessment evidence/);
  assert.match(html, /Assessment filters are separate from the main analytics scope/);
  assert.doesNotMatch(html, /<details[^>]*open/);
});

test("compact summary renders four core measures with visible progress denominator wording", () => {
  const html = render(React.createElement(AnalyticsSummary, {
    overview: { totalStudents: 18, averageProgress: 42, completionRate: 55, averageScore: 78 },
  }));
  for (const value of ["18", "42%", "55%", "78%"] ) assert.match(html, new RegExp(`<dd>${value}<small>`));
  assert.match(html, /Average curriculum progress/);
  assert.match(html, /Started, enabled curriculum lessons/);
  assert.match(html, /Completed outcomes among started lessons/);
  assert.equal((html.match(/<div/g) || []).length, 4);
});

test("compact summary distinguishes missing measures from genuine zero", () => {
  const html = render(React.createElement(AnalyticsSummary, {
    overview: { totalStudents: null, averageProgress: 0, completionRate: null, averageScore: 0 },
  }));
  assert.match(html, /Students in scope<\/dt><dd>Not enough data/);
  assert.match(html, /Average curriculum progress<\/dt><dd>0%/);
  assert.match(html, /Completion rate<\/dt><dd>Not enough data/);
  assert.match(html, /Average score<\/dt><dd>0%/);
});

test("main request error renders local recovery without stale or fabricated results", () => {
  const html = render(React.createElement(AnalyticsRequestBoundary, {
    view: "error",
    error: "Analytics could not be loaded.",
    onRetry() {},
  }, React.createElement("div", null, "0 students No lesson activity")));
  assert.match(html, /role="alert"/);
  assert.match(html, />Retry</);
  assert.doesNotMatch(html, /0 students|No lesson activity/);
});

test("reduced lesson and student tables retain secondary metrics behind deliberate details", () => {
  const data = {
    attention: [],
    historical: { series: [], failures: [], totals: {} },
    failurePatterns: { unresolved: { categories: [] }, completedAfterFailure: { categories: [] } },
    heatmap: { students: [], lessons: [] },
    scoresAndAttempts: { scoreDistribution: [], attemptDistribution: [] },
    hints: { byLesson: [] },
    activity: { byDay: [], unavailableMetrics: [] },
    meta: { limitations: [] },
  };
  const lesson = {
    id: "curriculum:arrays",
    lessonKey: "arrays",
    source: "curriculum",
    title: "Arrays",
    available: true,
    applicableStudents: 12,
    studentsStarted: 8,
    studentsCompleted: 5,
    completionRate: 62.5,
    averageScore: 78,
    averageAttempts: 2.5,
    averageFailedAttempts: 1.5,
    averageActiveTimeLabel: "18m",
    hintUsageRate: 25,
    tracking: { hints: true },
    difficulty: { sufficientData: true, label: "Moderate" },
    levels: [],
  };
  const student = { studentId: 9, name: "Ada Lovelace", username: "ada", progress: 45, averageScore: 82, lastActivityAt: null, status: "on_track", statusLabel: "On track" };
  const html = render(React.createElement(SimplifiedAnalyticsDashboard, {
    data,
    overview: { totalStudents: 12, averageProgress: 45, completionRate: 62.5, averageScore: 78, studentsNeedingAttention: 0 },
    formulas: {},
    lessonRows: [lesson],
    curriculumFunnels: [],
    heatmapLessons: [],
    expandedLessons: new Set([lesson.id]),
    toggleLesson() {},
    lessonSort: { key: "title", direction: "asc" },
    onLessonSort() {},
    studentRows: [student],
    studentSort: { key: "name", direction: "asc" },
    onStudentSort() {},
    studentSearch: "",
    setStudentSearch() {},
    openStudent() {},
  }));
  assert.match(html, /8 of 12 started/);
  assert.match(html, /Supporting metrics for Arrays/);
  assert.match(html, /Average attempts[\s\S]*2\.5/);
  assert.match(html, /Average failed attempts[\s\S]*1\.5/);
  assert.match(html, /Average active time[\s\S]*18m/);
  assert.match(html, /Hint usage[\s\S]*25%/);
  assert.match(html, /Ada Lovelace/);
  assert.match(html, />View details</);
});

test("missing primary analytics collections are not presented as confirmed empty", () => {
  const html = render(React.createElement(SimplifiedAnalyticsDashboard, {
    data: { historical: {}, failurePatterns: {}, heatmap: {}, scoresAndAttempts: {}, hints: {}, activity: {}, meta: {} },
    overview: {},
    formulas: {},
    lessonRows: [],
    curriculumFunnels: [],
    heatmapLessons: [],
    expandedLessons: new Set(),
    toggleLesson() {},
    lessonSort: { key: "title", direction: "asc" },
    onLessonSort() {},
    studentRows: [],
    studentSort: { key: "name", direction: "asc" },
    onStudentSort() {},
    studentSearch: "",
    setStudentSearch() {},
    openStudent() {},
    attentionAvailable: false,
    lessonPerformanceAvailable: false,
    studentPerformanceAvailable: false,
  }));
  assert.match(html, /Attention results are unavailable/);
  assert.match(html, /Lesson performance is unavailable/);
  assert.match(html, /Student performance is unavailable/);
  assert.doesNotMatch(html, /No students match the current attention rules|No lesson activity matches these filters|No students match this selection/);
});

test("assessment request error renders Retry instead of availability children", () => {
  const html = render(React.createElement(AssessmentResultsBoundary, {
    view: "error",
    error: "Assessment evidence could not be loaded.",
    onRetry() {},
  }, React.createElement("div", null, "Not configured")));
  assert.match(html, /role="alert"/);
  assert.match(html, />Retry</);
  assert.doesNotMatch(html, /Not configured/);
});

test("coding analytics renders only when historical coding evidence exists", () => {
  assert.equal(render(React.createElement(CodingQuestionBreakdown, { questions: [] })), "");
  const html = render(React.createElement(CodingQuestionBreakdown, { questions: [{
    assessmentType: "PRE",
    questionId: 4,
    questionOrder: 1,
    questionLabel: "Return the total.",
    responseCount: 3,
    fullyCorrectCount: 2,
    fullyCorrectRate: 66.7,
    averageAwardedPoints: 3,
    maximumPoints: 4,
    averagePercentageEarned: 75,
  }] }));
  assert.match(html, /Coding question performance/);
  assert.match(html, /Return the total/);
});
