import { useEffect, useRef } from "react";
import { FiAlertTriangle, FiX } from "react-icons/fi";
import { ACADEMIC_LESSONS } from "./teacherAssessmentBuilderState.js";
import styles from "./TeacherAssessmentBuilderPage.module.css";

const typeLabel = (type) => type === "PRE" ? "Pre-Test" : "Post-Test";
const classroomLabel = (classroom) => classroom
  ? `${classroom.className}${classroom.section ? ` — ${classroom.section}` : ""}`
  : "Unknown classroom";
const assessmentLabel = (summary, lessonKey, type) => {
  const title = typeof summary?.title === "string" ? summary.title.trim() : "";
  if (title) return title;
  const lessonTitle = ACADEMIC_LESSONS.find((lesson) => lesson.key === lessonKey)?.title;
  return `${lessonTitle ? `${lessonTitle} ` : ""}${typeLabel(type)}`;
};

export default function TeacherAssessmentCopyDialog({
  open,
  classrooms = [],
  destinationClassroom,
  destinationLesson,
  type,
  sourceClassroomId = "",
  sourceLessonKey = "",
  sourceSummary,
  loading = false,
  submitting = false,
  error = "",
  onSourceClassroomChange,
  onSourceLessonChange,
  onAssessmentChange,
  onSubmit,
  onClose,
}) {
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  const submittingRef = useRef(submitting);
  submittingRef.current = submitting;

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    firstFieldRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !submittingRef.current) {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll(
        "button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]",
      ) || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus?.();
    };
  }, [onClose, open]);

  if (!open) return null;
  const compatibleSource = sourceSummary?.exists ? sourceSummary : null;
  const crossLesson = Boolean(sourceLessonKey && destinationLesson?.key
    && sourceLessonKey !== destinationLesson.key);
  const canSubmit = Boolean(compatibleSource && !loading && !submitting);
  const selectedAssessmentLabel = assessmentLabel(compatibleSource, sourceLessonKey, type);
  const questionCount = Number(compatibleSource?.questionCount ?? 0);

  return <div className={styles.backdrop} onMouseDown={() => { if (!submitting) onClose?.(); }}>
    <section
      ref={dialogRef}
      className={styles.copyDialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="assessment-copy-title"
      aria-describedby="assessment-copy-description"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header>
        <div><span>Reuse assessment</span><h2 id="assessment-copy-title">Copy existing {typeLabel(type)}</h2></div>
        <button type="button" onClick={onClose} disabled={submitting} aria-label="Close copy dialog"><FiX /></button>
      </header>
      <p id="assessment-copy-description" className={styles.copyDescription}>
        A new independent draft will be created in the destination below.
      </p>

      <section className={styles.copySection} aria-labelledby="copy-from-heading">
        <div className={styles.copySectionHeading}><span>Copy from</span><h3 id="copy-from-heading">Source assessment</h3></div>
        <div className={styles.copyFields}>
          <label>Classroom<select ref={firstFieldRef} value={sourceClassroomId} onChange={(event) => onSourceClassroomChange?.(event.target.value)} disabled={submitting}>
            <option value="">Select source classroom</option>
            {classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroomLabel(classroom)}</option>)}
          </select></label>
          <label>Lesson<select value={sourceLessonKey} onChange={(event) => onSourceLessonChange?.(event.target.value)} disabled={!sourceClassroomId || submitting}>
            <option value="">Select source lesson</option>
            {ACADEMIC_LESSONS.map((lesson) => <option key={lesson.key} value={lesson.key}>{lesson.title}</option>)}
          </select></label>
          <label className={styles.copyAssessmentField}>Assessment<select
            value={compatibleSource?.id ?? ""}
            onChange={(event) => onAssessmentChange?.(event.target.value)}
            disabled={!compatibleSource || loading || submitting}
          >
            <option value="">{loading ? "Loading compatible assessment…" : `No ${typeLabel(type)} selected`}</option>
            {compatibleSource && <option value={compatibleSource.id}>{selectedAssessmentLabel}</option>}
          </select></label>
        </div>
        {!loading && sourceClassroomId && sourceLessonKey && !compatibleSource && <p className={styles.copyEmpty} role="status">
          No {typeLabel(type)} exists in that classroom and lesson.
        </p>}
        {compatibleSource && <div className={styles.copySourceSummary} aria-label="Selected source assessment summary">
          <strong>{selectedAssessmentLabel}</strong>
          <span>{questionCount} {questionCount === 1 ? "question" : "questions"}</span>
          <span className={compatibleSource.published ? styles.copyPublished : styles.copyDraft}>
            {compatibleSource.published ? "Published" : "Draft"}
          </span>
        </div>}
        {crossLesson && <p className={styles.copyWarning}><FiAlertTriangle aria-hidden="true" />
          <span>This assessment comes from a different lesson. Review its questions before publishing.</span>
        </p>}
      </section>

      <section className={styles.copySection} aria-labelledby="copy-to-heading">
        <div className={styles.copySectionHeading}><span>Copy to</span><h3 id="copy-to-heading">Destination</h3></div>
        <dl className={styles.copyDestination}>
          <div><dt>Classroom</dt><dd>{classroomLabel(destinationClassroom)}</dd></div>
          <div><dt>Lesson</dt><dd>{destinationLesson?.title ?? "Unknown lesson"}</dd></div>
          <div><dt>Assessment</dt><dd>{typeLabel(type)}</dd></div>
        </dl>
      </section>

      {error && <p className={styles.copyError} role="alert">{error}</p>}
      <footer>
        <button type="button" onClick={onClose} disabled={submitting}>Cancel</button>
        <button type="button" className={styles.primaryButton} onClick={onSubmit} disabled={!canSubmit}>
          {submitting ? "Copying…" : "Copy as draft"}
        </button>
      </footer>
    </section>
  </div>;
}
