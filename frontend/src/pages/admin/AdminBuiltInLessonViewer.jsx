import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { FiRefreshCw, FiX } from "react-icons/fi";
import BuiltInLessonRenderer from "../../Components/BuiltInLessonRenderer.jsx";
import { createAdminLessonDialogBehavior } from "./adminLessonViewerDialog.js";
import styles from "./AdminDashboardPage.module.css";

export function AdminBuiltInLessonViewer({ detail, onClose, onRetry }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const behaviorRef = useRef(null);
  const titleId = useId();
  onCloseRef.current = onClose;
  if (!behaviorRef.current) behaviorRef.current = createAdminLessonDialogBehavior({ onClose: () => onCloseRef.current?.() });
  const behavior = behaviorRef.current;
  const lesson = detail.response?.lesson;
  const title = lesson?.title || detail.sourceItem?.title || "Built-in lesson";

  useLayoutEffect(() => { behavior.open(dialogRef.current, closeRef.current); }, [behavior]);
  useEffect(() => {
    const onKeyDown = (event) => behavior.handleKeyDown(event, dialogRef.current);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [behavior]);

  let content;
  if (detail.status === "loading") content = <div className={styles.lessonViewerState} role="status"><FiRefreshCw className={styles.spin} /> Loading built-in lesson…</div>;
  else if (detail.status === "error") content = <div className={styles.lessonViewerState} role="alert"><p>{detail.error || "Unable to load built-in lesson details."}</p><button type="button" className={styles.secondaryButton} onClick={onRetry}>Retry</button></div>;
  else if (!lesson) content = <div className={styles.lessonViewerState}>Built-in lesson details are unavailable.</div>;
  else content = <div className={`${styles.lessonViewerContent} ${styles.builtInLessonViewerContent}`}><BuiltInLessonRenderer lesson={lesson} /></div>;

  return <div className={styles.detailBackdrop} onClick={(event) => behavior.handleBackdropClick(event)}><aside ref={dialogRef} className={`${styles.detailPanel} ${styles.lessonViewerPanel}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><header><div><span>Read-only built-in lesson</span><h2 id={titleId}>{title}</h2></div><button ref={closeRef} type="button" onClick={behavior.requestClose} aria-label="Close built-in lesson"><FiX /></button></header>{content}</aside></div>;
}

export default AdminBuiltInLessonViewer;
