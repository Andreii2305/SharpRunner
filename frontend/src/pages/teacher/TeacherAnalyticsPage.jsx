import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  FiActivity, FiAlertCircle, FiBarChart2, FiBookOpen, FiCheckCircle,
  FiChevronDown, FiChevronRight, FiClock, FiDownload, FiFileText, FiHelpCircle,
  FiPrinter, FiSearch, FiTarget, FiUsers, FiX,
} from "react-icons/fi";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import { buildApiUrl, getAuthHeaders } from "../../utils/auth";
import styles from "./TeacherPage.module.css";
import pgStyles from "./TeacherAnalyticsPage.module.css";
import TeacherAnalyticsReport from "./TeacherAnalyticsReport.jsx";
import {
  buildAnalyticsQuery,
  createEmptyAnalyticsData,
  downloadAnalyticsCsv,
  formatComparison,
  formatTrendValue,
  normalizeTrendValue,
  resetAnalyticsFilters,
} from "./teacherAnalyticsUtils.js";

const TREND_METRICS = [
  { key: "attempts", label: "Attempts" },
  { key: "successfulAttempts", label: "Successful Attempts" },
  { key: "failedAttempts", label: "Failed Attempts" },
  { key: "completions", label: "Completions" },
  { key: "activeSeconds", label: "Active Learning Time", duration: true },
  { key: "hintUses", label: "Hint Usage" },
  { key: "firstAttemptSuccessRate", comparisonKey: "firstAttemptSuccess", label: "First-Attempt Success", rate: true },
];

