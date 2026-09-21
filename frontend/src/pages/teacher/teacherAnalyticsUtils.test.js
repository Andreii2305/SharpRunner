import assert from "node:assert/strict";
import {
  DEFAULT_ANALYTICS_FILTERS,
  buildAnalyticsQuery,
  buildExportPath,
  createEmptyAnalyticsData,
  downloadAnalyticsCsv,
  formatComparison,
  formatTrendValue,
  normalizeTrendValue,
  resetAnalyticsFilters,
} from "./teacherAnalyticsUtils.js";

const filters = {
  classroomId: "12",
  studentId: "34",
  lessonId: "curriculum:tutorial",
  datePreset: "custom",
  startDate: "2026-09-01",
  endDate: "2026-09-21",
};

assert.equal(
  buildAnalyticsQuery(filters),
  "classroomId=12&studentId=34&datePreset=custom&lessonId=curriculum%3Atutorial&startDate=2026-09-01&endDate=2026-09-21",
);
assert.deepEqual(resetAnalyticsFilters(), DEFAULT_ANALYTICS_FILTERS);
assert.notEqual(resetAnalyticsFilters(), DEFAULT_ANALYTICS_FILTERS);
assert.equal(
  buildExportPath("students", buildAnalyticsQuery(filters)),
  "/api/teacher/analytics/export/students.csv?classroomId=12&studentId=34&datePreset=custom&lessonId=curriculum%3Atutorial&startDate=2026-09-01&endDate=2026-09-21",
);
assert.throws(() => buildExportPath("events", ""), /export type/i);

assert.equal(formatTrendValue({ key: "activeSeconds", duration: true }, 125), "2m 5s");
assert.equal(formatTrendValue({ key: "activeSeconds", duration: true }, 125, { exact: true }), "2m 5s (125 seconds)");
assert.equal(formatTrendValue({ key: "firstAttemptSuccess", rate: true }, null), "N/A");
assert.equal(formatTrendValue({ key: "firstAttemptSuccess", rate: true }, 66.7), "66.7%");
assert.equal(normalizeTrendValue(null), null);
assert.equal(normalizeTrendValue(undefined), null);
assert.equal(normalizeTrendValue("not-a-number"), null);
assert.equal(normalizeTrendValue(0), 0);
assert.equal(normalizeTrendValue("66.7"), 66.7);

assert.equal(
  formatComparison({
    current: 3,
    previous: 0,
    absoluteChange: 3,
    percentageChange: null,
    unit: "count",
    message: "No percentage comparison available because the previous period was zero.",
  }, { label: "Attempts" }).detail,
  "No percentage comparison available because the previous period was zero.",
);
assert.equal(
  formatComparison({
    current: 62.5,
    previous: 50,
    absoluteChange: 12.5,
    percentageChange: null,
    unit: "percentage_points",
    message: null,
  }, { label: "First-Attempt Success", rate: true }).change,
  "+12.5 percentage points",
);

const firstEmpty = createEmptyAnalyticsData();
const secondEmpty = createEmptyAnalyticsData();
firstEmpty.lessonPerformance.push({ id: "stale" });
assert.deepEqual(secondEmpty.lessonPerformance, []);
assert.equal(secondEmpty.historical.comparison, null);

const clicks = [];
const revoked = [];
const response = {
  data: new Blob(["csv"]),
  headers: { "content-disposition": 'attachment; filename="teacher-data.csv"' },
};
const result = await downloadAnalyticsCsv({
  kind: "lessons",
  queryString: "classroomId=12",
  request: async (path, options) => {
    assert.equal(path, "/api/teacher/analytics/export/lessons.csv?classroomId=12");
    assert.deepEqual(options, { headers: { Authorization: "Bearer token" }, responseType: "blob" });
    return response;
  },
  headers: { Authorization: "Bearer token" },
  createObjectUrl: () => "blob:test",
  revokeObjectUrl: (url) => revoked.push(url),
  documentRef: {
    body: { appendChild: () => undefined },
    createElement: () => ({
      click: () => clicks.push("clicked"),
      remove: () => undefined,
    }),
  },
});
assert.deepEqual(result, { filename: "teacher-data.csv" });
assert.deepEqual(clicks, ["clicked"]);
assert.deepEqual(revoked, ["blob:test"]);

console.log("teacher analytics utility tests passed");
