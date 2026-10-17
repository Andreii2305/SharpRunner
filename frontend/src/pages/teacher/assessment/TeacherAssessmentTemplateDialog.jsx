import { useEffect, useRef } from "react";
import { FiX } from "react-icons/fi";
import { focusDialog, handleDialogKeyDown, restoreDialogFocus } from "../../../utils/dialogFocus.js";
import styles from "./TeacherAssessmentBuilderPage.module.css";

const typeLabel = (type) => type === "PRE" ? "Pre-Test" : "Post-Test";
const classroomLabel = (classroom) => classroom
  ? `${classroom.className}${classroom.section ? ` — ${classroom.section}` : ""}`
  : "Unknown classroom";

export default function TeacherAssessmentTemplateDialog({
  open,
  classroom,
  lesson,
  type,
  template,
  pending = false,
  error = "",
  onConfirm,
  onClose,
}) {
  const dialogRef = useRef(null);
  const confirmRef = useRef(null);
  const pendingRef = useRef(pending);
  const onCloseRef = useRef(onClose);
  pendingRef.current = pending;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    focusDialog(dialogRef.current, confirmRef.current);
    const onKeyDown = (event) => handleDialogKeyDown({
      event,
      dialog: dialogRef.current,
      disabled: pendingRef.current,
      onDismiss: () => onCloseRef.current?.(),
    });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreDialogFocus(previousFocus);
    };
  }, [open]);

  if (!open || !template) return null;
  const lessonTitle = lesson?.title ?? template.lessonTitle ?? "Lesson";

  return <div className={styles.backdrop} onMouseDown={() => { if (!pending) onClose?.(); }}>
    <section
      ref={dialogRef}
      className={styles.templateDialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="assessment-template-title"
      aria-describedby="assessment-template-description"
      aria-busy={pending}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header>
        <h2 id="assessment-template-title">Use {lessonTitle} {typeLabel(type)} draft</h2>
        <button type="button" onClick={onClose} disabled={pending} aria-label="Close built-in draft dialog"><FiX /></button>
      </header>
      <p id="assessment-template-description">
        This creates an unpublished draft in the selected classroom. Review and publish it when it is ready.
      </p>
      <dl className={styles.templateDetails}>
        <div><dt>Classroom</dt><dd>{classroomLabel(classroom)}</dd></div>
        <div><dt>Assessment</dt><dd>{lessonTitle} {typeLabel(type)}</dd></div>
        <div><dt>Template</dt><dd>Version {template.templateVersion}</dd></div>
        <div><dt>Source</dt><dd>Curriculum revision {template.curriculumRevision}</dd></div>
        <div><dt>Contents</dt><dd>{template.questionCount} questions · {template.totalPoints} points</dd></div>
      </dl>
      {error && <p className={styles.copyError} role="alert">{error}</p>}
      <footer>
        <button type="button" onClick={onClose} disabled={pending}>Cancel</button>
        <button ref={confirmRef} type="button" className={styles.primaryButton} onClick={onConfirm} disabled={pending}>
          {pending ? "Loading draft…" : "Load draft"}
        </button>
      </footer>
    </section>
  </div>;
}
