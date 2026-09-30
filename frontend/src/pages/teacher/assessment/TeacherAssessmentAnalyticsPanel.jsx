import { useEffect, useMemo, useRef, useState } from "react";
import { FiBarChart2, FiX } from "react-icons/fi";
import {
  getTeacherAssessmentResults,
  listTeacherAssessments,
  listTeacherClassrooms,
  normalizeTeacherAssessmentError,
} from "../../../services/teacherAssessmentService.js";
import {
  ACADEMIC_LESSONS,
  buildAssessmentAnalytics,
  filterAssessmentStudents,
  summarizeAssessmentAvailability,
} from "./teacherAssessmentAnalyticsState.js";
import styles from "./TeacherAssessmentAnalyticsPanel.module.css";

const emptySlots = () => ({ PRE: { exists: false }, POST: { exists: false } });
const percentage = (value) => value == null ? "Unavailable" : `${value}%`;
const signedPoints = (value) => value == null ? "Unavailable" : `${value > 0 ? "+" : ""}${value} pp`;
const submittedDate = (value) => value ? new Date(value).toLocaleString() : "Unavailable";

function Metric({ label, value, note }) {
  return <article className={styles.metric}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>;
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
        <div><strong>{attempt.type === "PRE" ? "PRE diagnostic" : `POST attempt ${attempt.attemptNumber}`}</strong><span>{submittedDate(attempt.submittedAt)}</span></div>
        <div><span>{percentage(attempt.percentage)}</span>{attempt.type === "POST" && attempt.isFirstSubmittedPost && <b>First POST</b>}{attempt.type === "POST" && attempt.isOfficial && <b>Official grade</b>}{attempt.type === "POST" && typeof attempt.passed === "boolean" && <b>{attempt.passed ? "Passed" : "Not passed"}</b>}</div>
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
  const [error, setError] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const requestVersionRef = useRef(0);
  const launcherRef = useRef(null);
  const selectedLesson = ACADEMIC_LESSONS.find((lesson) => lesson.key === lessonKey) ?? null;

  useEffect(() => {
    const controller = new AbortController();
    listTeacherClassrooms({ signal: controller.signal })
      .then((response) => setClassrooms(response.classrooms ?? []))
      .catch((source) => { if (source?.code !== "ERR_CANCELED") setError(normalizeTeacherAssessmentError(source).message); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const requestVersion = ++requestVersionRef.current;
    const controller = new AbortController();
    setSlots(emptySlots());
    setPayloads({ prePayload: null, postPayload: null });
    setSelectedStudent(null);
    setError("");
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
      } catch (source) {
        if (source?.code !== "ERR_CANCELED" && requestVersion === requestVersionRef.current) setError(normalizeTeacherAssessmentError(source).message);
      } finally {
        if (requestVersion === requestVersionRef.current) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [classroomId, lessonKey, selectedLesson?.assessmentApplicable]);

  const model = useMemo(() => buildAssessmentAnalytics(payloads), [payloads]);
  const rows = useMemo(() => filterAssessmentStudents(model.students, { query, type: typeFilter }), [model.students, query, typeFilter]);
  const closeHistory = () => {
    setSelectedStudent(null);
    requestAnimationFrame(() => launcherRef.current?.focus());
  };
  const openHistory = (row, launcher) => { launcherRef.current = launcher; setSelectedStudent(row); };
  const { metrics } = model;

  return <section className={styles.root} aria-labelledby="assessment-analytics-title">
    <header className={styles.heading}><div><span>Assessment evidence</span><h2 id="assessment-analytics-title"><FiBarChart2 /> Assessment analytics</h2><p>Submitted PRE diagnostics and POST assessments for one explicit classroom and lesson.</p></div></header>
    <section className={styles.filters} aria-label="Assessment analytics filters">
      <label>Classroom<select value={classroomId} onChange={(event) => { setClassroomId(event.target.value); setLessonKey(""); }}><option value="">Select a classroom</option>{classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}{classroom.section ? ` · ${classroom.section}` : ""}</option>)}</select></label>
      <label>Lesson<select value={lessonKey} disabled={!classroomId} onChange={(event) => setLessonKey(event.target.value)}><option value="">Select a lesson</option>{ACADEMIC_LESSONS.map((lesson) => <option key={lesson.key} value={lesson.key}>{lesson.title}</option>)}</select></label>
      <label>Assessment type<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="ALL">All assessment types</option><option value="PRE">PRE diagnostic</option><option value="POST">POST assessment</option></select></label>
      <label>Student search<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or username" /></label>
    </section>

    {error && <div className={styles.error} role="alert">{error}</div>}
    {!classroomId || !lessonKey ? <div className={styles.empty}>Select a classroom and lesson to view assessment evidence.</div> : selectedLesson?.assessmentApplicable === false ? <div className={styles.empty}><strong>Assessment not applicable.</strong> This lesson is assessment-exempt in the canonical progression policy.</div> : <>
      {loading ? <div className={styles.empty} role="status">Loading assessment results…</div> : <>
        <div className={styles.availability} aria-label="Assessment availability">
          <article><strong>PRE diagnostic</strong><span>{summarizeAssessmentAvailability(slots.PRE, payloads.prePayload)}</span></article>
          <article><strong>POST assessment</strong><span>{summarizeAssessmentAvailability(slots.POST, payloads.postPayload)}</span></article>
        </div>
        <div className={styles.metrics} aria-label="Assessment analytics overview">
          <Metric label="Submitted students" value={`${metrics.preSubmittedStudents} PRE · ${metrics.postSubmittedStudents} POST`} note="Distinct students with submitted attempts" />
          <Metric label="Average PRE" value={percentage(metrics.averagePrePercentage)} note="Diagnostic; no pass/fail" />
          <Metric label="Average official POST" value={percentage(metrics.averageOfficialPostPercentage)} note="Backend-selected best grade" />
          <Metric label="POST pass rate" value={percentage(metrics.postPassRate)} note={metrics.postPassedStudents == null ? "No passing threshold applies" : `${metrics.postPassedStudents} passed; submitted official results only`} />
          <Metric label="Average submitted POST attempts" value={metrics.averagePostAttempts ?? "Unavailable"} note="Submitted attempts among POST submitters" />
          <Metric label="Learning gain" value={signedPoints(metrics.averageLearningGain)} note={`${metrics.pairedStudents} paired students · PRE to first submitted POST`} />
        </div>
        <p className={styles.limitation}><strong>Submission rate:</strong> Enrollment denominator unavailable from the assessment-results contract. No enrollment-based rate is inferred.</p>
        <div className={styles.tableWrap}><table><caption>Submitted assessment results, alphabetical by student</caption><thead><tr><th scope="col">Student</th><th scope="col">PRE diagnostic</th><th scope="col">First POST</th><th scope="col">Official POST</th><th scope="col">POST status</th><th scope="col">Submitted POST attempts</th><th scope="col">Learning gain</th><th scope="col">History</th></tr></thead><tbody>
          {!rows.length ? <tr><td colSpan="8" className={styles.emptyCell}>No submitted results match these filters.</td></tr> : rows.map((row) => <tr key={row.student.id}><th scope="row"><strong>{row.name}</strong><small>@{row.student.username}</small></th><td>{percentage(row.preAttempt?.percentage)}<small>{row.preStatus}</small></td><td>{percentage(row.firstPost?.percentage)}</td><td>{percentage(row.officialPost?.percentage)}</td><td>{row.postStatus}</td><td>{row.postAttempts.length}</td><td>{signedPoints(row.learningGain)}</td><td><button type="button" onClick={(event) => openHistory(row, event.currentTarget)}>View history</button></td></tr>)}
        </tbody></table></div>
      </>}
    </>}
    {selectedStudent && <AttemptHistoryDialog row={selectedStudent} onClose={closeHistory} />}
  </section>;
}
