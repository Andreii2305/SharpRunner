import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FiDownload, FiX } from "react-icons/fi";
import {
  createScoreSheetDownloadController,
  getTeacherAssessmentScoreSheet,
  getTeacherAssessmentResults,
  listTeacherAssessments,
  listTeacherClassrooms,
  normalizeTeacherAssessmentError,
  saveTeacherAssessmentScoreSheet,
} from "../../../services/teacherAssessmentService.js";
import {
  ACADEMIC_LESSONS,
  attemptPointsLabel,
  buildAssessmentAnalytics,
  filterAssessmentStudents,
  getAssessmentAnalyticsView,
  summarizeAssessmentAvailability,
} from "./teacherAssessmentAnalyticsState.js";
import styles from "./TeacherAssessmentAnalyticsPanel.module.css";

const emptySlots = () => ({ PRE: { exists: false }, POST: { exists: false } });
const percentage = (value) => value == null ? "Percentage unavailable" : `${value}%`;
const signedPoints = (value) => value == null ? "Unavailable" : `${value > 0 ? "+" : ""}${value} pp`;
const submittedDate = (value) => value ? new Date(value).toLocaleString() : "Unavailable";

function AttemptScore({ attempt }) {
  if (!attempt) return <span>Not submitted</span>;
  return <span className={styles.scoreLine}>
    <strong>{attemptPointsLabel(attempt)}</strong>
    <small>{percentage(attempt.percentage)}</small>
  </span>;
}

export function CodingQuestionBreakdown({ questions }) {
  if (!questions.length) return null;
  return <section className={styles.codingBreakdown} aria-labelledby="coding-question-performance-title">
    <header>
      <div><h3 id="coding-question-performance-title">Coding question performance</h3></div>
      <p>Question-level performance is separate from the official POST grade. PRE results remain diagnostic and do not imply pass or fail.</p>
    </header>
    <div className={styles.codingGrid}>{questions.map((question) => <article key={`${question.assessmentType}-${question.questionId}`}>
      <span>{question.assessmentType === "PRE" ? "PRE diagnostic question" : "POST assessment question"} {question.questionOrder}</span>
      <h4>{question.questionLabel}</h4>
      <dl>
        <div><dt>Submitted responses</dt><dd>{question.responseCount}</dd></div>
        <div><dt>Fully correct</dt><dd>{question.fullyCorrectCount} ({percentage(question.fullyCorrectRate)})</dd></div>
        <div><dt>Average points</dt><dd>{question.averageAwardedPoints} / {question.maximumPoints}</dd></div>
        <div><dt>Average question points earned</dt><dd>{percentage(question.averagePercentageEarned)}</dd></div>
      </dl>
    </article>)}</div>
  </section>;
}

export function AssessmentResultsBoundary({ view, error, onRetry, children }) {
  if (view === "error") return <div className={styles.errorState} role="alert"><span>{error}</span><button type="button" onClick={onRetry}>Retry</button></div>;
  if (view === "select_scope") return <div className={styles.empty}>Select a classroom and lesson to view assessment evidence.</div>;
  if (view === "not_applicable") return <div className={styles.empty}><strong>Assessment not applicable.</strong> This lesson does not use PRE or POST assessments.</div>;
  if (view === "loading") return <div className={styles.empty} role="status">Loading assessment results…</div>;
  return children;
}