const valueOrEmpty = (value, suffix = "") => (
  value == null || !Number.isFinite(Number(value)) ? "Not enough data" : `${value}${suffix}`
);
const shortDate = (value) => {
  if (!value) return "No activity";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No activity" : date.toLocaleDateString();
};
const longDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { dateStyle: "long", timeZone: "UTC" });
};
const trendPeriodLabel = (value, bucket) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown period";
  return date.toLocaleDateString(undefined, bucket === "month"
    ? { month: "short", year: "numeric", timeZone: "UTC" }
    : { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};
const sortRows = (rows, sort) => [...rows].sort((left, right) => {
  const a = left[sort.key]; const b = right[sort.key];
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const result = typeof a === "string" ? a.localeCompare(b, undefined, { sensitivity: "base" }) : Number(a) - Number(b);
  return sort.direction === "asc" ? result : -result;
});

function SortButton({ label, column, sort, onSort }) {
  const active = sort.key === column;
  return <button type="button" className={pgStyles.sortButton} onClick={() => onSort(column)}>{label} {active ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</button>;
}

function MetricCard({ icon, label, value, formula }) {
  return <div className={pgStyles.metricCard} title={formula || undefined}>
    <div className={pgStyles.metricIcon}>{icon}</div>
    <div><div className={pgStyles.metricLabel}>{label}</div><div className={pgStyles.metricValue}>{value}</div></div>
  </div>;
}

function DistributionBars({ rows, emptyText = "No recorded data for this selection." }) {
  const maximum = Math.max(0, ...rows.map((row) => Number(row.count) || 0));
  if (!rows.length || maximum === 0) return <div className={styles.emptyText}>{emptyText}</div>;
  return <div className={pgStyles.distribution}>{rows.map((row) => <div className={pgStyles.distributionRow} key={row.key || row.label}>
    <span>{row.label}</span><div className={pgStyles.barTrack} aria-label={`${row.label}: ${row.count}`}><div className={pgStyles.barFill} style={{ width: `${(row.count / maximum) * 100}%` }} /></div><strong>{row.count}</strong>
  </div>)}</div>;
}

function LearningTrends({ historical }) {
  const [selectedMetric, setSelectedMetric] = useState("attempts");
  const metric = TREND_METRICS.find((item) => item.key === selectedMetric) || TREND_METRICS[0];
  const series = Array.isArray(historical?.series) ? historical.series : [];
  const failures = Array.isArray(historical?.failures) ? historical.failures : [];
  const metricValues = series.map((row) => normalizeTrendValue(row[metric.key])).filter((value) => value !== null);
  const maximum = Math.max(0, ...metricValues);
  const trackingDate = longDate(historical?.trackingSince);
  const comparison = historical?.comparison?.metrics?.[metric.comparisonKey || metric.key] || null;
  const comparisonText = formatComparison(comparison, metric);

  return <section className={`${styles.card} ${pgStyles.trendsCard}`}>
    <div className={pgStyles.trendsHeader}>
      <div>
        <div className={styles.sectionTitle}>Learning Trends</div>
        <div className={styles.sectionSub}>Actual recorded learning events, separate from cumulative current-state metrics.</div>
      </div>
      <div className={pgStyles.trendMetricPicker} role="group" aria-label="Learning trend metric">
        {TREND_METRICS.map((item) => <button
          type="button"
          key={item.key}
          aria-pressed={selectedMetric === item.key}
          onClick={() => setSelectedMetric(item.key)}
        >{item.label}</button>)}
      </div>
    </div>

    <div className={pgStyles.trendMetricTitle}>{metric.label}</div>

    {historical?.comparison && comparisonText && <div className={pgStyles.comparison} aria-label={`${metric.label} period comparison`}>
      <span>Selected period<strong>{comparisonText.current}</strong></span>
      <span>Previous equal period<strong>{comparisonText.previous}</strong></span>
      <span>Change<strong>{comparisonText.change}</strong></span>
      {comparisonText.detail && <p>{comparisonText.detail}</p>}
    </div>}
    {!historical?.comparison && <div className={pgStyles.comparisonNote}>Choose a bounded 7-day, 30-day, or custom range to compare it with the immediately preceding equal period.</div>}

    {!historical?.hasData || !series.length ? <>
      <div className={styles.emptyText}>{trackingDate
        ? `No historical activity has been recorded for this scope and period. Event tracking is available from ${trackingDate} onward.`
        : "No historical activity has been recorded for this scope."}</div>
    </> : <>
      <div className={pgStyles.trendAvailability}>Historical activity is available from {trackingDate || "the first recorded event"} onward. Periods before tracking began are not backfilled.</div>
      <div className={pgStyles.trendChart} aria-label={`${metric.label} over time`}>
        {series.map((row) => {
          const rawValue = row[metric.key];
          const value = normalizeTrendValue(rawValue);
          const period = trendPeriodLabel(row.periodStart, historical.bucket);
          return <div className={pgStyles.trendRow} key={`${row.periodStart}-${metric.key}`}>
            <span className={pgStyles.trendPeriod}>{period}</span>
            <div className={pgStyles.trendBarTrack} aria-hidden="true">
              <div className={pgStyles.trendBarFill} style={{ width: value != null && maximum > 0 ? `${(value / maximum) * 100}%` : "0%" }} />
            </div>
            <strong aria-label={`${period}: ${formatTrendValue(metric, value, { exact: true })}`}>{formatTrendValue(metric, value)}</strong>
          </div>;
        })}
      </div>
      {selectedMetric === "failedAttempts" && <div className={pgStyles.trendFailures}>
        <div><strong>Recorded failure categories</strong><span>Actual failed submissions in this filter window</span></div>
        {!failures.length
          ? <span className={styles.emptyText}>No recorded failures for this period.</span>
          : failures.map((failure) => <span className={pgStyles.trendFailureItem} key={failure.category}><b>{failure.label}</b><strong>{failure.count}</strong></span>)}
      </div>}
    </>}
  </section>;
}

function LearningFunnel({ lesson }) {
  const funnel = lesson.funnel || {};
  const stages = [
    { key: "applicable", label: "Applicable", count: funnel.applicable, rate: null },
    { key: "started", label: "Started", count: funnel.started, rate: funnel.startedRate },
    { key: "attempted", label: "Attempted", count: funnel.attempted, rate: funnel.attemptedRate },
    { key: "completed", label: "Completed", count: funnel.completed, rate: funnel.completionRate },
  ];
  return <article className={pgStyles.funnelCard}>
    <div className={pgStyles.funnelTitle} title={lesson.title}>{lesson.title}</div>
    <div className={pgStyles.funnelStages} aria-label={`${lesson.title} learning funnel`}>
      {stages.map((stage, index) => <Fragment key={stage.key}>
        {index > 0 && <span className={pgStyles.funnelArrow} aria-hidden="true">→</span>}
        <div className={pgStyles.funnelStage}>
          <span>{stage.label}</span>
          <strong>{stage.count ?? 0}</strong>
          <small>{stage.rate == null ? (stage.key === "applicable" ? "students" : "Not enough data") : `${stage.rate}% of applicable`}</small>
        </div>
      </Fragment>)}
    </div>
    {(funnel.applicable ?? 0) === 0
      ? <div className={pgStyles.funnelNote}>No applicable students in this scope.</div>
      : <div className={pgStyles.funnelNote}>Attempted from started: {valueOrEmpty(funnel.attemptedFromStarted, "%")} · Completed from attempted: {valueOrEmpty(funnel.completedFromAttempted, "%")}</div>}
  </article>;
}

function FailurePatternGroup({ group, completed = false }) {
  if (!group?.categories?.length) {
    return <div className={styles.emptyText}>{completed ? "No completed outcomes retain a failure signal in this selection." : "No unresolved latest failure signals match this selection."}</div>;
  }
  return <div className={pgStyles.failureList}>{group.categories.map((category) => <details className={pgStyles.failureItem} key={category.category}>
    <summary>
      <span><strong>{category.label}</strong><small>{category.affectedStudents} affected student{category.affectedStudents === 1 ? "" : "s"} · {category.affectedLevels} level{category.affectedLevels === 1 ? "" : "s"}</small></span>
      <span className={pgStyles.failureLatest}>{shortDate(category.latestOccurrence)}</span>
    </summary>
    {category.mostAffected && <div className={pgStyles.failureMostAffected}>Most affected: {category.mostAffected.lessonTitle} · {category.mostAffected.title} ({category.mostAffected.affectedStudents} student{category.mostAffected.affectedStudents === 1 ? "" : "s"})</div>}
    <div className={pgStyles.failureBreakdown}>
      <div><h4>Affected levels</h4>{category.levels.map((level) => <span key={level.levelKey}>{level.lessonTitle} · {level.title}<b>{level.affectedStudents}</b></span>)}</div>
      <div><h4>Latest recorded codes</h4>{category.codes.map((code) => <span key={code.code} title={code.code}>{code.label}<b>{code.affectedStudents}</b></span>)}</div>
    </div>
  </details>)}</div>;
}

function LevelPerformance({ lesson }) {
  const levels = lesson.levels || [];
  if (!levels.length) return <div className={pgStyles.levelEmpty}>No levels are available to students in this scope.</div>;
  return <div className={pgStyles.levelTableWrap}><table className={pgStyles.levelTable}>
    <thead><tr><th scope="col">Level</th><th scope="col">Applicable</th><th scope="col">Started</th><th scope="col">Attempted</th><th scope="col">Completed</th><th scope="col">Start rate</th><th scope="col">Attempt rate</th><th scope="col">Completion</th><th scope="col">Avg score</th><th scope="col">Avg attempts</th><th scope="col">Failed attempts</th><th scope="col">Active time</th><th scope="col">Hint use</th><th scope="col">Hint users</th><th scope="col">First-attempt success</th><th scope="col">Difficulty</th><th scope="col">Current failure signals</th></tr></thead>
    <tbody>{levels.map((level) => <tr key={level.levelKey}>
      <td><strong>{level.title}</strong><small>{level.levelKey}</small></td>
      <td>{level.applicableStudents}</td><td>{level.studentsStarted}</td><td>{level.studentsAttempted}</td><td>{level.studentsCompleted}</td>
      <td>{valueOrEmpty(level.startRate, "%")}</td><td>{valueOrEmpty(level.attemptRate, "%")}</td><td>{valueOrEmpty(level.completionRate, "%")}</td>
      <td>{valueOrEmpty(level.averageScore, "%")}</td><td>{valueOrEmpty(level.averageAttempts)}</td><td>{valueOrEmpty(level.averageFailedAttempts)} avg · {level.totalFailedAttempts} total</td>
      <td>{level.averageActiveTimeLabel || "Not enough data"}</td><td>{valueOrEmpty(level.hintUsageRate, "%")}</td><td>{level.basicHintUsers} basic · {level.purchasedHintUsers} purchased</td>
      <td>{valueOrEmpty(level.firstAttemptSuccessRate, "%")}</td>
      <td>{level.difficulty?.sufficientData ? <span className={`${pgStyles.difficulty} ${pgStyles[`difficulty${level.difficulty.label}`]}`}>{level.difficulty.label}<small>{level.difficulty.score}/100</small></span> : "Not enough data"}</td>
      <td>{level.failurePatterns?.unresolvedAffectedStudents ? `${level.failurePatterns.unresolvedAffectedStudents} unresolved` : "No unresolved signal"}{level.failurePatterns?.completedAfterFailureStudents ? <small className={pgStyles.retainedSignal}>{level.failurePatterns.completedAfterFailureStudents} completed afterward</small> : null}</td>
    </tr>)}</tbody>
  </table></div>;
}

function TeacherAnalyticsPage() {
  const [data, setData] = useState(() => createEmptyAnalyticsData());
  const [loadedQuery, setLoadedQuery] = useState("");
  const [filters, setFilters] = useState(() => resetAnalyticsFilters());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState("");
  const [viewMode, setViewMode] = useState("dashboard");
  const [lessonSort, setLessonSort] = useState({ key: "title", direction: "asc" });
  const [studentSort, setStudentSort] = useState({ key: "name", direction: "asc" });
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedLessons, setExpandedLessons] = useState(() => new Set());
  const closeDrawerRef = useRef(null);
  const drawerLauncherRef = useRef(null);

  const queryString = useMemo(() => buildAnalyticsQuery(filters), [filters]);

  useEffect(() => {
    if (filters.datePreset === "custom" && (!filters.startDate || !filters.endDate)) {
      setData(createEmptyAnalyticsData());
      setLoadedQuery("");
      setError("Choose both From and To dates to load this custom range.");
      setIsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    (async () => {
      setIsLoading(true); setError("");
      try {
        const response = await axios.get(buildApiUrl(`/api/teacher/analytics?${queryString}`), { headers: getAuthHeaders(), signal: controller.signal });
        setData(response.data || createEmptyAnalyticsData());
        setLoadedQuery(queryString);
      } catch (requestError) {
        if (requestError.code !== "ERR_CANCELED") {
          setData(createEmptyAnalyticsData());
          setLoadedQuery("");
          setError(requestError.response?.data?.message || "Analytics could not be loaded.");
        }
      } finally { if (!controller.signal.aborted) setIsLoading(false); }
    })();
    return () => controller.abort();
  }, [queryString, filters.datePreset, filters.startDate, filters.endDate]);

  useEffect(() => {
    if (!filters.lessonId.startsWith("curriculum:")) return;
    setExpandedLessons((current) => new Set(current).add(filters.lessonId));
  }, [filters.lessonId]);

  const changeSort = (setter) => (key) => setter((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const lessonRows = useMemo(() => sortRows(data.lessonPerformance || [], lessonSort), [data.lessonPerformance, lessonSort]);
  const curriculumFunnels = useMemo(
    () => (data.lessonPerformance || []).filter((lesson) => lesson.source === "curriculum"),
    [data.lessonPerformance],
  );
  const studentRows = useMemo(() => {
    const needle = studentSearch.trim().toLowerCase();
    const rows = needle ? (data.studentPerformance || []).filter((student) => `${student.name} ${student.username}`.toLowerCase().includes(needle)) : (data.studentPerformance || []);
    return sortRows(rows, studentSort);
  }, [data.studentPerformance, studentSearch, studentSort]);

  const openStudent = async (student, launcher = null) => {
    drawerLauncherRef.current = launcher;
    setSelectedStudent(student); setStudentDetail(null); setDetailLoading(true);
    try {
      const response = await axios.get(buildApiUrl(`/api/teacher/analytics/students/${student.studentId}?${queryString}`), { headers: getAuthHeaders() });
      setStudentDetail(response.data);
    } catch (requestError) { setStudentDetail({ error: requestError.response?.data?.message || "Student details could not be loaded." }); }
    finally { setDetailLoading(false); }
  };

  const closeStudent = useCallback(() => {
    setSelectedStudent(null);
    setStudentDetail(null);
    requestAnimationFrame(() => drawerLauncherRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!selectedStudent) return undefined;
    closeDrawerRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeStudent();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedStudent, closeStudent]);

  const toggleLesson = (lessonId) => setExpandedLessons((current) => {
    const next = new Set(current);
    if (next.has(lessonId)) next.delete(lessonId); else next.add(lessonId);
    return next;
  });

  const overview = data.overview || {}; const formulas = data.meta?.formulas || {};
  const difficult = data.highlights?.mostDifficultLesson; const completed = data.highlights?.mostCompletedLesson;
  const heatmapLessons = data.heatmap?.lessons || [];
  const dataMatchesFilters = loadedQuery === queryString && Boolean(data.meta?.generatedAt);
  const showLoading = isLoading || (!error && !dataMatchesFilters);
  const reportAvailable = dataMatchesFilters && !isLoading && !error;
  const classroomLabel = filters.classroomId === "all" ? "All active classrooms" : (data.filters?.classrooms || []).find((item) => String(item.id) === filters.classroomId)?.name || `Classroom ${filters.classroomId}`;
  const studentLabel = filters.studentId === "all" ? "All students" : (data.filters?.students || []).find((item) => String(item.id) === filters.studentId)?.name || `Student ${filters.studentId}`;
  const lessonLabel = filters.lessonId === "all" ? "All lessons" : (data.filters?.lessons || []).find((item) => item.id === filters.lessonId)?.title || filters.lessonId;
  const dateLabel = filters.datePreset === "custom" ? `${filters.startDate || "?"} to ${filters.endDate || "?"}` : filters.datePreset === "7d" ? "Last 7 days" : filters.datePreset === "30d" ? "Last 30 days" : "All time";
  const filterContext = `${classroomLabel} · ${studentLabel} · ${lessonLabel} · ${dateLabel}`;

  const exportCsv = async (kind) => {
    setExportError("");
    setExporting(kind);
    try {
      await downloadAnalyticsCsv({
        kind,
        queryString,
        request: (path, options) => axios.get(buildApiUrl(path), options),
        headers: getAuthHeaders(),
        createObjectUrl: (blob) => URL.createObjectURL(blob),
        revokeObjectUrl: (url) => URL.revokeObjectURL(url),
        documentRef: document,
      });
    } catch (requestError) {
      setExportError(requestError.response?.data?.message || "The analytics CSV could not be exported.");
    } finally {
      setExporting("");
    }
  };

  const printReport = () => {
    if (!reportAvailable) return;
    setViewMode("report");
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  return <div className={`${styles.root} ${pgStyles.analyticsRoot}`}>
    <Sidebar />
    <main className={`${styles.main} ${pgStyles.analyticsMain}`}>
      <header className={`${styles.pageHeader} ${pgStyles.analyticsHeader}`}><div><div className={styles.pageTitle}>Analytics</div><div className={pgStyles.pageSubtitle}>Classroom learning evidence and progress</div></div><div className={`${styles.pageActions} ${pgStyles.interactiveOnly}`}>
        <div className={pgStyles.viewToggle} role="group" aria-label="Analytics view">
          <button type="button" aria-pressed={viewMode === "dashboard"} onClick={() => setViewMode("dashboard")}>Dashboard</button>
          <button type="button" aria-pressed={viewMode === "report"} disabled={!reportAvailable} onClick={() => setViewMode("report")}><FiFileText aria-hidden="true" /> Report</button>
        </div>
        <button type="button" className={styles.btnOutline} disabled={!reportAvailable} onClick={printReport}><FiPrinter aria-hidden="true" /> Print report</button>
      </div></header>
      <div className={`${styles.body} ${pgStyles.analyticsBody}`} aria-busy={isLoading}>
        <section className={`${styles.card} ${pgStyles.filters}`} aria-label="Analytics filters">
          <label>Classroom<select value={filters.classroomId} onChange={(event) => setFilters((current) => ({ ...current, classroomId: event.target.value, studentId: "all", lessonId: "all" }))}><option value="all">All active classrooms</option>{(data.filters?.classrooms || []).map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name} · {classroom.section}</option>)}</select></label>
          <label>Student<select value={filters.studentId} onChange={(event) => setFilters((current) => ({ ...current, studentId: event.target.value }))}><option value="all">All students</option>{(data.filters?.students || []).map((student) => <option key={student.id} value={student.id}>{student.name} (@{student.username})</option>)}</select></label>
          <label>Date<select value={filters.datePreset} onChange={(event) => setFilters((current) => ({ ...current, datePreset: event.target.value }))}><option value="all">All time</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="custom">Custom range</option></select></label>
          {filters.datePreset === "custom" && <><label>From<input type="date" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} /></label><label>To<input type="date" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} /></label></>}
          <label>Lesson<select value={filters.lessonId} onChange={(event) => setFilters((current) => ({ ...current, lessonId: event.target.value }))}><option value="all">All lessons</option>{(data.filters?.lessons || []).map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label>
          <button type="button" className={styles.btnOutline} onClick={() => { setFilters(resetAnalyticsFilters()); setStudentSearch(""); }} disabled={isLoading}>Clear filters</button>
          {isLoading && <span className={pgStyles.loadingBadge}>Updating…</span>}
          <div className={pgStyles.activeFilters} aria-label="Active analytics filters"><strong>Current scope</strong><span>{filterContext}</span></div>
          <div className={`${pgStyles.exportActions} ${pgStyles.interactiveOnly}`}>
            <button type="button" className={styles.btnOutline} disabled={Boolean(exporting) || !reportAvailable} onClick={() => exportCsv("students")}><FiDownload aria-hidden="true" /> {exporting === "students" ? "Exporting…" : "Student CSV"}</button>
            <button type="button" className={styles.btnOutline} disabled={Boolean(exporting) || !reportAvailable} onClick={() => exportCsv("lessons")}><FiDownload aria-hidden="true" /> {exporting === "lessons" ? "Exporting…" : "Lesson CSV"}</button>
          </div>
        </section>

        {error && <div className={pgStyles.errorBanner} role="alert"><FiAlertCircle /> <span>{error}</span></div>}
        {exportError && <div className={pgStyles.errorBanner} role="alert"><FiAlertCircle /> <span>{exportError}</span></div>}
        {showLoading ? <section className={styles.card} role="status"><div className={styles.loadingText}>Loading classroom analytics…</div></section> : viewMode === "report" && reportAvailable ? <TeacherAnalyticsReport data={data} filterContext={filterContext} /> : viewMode === "report" ? <section className={styles.card}><div className={styles.emptyText}>The report is unavailable until analytics load successfully for the current filters.</div></section> : <>
        <section className={pgStyles.kpiGrid} aria-label="Analytics overview">
          <MetricCard icon={<FiUsers aria-hidden="true" />} label="Total Students" value={overview.totalStudents ?? 0} formula={formulas.totalStudents} />
          <MetricCard icon={<FiTarget aria-hidden="true" />} label="Average Progress" value={valueOrEmpty(overview.averageProgress, "%")} formula={formulas.averageProgress} />
          <MetricCard icon={<FiCheckCircle aria-hidden="true" />} label="Completion Rate" value={valueOrEmpty(overview.completionRate, "%")} formula={formulas.completionRate} />
          <MetricCard icon={<FiBarChart2 aria-hidden="true" />} label="Average Score" value={valueOrEmpty(overview.averageScore, "%")} formula={formulas.averageScore} />
          <MetricCard icon={<FiActivity aria-hidden="true" />} label="Average Attempts" value={valueOrEmpty(overview.averageAttempts)} formula={formulas.averageAttempts} />
          <MetricCard icon={<FiClock aria-hidden="true" />} label="Average Active Time" value={overview.averageActiveTimeLabel || "Not enough data"} formula={formulas.averageActiveTime} />
          <MetricCard icon={<FiAlertCircle aria-hidden="true" />} label="Needs Attention" value={overview.studentsNeedingAttention ?? 0} formula={formulas.studentsNeedingAttention} />
          <MetricCard icon={<FiHelpCircle aria-hidden="true" />} label="Hint Usage Rate" value={valueOrEmpty(overview.hintUsageRate, "%")} formula={formulas.hintUsageRate} />
        </section>

        <section className={pgStyles.highlights}>
          <div className={styles.card}><div className={pgStyles.highlightTitle}><FiBookOpen /> Most completed lesson</div><strong>{completed?.title || "Not enough data"}</strong>{completed && <span>{valueOrEmpty(completed.completionRate, "%")} completion among starters</span>}</div>
          <div className={styles.card}><div className={pgStyles.highlightTitle}><FiAlertCircle /> Most difficult lesson</div><strong>{difficult?.title || "Not enough data"}</strong>{difficult && <span>{difficult.label} · {valueOrEmpty(difficult.averageAttempts)} avg attempts · {valueOrEmpty(difficult.completionRate, "%")} completion · {valueOrEmpty(difficult.hintUsageRate, "%")} hint use</span>}</div>
        </section>

        <LearningTrends historical={data.historical} />

        <section className={styles.card}>
          <div className={styles.sectionHead}><div><div className={styles.sectionTitle}>Learning Funnel</div><div className={styles.sectionSub}>Applicable students may start without submitting; an actual failed or successful solution marks attempted.</div></div></div>
          {!curriculumFunnels.length ? <div className={styles.emptyText}>Learning funnels are available for game curriculum lessons.</div> : <div className={pgStyles.funnelGrid}>{curriculumFunnels.map((lesson) => <LearningFunnel key={lesson.id} lesson={lesson} />)}</div>}
        </section>

        <section className={styles.card}>
          <div className={styles.sectionHead}><div><div className={styles.sectionTitle}>Lesson Performance</div><div className={styles.sectionSub}>Expand a game curriculum lesson for applicable level evidence. Unavailable tracking is shown explicitly.</div></div></div>
          <div className={styles.tableWrap}><table className={`${styles.table} ${pgStyles.wideTable}`}><thead><tr>
            <th scope="col"><SortButton label="Lesson" column="title" sort={lessonSort} onSort={changeSort(setLessonSort)} /></th><th scope="col"><SortButton label="Completion" column="completionRate" sort={lessonSort} onSort={changeSort(setLessonSort)} /></th><th scope="col"><SortButton label="Started" column="studentsStarted" sort={lessonSort} onSort={changeSort(setLessonSort)} /></th><th scope="col">Completed</th><th scope="col">Avg score</th><th scope="col">Avg attempts</th><th scope="col">Failed attempts</th><th scope="col">Active time</th><th scope="col">Hint use</th><th scope="col">Difficulty</th>
          </tr></thead><tbody>{!lessonRows.length ? <tr><td colSpan="10" className={styles.emptyRow}>No lesson activity matches these filters.</td></tr> : lessonRows.map((lesson) => {
            const unavailable = lesson.available === false;
            const supportsLevels = lesson.source === "curriculum";
            const expanded = supportsLevels && expandedLessons.has(lesson.id);
            const detailId = `level-performance-${lesson.lessonKey}`;
            return <Fragment key={lesson.id}><tr>
              <td><div className={pgStyles.lessonTitleCell}>{supportsLevels && <button type="button" className={pgStyles.expandButton} onClick={() => toggleLesson(lesson.id)} aria-expanded={expanded} aria-controls={detailId} aria-label={`${expanded ? "Collapse" : "Expand"} level performance for ${lesson.title}`}>{expanded ? <FiChevronDown /> : <FiChevronRight />}</button>}<span><strong>{lesson.title}</strong><small className={pgStyles.sourceLabel}>{unavailable ? "Unavailable for this scope" : supportsLevels ? "Game curriculum · Level details available" : "Classroom lesson"}</small></span></div></td>
              <td>{unavailable ? "Unavailable" : valueOrEmpty(lesson.completionRate, "%")}</td><td>{unavailable ? "—" : lesson.studentsStarted}</td><td>{unavailable ? "—" : lesson.studentsCompleted}</td><td>{unavailable ? "Unavailable" : valueOrEmpty(lesson.averageScore, "%")}</td><td>{unavailable ? "Unavailable" : valueOrEmpty(lesson.averageAttempts)}</td><td>{unavailable ? "Unavailable" : valueOrEmpty(lesson.averageFailedAttempts)}</td><td>{unavailable ? "Unavailable" : lesson.averageActiveTimeLabel || "Unavailable"}</td><td>{unavailable ? "Unavailable" : lesson.tracking?.hints ? valueOrEmpty(lesson.hintUsageRate, "%") : "Unavailable"}</td><td>{unavailable ? "Unavailable" : lesson.difficulty?.sufficientData ? <span className={`${pgStyles.difficulty} ${pgStyles[`difficulty${lesson.difficulty.label}`]}`}>{lesson.difficulty.label}<small>{lesson.difficulty.score}/100</small></span> : "Not enough data"}</td>
            </tr>{expanded && <tr id={detailId} className={pgStyles.levelDetailRow}><td colSpan="10"><div className={pgStyles.levelDetailHeading}><strong>Level Performance</strong><span>Completion uses starters; start and attempt rates use applicable students.</span></div><LevelPerformance lesson={lesson} /></td></tr>}</Fragment>;
          })}</tbody></table></div>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionHead}><div><div className={styles.sectionTitle}>Current Failure Patterns</div><div className={styles.sectionSub}>Latest recorded signal per applicable student and level, not historical error totals.</div></div></div>
          <div className={pgStyles.failureColumns}>
            <div><div className={pgStyles.failureGroupTitle}><strong>Unresolved latest signals</strong><span>{data.failurePatterns?.unresolved?.affectedStudents ?? 0} affected students · {data.failurePatterns?.unresolved?.signalCount ?? 0} level signals</span></div><FailurePatternGroup group={data.failurePatterns?.unresolved} /></div>
            <div><div className={pgStyles.failureGroupTitle}><strong>Completed after latest failure</strong><span>Retained pre-success signals, shown separately</span></div><FailurePatternGroup group={data.failurePatterns?.completedAfterFailure} completed /></div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionHead}><div><div className={styles.sectionTitle}>Student × Lesson Heatmap</div><div className={styles.sectionSub}>Labels and tooltips accompany every color state.</div></div></div>
          <div className={pgStyles.legend} aria-label="Heatmap legend">{[["unavailable", "Unavailable"], ["not_started", "Not started"], ["healthy", "Healthy"], ["moderate", "Moderate difficulty"], ["high", "High difficulty"], ["completed", "Completed"]].map(([key, label]) => <span key={key}><i className={pgStyles[`heat_${key}`]} />{label}</span>)}</div>
          {!heatmapLessons.length || !(data.heatmap?.students || []).length ? <div className={styles.emptyText}>No student lesson activity to display.</div> : <div className={pgStyles.heatmapWrap}><table className={pgStyles.heatmapTable}><thead><tr><th scope="col">Student</th>{heatmapLessons.map((lesson) => <th scope="col" key={lesson.id} title={lesson.title}>{lesson.title}</th>)}</tr></thead><tbody>{data.heatmap.students.map((student) => <tr key={student.studentId}><th scope="row">{student.name}</th>{heatmapLessons.map((lesson) => { const cell = student.cells.find((item) => item.lessonId === lesson.id) || { key: "not_started", label: "Not started" }; return <td key={lesson.id}><span className={`${pgStyles.heatCell} ${pgStyles[`heat_${cell.key}`]}`} title={`${student.name} · ${lesson.title}: ${cell.label}${cell.failedAttempts != null ? `, ${cell.failedAttempts} failed attempts` : ""}`} aria-label={`${student.name}, ${lesson.title}: ${cell.label}`}>{cell.key === "unavailable" ? "N/A" : cell.key === "completed" ? "✓" : cell.key === "high" ? "!" : cell.key === "moderate" ? "•" : cell.key === "healthy" ? "↗" : "—"}</span></td>; })}</tr>)}</tbody></table></div>}
        </section>

        <section className={styles.card}><div className={styles.sectionTitle}>Students Needing Attention</div><div className={pgStyles.attentionList}>{!(data.attention || []).length ? <div className={styles.emptyText}>No students match the current attention rules.</div> : data.attention.map((student) => <button type="button" key={student.studentId} onClick={(event) => openStudent(student, event.currentTarget)} className={pgStyles.attentionItem}><FiAlertCircle /><span><strong>{student.name}</strong><small>{student.attentionReasons.join(" ")}</small></span><b>Review</b></button>)}</div></section>

        <section className={styles.card}>
          <div className={pgStyles.studentHeader}><div><div className={styles.sectionTitle}>Student Performance</div><div className={styles.sectionSub}>Select a student for lesson-level details.</div></div><label className={pgStyles.search}><FiSearch /><span className={pgStyles.srOnly}>Search students</span><input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Search students" /></label></div>
          <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col"><SortButton label="Student" column="name" sort={studentSort} onSort={changeSort(setStudentSort)} /></th><th scope="col"><SortButton label="Progress" column="progress" sort={studentSort} onSort={changeSort(setStudentSort)} /></th><th scope="col">Avg score</th><th scope="col">Avg attempts</th><th scope="col">Active time</th><th scope="col">Completed lessons</th><th scope="col">Last activity</th><th scope="col">Status</th></tr></thead><tbody>{!studentRows.length ? <tr><td colSpan="8" className={styles.emptyRow}>No students match this selection.</td></tr> : studentRows.map((student) => <tr key={student.studentId}><th scope="row"><button type="button" className={pgStyles.studentButton} onClick={(event) => openStudent(student, event.currentTarget)}><strong>{student.name}</strong><small className={pgStyles.sourceLabel}>@{student.username}</small></button></th><td>{valueOrEmpty(student.progress, "%")}</td><td>{valueOrEmpty(student.averageScore, "%")}</td><td>{valueOrEmpty(student.averageAttempts)}</td><td>{student.activeTimeLabel || "Not enough data"}</td><td>{student.completedLessons ?? 0}</td><td>{shortDate(student.lastActivityAt)}</td><td><span className={`${pgStyles.status} ${pgStyles[`status_${student.status}`]}`}>{student.statusLabel}</span></td></tr>)}</tbody></table></div>
        </section>

        <div className={pgStyles.analyticsGrid}>
          <section className={styles.card}><div className={styles.sectionTitle}>Score Distribution</div><DistributionBars rows={data.scoresAndAttempts?.scoreDistribution || []} /></section>
          <section className={styles.card}><div className={styles.sectionTitle}>Attempt Distribution</div><DistributionBars rows={data.scoresAndAttempts?.attemptDistribution || []} /><div className={pgStyles.inlineStats}><span>First-attempt success<strong>{valueOrEmpty(data.scoresAndAttempts?.firstAttemptSuccessRate, "%")}</strong></span><span>Attempts before completion<strong>{valueOrEmpty(data.scoresAndAttempts?.averageAttemptsBeforeCompletion)}</strong></span></div></section>
        </div>

        <div className={pgStyles.analyticsGrid}>
          <section className={styles.card}><div className={styles.sectionTitle}>Hint Analytics</div><div className={pgStyles.inlineStats}><span>Basic hint users<strong>{data.hints?.basicHintUsers ?? 0}</strong></span><span>Purchased hint users<strong>{data.hints?.purchasedHintUsers ?? 0}</strong></span><span>Attempts before hint<strong>{valueOrEmpty(data.hints?.averageAttemptsBeforeHint)}</strong></span><span>Completion after hint<strong>{valueOrEmpty(data.hints?.completionAfterHintRate, "%")}</strong></span></div><div className={pgStyles.compactList}>{(data.hints?.byLesson || []).map((lesson) => <div key={lesson.lessonId}><span>{lesson.title}</span><strong>{valueOrEmpty(lesson.hintUsageRate, "%")}</strong></div>)}</div></section>
          <section className={styles.card}><div className={styles.sectionTitle}>Learning Activity</div>{!(data.activity?.byDay || []).length ? <div className={styles.emptyText}>No dated activity matches this selection.</div> : <div className={pgStyles.compactList}>{data.activity.byDay.map((day) => <div key={day.date}><span>{shortDate(day.date)}</span><strong>{day.activeStudents} active · {day.completions} completions</strong></div>)}</div>}{(data.activity?.unavailableMetrics || []).length > 0 && <div className={pgStyles.trackingNote}><FiAlertCircle /> {data.activity.unavailableMetrics.join("; ")}.</div>}</section>
        </div>

        {(data.meta?.limitations || []).length > 0 && <details className={pgStyles.notes}><summary>Data definitions and limitations</summary><p>{formulas.dateFilter}</p><p>{formulas.difficulty}</p><ul>{data.meta.limitations.map((item) => <li key={item}>{item}</li>)}</ul></details>}
        </>}
      </div>
    </main>

    {selectedStudent && <div className={pgStyles.drawerBackdrop} onMouseDown={closeStudent}><aside className={pgStyles.drawer} aria-modal="true" role="dialog" aria-labelledby="student-analytics-title" onMouseDown={(event) => event.stopPropagation()}><div className={pgStyles.drawerHeader}><div><h2 id="student-analytics-title">{selectedStudent.name}</h2><span>{selectedStudent.statusLabel}</span></div><button ref={closeDrawerRef} type="button" onClick={closeStudent} aria-label="Close student details"><FiX /></button></div>{detailLoading ? <div className={styles.loadingText} role="status">Loading student details…</div> : studentDetail?.error ? <div className={styles.errorText} role="alert">{studentDetail.error}</div> : studentDetail && <>
      {studentDetail.student.attentionReasons?.length > 0 && <div className={pgStyles.drawerAlert}><strong>Reasons to check in</strong>{studentDetail.student.attentionReasons.map((reason) => <span key={reason}>{reason}</span>)}</div>}
      <div className={pgStyles.drawerStats}><span>Progress<strong>{valueOrEmpty(studentDetail.student.progress, "%")}</strong></span><span>Average score<strong>{valueOrEmpty(studentDetail.student.averageScore, "%")}</strong></span><span>Average attempts<strong>{valueOrEmpty(studentDetail.student.averageAttempts)}</strong></span><span>Failed attempts<strong>{valueOrEmpty(studentDetail.student.failedAttempts)}</strong></span><span>Active time<strong>{studentDetail.student.activeTimeLabel || "Not enough data"}</strong></span><span>Hint usage<strong>{studentDetail.student.hintUsageCount == null ? "N/A" : `${studentDetail.student.hintUsageCount} lessons`}</strong></span><span>Latest activity<strong>{shortDate(studentDetail.student.lastActivityAt)}</strong></span></div>
      <h3>Historical activity</h3>{studentDetail.historical?.hasData ? <div className={pgStyles.drawerStats}><span>Attempts<strong>{studentDetail.historical.totals?.attempts ?? 0}</strong></span><span>Completions<strong>{studentDetail.historical.totals?.completions ?? 0}</strong></span><span>Recorded failures<strong>{studentDetail.historical.totals?.failedAttempts ?? 0}</strong></span><span>Active time<strong>{formatTrendValue({ duration: true }, studentDetail.historical.totals?.activeSeconds ?? 0)}</strong></span></div> : <div className={styles.emptyText}>No historical activity has been recorded for this student and period.</div>}
      <h3>Lesson and level progress</h3><div className={pgStyles.drawerLessons}>{(studentDetail.details?.lessons || []).map((lesson) => <details className={pgStyles.drawerLesson} key={lesson.id}><summary><span><strong>{lesson.title}</strong><small>{lesson.status}</small></span><b>{lesson.progress == null ? "N/A" : `${lesson.progress}%`}</b></summary><div className={pgStyles.drawerLessonStats}><span>Score<strong>{valueOrEmpty(lesson.score, "%")}</strong></span><span>Attempts<strong>{valueOrEmpty(lesson.attempts)}</strong></span><span>Failed<strong>{valueOrEmpty(lesson.failedAttempts)}</strong></span><span>Active time<strong>{lesson.activeTimeLabel || "N/A"}</strong></span><span>Hint use<strong>{lesson.hintUsed == null ? "N/A" : lesson.hintUsed ? "Used" : "Not used"}</strong></span><span>Latest activity<strong>{shortDate(lesson.lastActivityAt)}</strong></span></div>{lesson.levels?.length > 0 && <div className={pgStyles.levelList}>{lesson.levels.map((level) => <div key={level.levelKey}><span><strong>{level.title}</strong><small>{level.status} · {level.progress == null ? "Progress N/A" : `${level.progress}% progress`} · {level.attempts == null ? "Attempts N/A" : `${level.attempts} attempts`} · {level.failedAttempts == null ? "Failures N/A" : `${level.failedAttempts} failed`} · {level.hintUsed == null ? "Hint N/A" : level.hintUsed ? "Hint used" : "No hint"}</small></span><b>{level.score == null ? "Score N/A" : `${level.score}%`}</b></div>)}</div>}</details>)}</div>
      <h3>Recent learning activity</h3><div className={pgStyles.lessonDetailList}>{!studentDetail.recentActivity.length ? <div>No recent activity in this window.</div> : studentDetail.recentActivity.map((item) => <div key={`${item.levelKey}-${item.occurredAt}`}><span><strong>{item.lessonTitle}</strong><small>{item.type}</small></span><b>{shortDate(item.occurredAt)}</b></div>)}</div>
    </>}</aside></div>}
  </div>;
}

export default TeacherAnalyticsPage;
