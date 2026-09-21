export const DEFAULT_ANALYTICS_FILTERS = Object.freeze({
  classroomId: "all",
  studentId: "all",
  datePreset: "all",
  startDate: "",
  endDate: "",
  lessonId: "all",
});

export const resetAnalyticsFilters = () => ({ ...DEFAULT_ANALYTICS_FILTERS });

export const createEmptyAnalyticsData = () => ({
  filters: { classrooms: [], students: [], lessons: [] },
  overview: {},
  highlights: {},
  lessonPerformance: [],
  studentPerformance: [],
  studentDetails: null,
  attention: [],
  heatmap: { lessons: [], students: [] },
  scoresAndAttempts: { scoreDistribution: [], attemptDistribution: [], failedAttemptsByLesson: [] },
  hints: { byLesson: [] },
  activity: { byDay: [], recent: [], unavailableMetrics: [] },
  historical: {
    trackingSince: null,
    hasData: false,
    bucket: null,
    series: [],
    failures: [],
    totals: {},
    comparison: null,
    semantics: {},
  },
  failurePatterns: {
    unresolved: { signalCount: 0, affectedStudents: 0, categories: [] },
    completedAfterFailure: { signalCount: 0, affectedStudents: 0, categories: [] },
  },
  meta: { formulas: {}, limitations: [] },
});

export const buildAnalyticsQuery = (filters) => {
  const params = new URLSearchParams();
  params.set("classroomId", filters.classroomId || "all");
  params.set("studentId", filters.studentId || "all");
  params.set("datePreset", filters.datePreset || "all");
  params.set("lessonId", filters.lessonId || "all");
  if (filters.datePreset === "custom" && filters.startDate && filters.endDate) {
    params.set("startDate", filters.startDate);
    params.set("endDate", filters.endDate);
  }
  return params.toString();
};

export const buildExportPath = (kind, queryString) => {
  if (!new Set(["students", "lessons"]).has(kind)) {
    throw new Error("Unsupported analytics export type");
  }
  return `/api/teacher/analytics/export/${kind}.csv${queryString ? `?${queryString}` : ""}`;
};

const durationLabel = (value) => {
  const seconds = Math.max(0, Math.trunc(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (remainingSeconds || !parts.length) parts.push(`${remainingSeconds}s`);
  return parts.join(" ");
};

export const formatTrendValue = (metric, value, { exact = false } = {}) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "N/A";
  if (metric.duration) {
    const seconds = Math.max(0, Math.trunc(Number(value)));
    const label = durationLabel(seconds);
    return exact ? `${label} (${seconds} seconds)` : label;
  }
  if (metric.rate) return `${Number(value)}%`;
  return String(Number(value));
};

export const normalizeTrendValue = (value) => (
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? null
    : Math.max(0, Number(value))
);

export const formatComparison = (comparison, metric) => {
  if (!comparison) return null;
  const signed = (value) => `${value > 0 ? "+" : ""}${value}`;
  let change = "N/A";
  if (comparison.absoluteChange !== null && comparison.absoluteChange !== undefined) {
    if (comparison.unit === "percentage_points") {
      change = `${signed(comparison.absoluteChange)} percentage points`;
    } else if (comparison.unit === "seconds") {
      change = `${comparison.absoluteChange > 0 ? "+" : comparison.absoluteChange < 0 ? "-" : ""}${durationLabel(Math.abs(comparison.absoluteChange))}`;
    } else {
      change = signed(comparison.absoluteChange);
    }
  }
  return {
    current: formatTrendValue(metric, comparison.current, { exact: metric.duration }),
    previous: formatTrendValue(metric, comparison.previous, { exact: metric.duration }),
    change,
    detail: comparison.message || (comparison.percentageChange == null
      ? null
      : `${signed(comparison.percentageChange)}% from the previous period.`),
  };
};

const downloadFilename = (headers, fallback) => {
  const disposition = typeof headers?.get === "function"
    ? headers.get("content-disposition")
    : headers?.["content-disposition"];
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition || "");
  if (encoded) {
    try { return decodeURIComponent(encoded[1]); } catch { return fallback; }
  }
  return /filename="([^"]+)"/i.exec(disposition || "")?.[1] || fallback;
};

export const downloadAnalyticsCsv = async ({
  kind,
  queryString,
  request,
  headers,
  createObjectUrl,
  revokeObjectUrl,
  documentRef,
}) => {
  const path = buildExportPath(kind, queryString);
  const response = await request(path, { headers, responseType: "blob" });
  const fallback = `sharprunner-${kind}-analytics.csv`;
  const filename = downloadFilename(response.headers, fallback);
  const objectUrl = createObjectUrl(response.data);
  try {
    const link = documentRef.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.hidden = true;
    documentRef.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    revokeObjectUrl(objectUrl);
  }
  return { filename };
};