export function AssessmentEvidenceSummary({ metrics }) {
  const gainUnavailableReason = metrics.averageLearningGain == null
    ? "Unavailable because no students have both a valid-baseline PRE and a first submitted POST."
    : null;
  return <>
    <div className={styles.summaryGroups} aria-label="Assessment analytics overview">
      <section><h3>Participation</h3><dl>
        <div><dt>PRE submitted</dt><dd>{metrics.preSubmittedStudents}</dd></div>
        <div><dt>POST submitted</dt><dd>{metrics.postSubmittedStudents}</dd></div>
      </dl><p>Distinct students with submitted attempts.</p></section>
      <section><h3>PRE and POST scores</h3><dl>
        <div><dt>All submitted PRE average</dt><dd>{percentage(metrics.averageAllPrePercentage)}<small>{metrics.preSubmittedStudents} submitted diagnostics</small></dd></div>
        <div><dt>Valid baseline PRE average</dt><dd>{percentage(metrics.averageValidBaselinePrePercentage)}<small>{metrics.validBaselineStudents} valid baselines</small></dd></div>
        <div><dt>Average official POST</dt><dd>{percentage(metrics.averageOfficialPostPercentage)}<small>Official results only</small></dd></div>
      </dl></section>
      <section><h3>POST outcomes</h3><dl>
        <div><dt>POST pass rate</dt><dd>{percentage(metrics.postPassRate)}</dd></div>
      </dl><p>{metrics.postPassedStudents == null ? "No passing threshold applies." : `${metrics.postPassedStudents} passed; submitted official results only.`}</p></section>
      <section><h3>Paired learning gain</h3><strong className={styles.gainValue}>{signedPoints(metrics.averageLearningGain)}</strong><p>{metrics.pairedStudents} valid-baseline paired students · PRE to first submitted POST.</p>{gainUnavailableReason && <p>{gainUnavailableReason}</p>}</section>
    </div>
    <details className={styles.comparisonDetails}>
      <summary>Comparison details</summary>
      <div><dl>
        <div><dt>Valid baseline students</dt><dd>{metrics.validBaselineStudents}</dd></div>
        <div><dt>Excluded baseline students</dt><dd>{metrics.excludedBaselineStudents}</dd></div>
        <div><dt>Average submitted POST attempts</dt><dd>{metrics.averagePostAttempts ?? "Unavailable"}</dd></div>
      </dl>
      <p><strong>Learning gain:</strong> Each valid-baseline PRE is compared with that student&apos;s first submitted POST. It is not a comparison between the all-submitted PRE average and official POST grades.</p>
      <p><strong>PRE baseline labels:</strong> Valid baseline; Retroactive — game activity preceded PRE; Unknown — legacy baseline timing.</p>
      <p><strong>Submission rate:</strong> Enrollment denominator unavailable from the assessment-results contract. No enrollment-based rate is inferred.</p></div>
    </details>
  </>;
}

function AttemptHistoryDialog({ row, onClose }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const focusable = [...(dialogRef.current?.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? [])];
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return <div className={styles.backdrop} onMouseDown={onClose}>
    <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="assessment-history-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span>Submitted assessment history</span><h3 id="assessment-history-title">{row.name}</h3></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Close assessment history"><FiX /></button></header>
      <div className={styles.historyList}>{row.history.map((attempt) => <article key={`${attempt.type}-${attempt.attemptId}`}>
        <div><strong>{attempt.type === "PRE" ? `PRE attempt ${attempt.attemptNumber}` : `POST attempt ${attempt.attemptNumber}`}</strong><span>{submittedDate(attempt.submittedAt)}</span></div>
        <div className={styles.historyScore}><AttemptScore attempt={attempt} /><div className={styles.historyLabels}>{attempt.type === "PRE" && <b>{attempt.baselineLabel}</b>}{attempt.type === "POST" && attempt.isFirstSubmittedPost && <b>First POST</b>}{attempt.type === "POST" && attempt.isOfficial && <b>Official grade</b>}{attempt.type === "POST" && attempt.passingRequirementApplicable && <b>{attempt.passingPercentageApplied == null ? "Required threshold unavailable" : `Required: ${attempt.passingPercentageApplied}%`}</b>}{attempt.type === "POST" && attempt.passingRequirementApplicable && typeof attempt.passed === "boolean" && <b>{attempt.passed ? "Passed" : "Not passed"}</b>}</div></div>
      </article>)}</div>
    </section>
  </div>;
}

