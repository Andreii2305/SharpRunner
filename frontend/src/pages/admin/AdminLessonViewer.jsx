import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { FiRefreshCw, FiX } from "react-icons/fi";
import LessonRenderer from "../../Components/LessonRenderer/LessonRenderer.jsx";
import { createAdminLessonDialogBehavior } from "./adminLessonViewerDialog.js";
import { formatScheduledRelease, lessonPublicationLabel } from "./adminLessonViewerState.js";
import styles from "./AdminDashboardPage.module.css";

const ownerLabel = (lesson) => {
  const owner = lesson?.owner;
  if (!owner) return null;
  return [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.username || null;
};
const directClassroomLabel = (lesson) => {
  const classroom = lesson?.classroom;
  if (!classroom) return lesson?.classroomId == null ? "No direct classroom" : "Classroom details unavailable";
  const identity = [classroom.className, classroom.section, classroom.schoolYear].filter(Boolean).join(" · ") || "Classroom details unavailable";
  return classroom.isActive === false ? `${identity} · Archived classroom` : identity;
};
const Term = ({ name, children }) => <div><dt>{name}</dt><dd>{children}</dd></div>;
const PanelShell = ({ title, onClose, children }) => {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const behaviorRef = useRef(null);
  const titleId = useId();
  onCloseRef.current = onClose;
  if (!behaviorRef.current) {
    behaviorRef.current = createAdminLessonDialogBehavior({ onClose: () => onCloseRef.current?.() });
  }
  const behavior = behaviorRef.current;

  useLayoutEffect(() => { behavior.open(dialogRef.current, closeRef.current); }, [behavior]);
  useEffect(() => {
    const onKeyDown = (event) => behavior.handleKeyDown(event, dialogRef.current);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [behavior]);

  return <div className={styles.detailBackdrop} onClick={(event) => behavior.handleBackdropClick(event)}><aside ref={dialogRef} className={`${styles.detailPanel} ${styles.lessonViewerPanel}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><header><div><span>Read-only lesson viewer</span><h2 id={titleId}>{title || "Lesson"}</h2></div><button ref={closeRef} type="button" onClick={behavior.requestClose} aria-label="Close details"><FiX /></button></header>{children}</aside></div>;
};

export function AdminLessonViewer({ detail, onClose, onRetry, onOpenAttachment, fileError = "", fileLoading = false }) {
  const title = detail.lesson?.title || detail.sourceItem?.title || "Lesson";
  if (detail.status === "loading") return <PanelShell title={title} onClose={onClose}><div className={styles.lessonViewerState}><FiRefreshCw className={styles.spin} /> Loading lesson content…</div></PanelShell>;
  if (detail.status === "error") return <PanelShell title={title} onClose={onClose}><div className={styles.lessonViewerState} role="alert"><p>{detail.error || "Unable to load lesson details."}</p><button type="button" className={styles.secondaryButton} onClick={onRetry}>Retry</button></div></PanelShell>;
  const lesson = detail.lesson;
  if (!lesson) return <PanelShell title={title} onClose={onClose}><div className={styles.lessonViewerState}>Lesson details are unavailable.</div></PanelShell>;
  const publication = lessonPublicationLabel(lesson);
  const owner = ownerLabel(lesson);
  return <PanelShell title={lesson.title} onClose={onClose}><dl><Term name="Publication state">{publication}</Term>{publication === "Scheduled" && <Term name="Release date and time">{formatScheduledRelease(lesson.publishAt)}</Term>}<Term name="Owner">{owner || "Not available"}</Term><Term name="Direct classroom">{directClassroomLabel(lesson)}</Term><Term name="Placement records">{lesson.usageCount ?? lesson.placements?.length ?? 0} placement records</Term></dl>{lesson.description && <section className={styles.detailSection}><h3>Description</h3><p>{lesson.description}</p></section>}<section className={styles.detailSection} aria-labelledby="lesson-placement-heading"><h3 id="lesson-placement-heading">Reusable placements</h3>{lesson.placements?.length ? lesson.placements.map((placement) => <div key={placement.id}><strong>{placement.classroom?.className || "Classroom unavailable"}{placement.classroom?.section ? ` · ${placement.classroom.section}` : ""}</strong><span>{placement.module?.title || "No module"} · {placement.archivedAt ? "Archived placement" : "Active placement"}</span></div>) : <p>No reusable placements.</p>}</section>{fileLoading && <p role="status">Preparing file download…</p>}{fileError && <p className={styles.errorBanner} role="alert">{fileError}</p>}<div className={styles.lessonViewerContent}><LessonRenderer lesson={lesson} readOnly enforceAvailability renderEmptyContent onOpenAttachment={onOpenAttachment} /></div></PanelShell>;
}

export default AdminLessonViewer;
