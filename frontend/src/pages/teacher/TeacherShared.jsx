import { useEffect, useId, useLayoutEffect, useRef } from "react";
import {
  createDialogFocusSession,
  focusDialog,
  handleDialogKeyDown,
  requestDialogDismiss,
} from "../../utils/dialogFocus.js";
import styles from "./TeacherPage.module.css";

const ANNOUNCEMENT_HEADER_PREFIX = "HEADER:";

export const clampPercent = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : 0;
};

export const buildAnnouncementPayload = (header, message) =>
  `${ANNOUNCEMENT_HEADER_PREFIX} ${`${header ?? ""}`.trim()}\n${`${message ?? ""}`.trim()}`;

export const parseAnnouncementPayload = (raw) => {
  const text = `${raw ?? ""}`.trim();
  const [first = "", ...rest] = text.split(/\r?\n/);
  if (!first.toUpperCase().startsWith(ANNOUNCEMENT_HEADER_PREFIX)) {
    return { header: "Announcement", body: text };
  }
  return {
    header: first.slice(ANNOUNCEMENT_HEADER_PREFIX.length).trim() || "Announcement",
    body: rest.join("\n").trim(),
  };
};

export const formatDateTime = (value) => {
  if (!value) return "Just now";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Just now" : date.toLocaleString();
};

export function ClassCreationDialogFlow({ stage, form, onChange, onSubmit, onClose, isCreating, error, classCode }) {
  const dialogRef = useRef(null);
  const classNameRef = useRef(null);
  const doneRef = useRef(null);
  const focusSessionRef = useRef(null);
  const titleId = useId();
  const isOpen = stage === "create" || stage === "success";
  const dismissDisabled = stage === "create" && isCreating;

  if (!focusSessionRef.current) focusSessionRef.current = createDialogFocusSession();

  useLayoutEffect(() => {
    if (!isOpen) {
      focusSessionRef.current.end();
      return;
    }
    focusSessionRef.current.begin(document.activeElement);
    focusDialog(dialogRef.current, stage === "create" ? classNameRef.current : doneRef.current);
  }, [isOpen, stage]);

  useEffect(() => () => focusSessionRef.current.end(), []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => handleDialogKeyDown({
      event,
      dialog: dialogRef.current,
      disabled: dismissDisabled,
      onDismiss: onClose,
    });
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dismissDisabled, isOpen, onClose]);

  if (!isOpen) return null;

  const requestClose = () => requestDialogDismiss({ disabled: dismissDisabled, onDismiss: onClose });
  const onBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget) requestClose();
  };

  if (stage === "success") {
    return (
      <div className={styles.modalBackdrop} onMouseDown={onBackdropMouseDown}>
        <div ref={dialogRef} className={`${styles.successCard} ${styles.classDialog}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
          <div className={styles.successIcon} aria-hidden="true">✓</div>
          <h3 id={titleId}>Classroom created!</h3>
          <p>Share this code with your students.</p>
          <div className={styles.codeBlock}>{classCode || "N/A"}</div>
          <button ref={doneRef} type="button" className={styles.btnPrimary} onClick={requestClose}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.modalBackdrop} onMouseDown={onBackdropMouseDown}>
      <div ref={dialogRef} className={`${styles.modalCard} ${styles.classDialog}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className={styles.modalHeader}>
          <h3 id={titleId}>Create new class</h3>
          <button type="button" className={styles.modalCloseBtn} aria-label="Close create class dialog" onClick={requestClose} disabled={isCreating}>×</button>
        </div>
        {error && <div className={styles.modalError} role="alert">{error}</div>}
        <form onSubmit={onSubmit} className={styles.modalForm}>
          <label className={styles.modalLabel}>
            <span>Class name</span>
            <input ref={classNameRef} autoFocus type="text" name="className" value={form.className} onChange={onChange} placeholder="e.g. BSIT - C# Fundamentals" />
          </label>
          <label className={styles.modalLabel}>
            <span>Section</span>
            <input type="text" name="section" value={form.section} onChange={onChange} placeholder="e.g. BSIT 1A" autoComplete="off" />
          </label>
          <label className={styles.modalLabel}>
            <span>School year</span>
            <input type="text" name="schoolYear" value={form.schoolYear} onChange={onChange} placeholder="e.g. 2025-2026" />
          </label>
          <label className={styles.modalLabel}>
            <span>Max students (optional)</span>
            <input type="number" name="maxStudents" value={form.maxStudents} onChange={onChange} min={1} placeholder="No limit" />
          </label>
          <label className={`${styles.modalLabel} ${styles.modalLabelFull}`}>
            <span>Description (optional)</span>
            <input type="text" name="description" value={form.description} onChange={onChange} placeholder="Short description" />
          </label>
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnOutline} onClick={requestClose} disabled={isCreating}>Cancel</button>
            <button type="submit" className={styles.btnPrimary} disabled={isCreating}>{isCreating ? "Creating..." : "Create class"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