export default function TeacherAssessmentAnalyticsPanel() {
  const [classrooms, setClassrooms] = useState([]);
  const [classroomId, setClassroomId] = useState("");
  const [lessonKey, setLessonKey] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [slots, setSlots] = useState(emptySlots);
  const [payloads, setPayloads] = useState({ prePayload: null, postPayload: null });
  const [loading, setLoading] = useState(false);
  const [classroomError, setClassroomError] = useState("");
  const [resultsError, setResultsError] = useState("");
  const [resultsErrorScope, setResultsErrorScope] = useState("");
  const [loadedResultsScope, setLoadedResultsScope] = useState("");
  const [classroomRetryVersion, setClassroomRetryVersion] = useState(0);
  const [resultsRetryVersion, setResultsRetryVersion] = useState(0);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [downloadPending, setDownloadPending] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const classroomRequestVersionRef = useRef(0);
  const requestVersionRef = useRef(0);
  const launcherRef = useRef(null);
  const downloadControllerRef = useRef(null);
  const selectedLesson = ACADEMIC_LESSONS.find((lesson) => lesson.key === lessonKey) ?? null;
  const resultsScope = classroomId && lessonKey ? `${classroomId}:${lessonKey}` : "";
  if (!downloadControllerRef.current) {
    downloadControllerRef.current = createScoreSheetDownloadController({
      request: getTeacherAssessmentScoreSheet,
      onReady: saveTeacherAssessmentScoreSheet,
      onPending: setDownloadPending,
      onError: (source) => setDownloadError(normalizeTeacherAssessmentError(source).message),
    });
  }

  useLayoutEffect(() => {
    downloadControllerRef.current.setScope(resultsScope);
    setDownloadError("");
  }, [resultsScope]);
  useEffect(() => () => downloadControllerRef.current?.setScope(""), []);

  useEffect(() => {
    const requestVersion = ++classroomRequestVersionRef.current;
    const controller = new AbortController();
    setClassroomError("");
    listTeacherClassrooms({ signal: controller.signal })
      .then((response) => { if (requestVersion === classroomRequestVersionRef.current) setClassrooms(response.classrooms ?? []); })
      .catch((source) => { if (source?.code !== "ERR_CANCELED" && requestVersion === classroomRequestVersionRef.current) setClassroomError(normalizeTeacherAssessmentError(source).message); });
    return () => controller.abort();
  }, [classroomRetryVersion]);

  useEffect(() => {
    const requestVersion = ++requestVersionRef.current;
    const controller = new AbortController();
    setSlots(emptySlots());
    setPayloads({ prePayload: null, postPayload: null });
    setSelectedStudent(null);
    setResultsError("");
    setResultsErrorScope("");
    setLoadedResultsScope("");
    if (!classroomId || !lessonKey || selectedLesson?.assessmentApplicable === false) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    (async () => {
      try {
        const summary = await listTeacherAssessments({ classroomId, lessonKey, signal: controller.signal });
        if (requestVersion !== requestVersionRef.current) return;
        const nextSlots = summary.assessments ?? emptySlots();
        setSlots(nextSlots);
        const entries = await Promise.all(["PRE", "POST"].map(async (type) => {
          const slot = nextSlots[type];
          if (!slot?.exists || !slot.published) return [type, null];
          return [type, await getTeacherAssessmentResults({ classroomId, assessmentId: slot.id, signal: controller.signal })];
        }));
        if (requestVersion !== requestVersionRef.current) return;
        const resultMap = Object.fromEntries(entries);
        setPayloads({ prePayload: resultMap.PRE, postPayload: resultMap.POST });
        setLoadedResultsScope(resultsScope);
      } catch (source) {
        if (source?.code !== "ERR_CANCELED" && requestVersion === requestVersionRef.current) {
          setResultsError(normalizeTeacherAssessmentError(source).message);
          setResultsErrorScope(resultsScope);
        }
      } finally {
        if (requestVersion === requestVersionRef.current) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [classroomId, lessonKey, selectedLesson?.assessmentApplicable, resultsRetryVersion, resultsScope]);

  const model = useMemo(() => buildAssessmentAnalytics(payloads), [payloads]);
  const rows = useMemo(() => filterAssessmentStudents(model.students, { query, type: typeFilter }), [model.students, query, typeFilter]);
  const codingQuestions = useMemo(() => model.codingQuestions.filter((question) => (
    typeFilter === "ALL" || question.assessmentType === typeFilter
  )), [model.codingQuestions, typeFilter]);
  const closeHistory = () => {
    setSelectedStudent(null);
    requestAnimationFrame(() => launcherRef.current?.focus());
  };
  const openHistory = (row, launcher) => { launcherRef.current = launcher; setSelectedStudent(row); };
  const { metrics } = model;
  const currentResultsError = resultsErrorScope === resultsScope ? resultsError : "";
  const requestError = resultsScope ? currentResultsError : classroomError;
  const dataMatchesScope = loadedResultsScope === resultsScope && Boolean(resultsScope);
  const view = getAssessmentAnalyticsView({
    classroomId,
    lessonKey,
    assessmentApplicable: selectedLesson?.assessmentApplicable,
    loading,
    error: requestError,
    dataMatchesScope,
  });
  const retryRequest = () => {
    if (resultsScope && currentResultsError) setResultsRetryVersion((current) => current + 1);
    else setClassroomRetryVersion((current) => current + 1);
  };
  const downloadScoreSheet = () => {
    setDownloadError("");
    downloadControllerRef.current.download({
      scope: resultsScope,
      classroomId,
      lessonKey,
    });
  };

  return <section className={styles.root} aria-label="Assessment evidence">
    <section className={styles.filters} aria-label="Assessment analytics filters">
      <label>Classroom<select value={classroomId} onChange={(event) => { setClassroomId(event.target.value); setLessonKey(""); }}><option value="">Select a classroom</option>{classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}{classroom.section ? ` · ${classroom.section}` : ""}</option>)}</select></label>
      <label>Lesson<select value={lessonKey} disabled={!classroomId} onChange={(event) => setLessonKey(event.target.value)}><option value="">Select a lesson</option>{ACADEMIC_LESSONS.map((lesson) => <option key={lesson.key} value={lesson.key}>{lesson.title}</option>)}</select></label>
      <label>Assessment type<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="ALL">All assessment types</option><option value="PRE">PRE diagnostic</option><option value="POST">POST assessment</option></select></label>
      <label>Student search<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or username" /></label>
    </section>

    <AssessmentResultsBoundary view={view} error={requestError} onRetry={retryRequest}>
      <>
        <div className={styles.availability} aria-label="Assessment availability">
          <article><strong>PRE diagnostic</strong><span>{summarizeAssessmentAvailability(slots.PRE, payloads.prePayload)}</span></article>
          <article><strong>POST assessment</strong><span>{summarizeAssessmentAvailability(slots.POST, payloads.postPayload)}</span></article>
        </div>
        <div className={styles.downloadBar}>
          <p>All students with at least one submitted PRE or POST for this classroom and lesson. Student search and assessment-type filters do not affect this download.</p>
          <button type="button" onClick={downloadScoreSheet} disabled={downloadPending || !model.students.length}><FiDownload aria-hidden="true" /> {downloadPending ? "Downloading…" : "Download score sheet"}</button>
        </div>
        {downloadError && <div className={styles.downloadError} role="alert">{downloadError}</div>}
        <span className={styles.srOnly} aria-live="polite">{downloadPending ? "Preparing score sheet download" : ""}</span>
        <AssessmentEvidenceSummary metrics={metrics} />
        <CodingQuestionBreakdown questions={codingQuestions} />
        <div className={styles.tableWrap}><table><caption>Submitted assessment results, alphabetical by student</caption><thead><tr><th scope="col">Student</th><th scope="col">PRE diagnostic</th><th scope="col">First POST</th><th scope="col">Official POST</th><th scope="col">POST status</th><th scope="col">Submitted POST attempts</th><th scope="col">Learning gain</th><th scope="col">History</th></tr></thead><tbody>
          {!rows.length ? <tr><td colSpan="8" className={styles.emptyCell}>No submitted results match these filters.</td></tr> : rows.map((row) => <tr key={row.student.id}><th scope="row"><strong>{row.name}</strong><small>@{row.student.username}</small></th><td><AttemptScore attempt={row.preAttempt} />{row.preAttempt && <small>{row.preStatus}</small>}</td><td><AttemptScore attempt={row.firstPost} /></td><td><AttemptScore attempt={row.officialPost} /></td><td>{row.postStatus}</td><td>{row.postAttempts.length}</td><td>{signedPoints(row.learningGain)}</td><td><button type="button" onClick={(event) => openHistory(row, event.currentTarget)}>View history</button></td></tr>)}
        </tbody></table></div>
      </>
    </AssessmentResultsBoundary>
    {selectedStudent && <AttemptHistoryDialog row={selectedStudent} onClose={closeHistory} />}
  </section>;
}
