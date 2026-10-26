import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import styles from "./TeacherPage.module.css";
import detailStyles from "./TeacherClassDetailPage.module.css";
import { createTeacherCheckInDialogBehavior } from "./teacherCheckInDialogBehavior.js";

const classroomName = (classroom) => [classroom?.className, classroom?.section].filter(Boolean).join(" · ") || "Classroom unavailable";

export function TeacherCheckInDialog({ state, onMessageChange, onSend, onRetry, onClose }) {
  const dialogRef = useRef(null);
  const messageRef = useRef(null);
  const titleId = useId();
  const [clock, setClock] = useState(() => Date.now());
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const behavior = useMemo(() => createTeacherCheckInDialogBehavior({ onClose: () => closeRef.current?.() }), []);

  useEffect(() => {
    if (!state.open) return undefined;
    behavior.open(dialogRef.current, messageRef.current);
    const onKeyDown = (event) => behavior.handleKeyDown(event, dialogRef.current);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      behavior.reset();
    };
  }, [behavior, state.open]);

  useEffect(() => {
    if (state.phase !== "rate-limited" || !Number.isFinite(state.retryAt)) return undefined;
    const delay = Math.max(0, state.retryAt - Date.now());
    const timer = window.setTimeout(() => setClock(Date.now()), delay + 10);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.retryAt]);

  if (!state.open || !state.target) return null;
  const locked = ["sending", "uncertain", "rate-limited", "success"].includes(state.phase);
  const retryBlocked = state.phase === "rate-limited" && Number.isFinite(state.retryAt) && clock < state.retryAt;
  const student = state.target.student;
  const retryTime = state.phase === "rate-limited" && Number.isFinite(state.retryAt)
    ? new Date(state.retryAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })
    : null;

  const content = (
    <div className={styles.modalBackdrop} onMouseDown={(event) => behavior.handleBackdropClick(event)}>
      <div
        ref={dialogRef}
        className={`${styles.modalCard} ${detailStyles.checkInDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h3 id={titleId}>Send check-in</h3>
          <button type="button" className={styles.modalCloseBtn} onClick={() => behavior.requestClose()} aria-label="Close send check-in dialog"><FiX /></button>
        </div>
        <div className={detailStyles.checkInDialogBody}>
          <dl className={detailStyles.checkInRecipient}>
            <div><dt>Classroom</dt><dd>{classroomName(state.target.classroom)}</dd></div>
            <div><dt>Recipient</dt><dd>{student.studentName || student.username || "Student unavailable"}{student.username ? ` (@${student.username})` : ""}</dd></div>
          </dl>
          <label className={detailStyles.checkInMessageField}>
            Message
            <textarea
              ref={messageRef}
              value={state.message}
              disabled={locked}
              onChange={(event) => onMessageChange(event.target.value)}
              placeholder="Write a neutral, private check-in message…"
              aria-describedby={`${titleId}-count ${state.error ? `${titleId}-status` : ""}`.trim()}
            />
          </label>
          <div id={`${titleId}-count`} className={state.characterCount > 1000 ? detailStyles.checkInCountError : detailStyles.checkInCount}>
            {state.characterCount.toLocaleString()} of 1,000 characters
          </div>
          {state.error && <p id={`${titleId}-status`} className={detailStyles.checkInDialogError} role="alert">{state.error}</p>}
          {state.phase === "uncertain" && <p className={detailStyles.checkInDialogNote}>Retrying uses the same protected send identity and does not create a new message.</p>}
          {retryTime && <p className={detailStyles.checkInDialogNote}>Retry available at {retryTime}.</p>}
          {state.phase === "success" && <p className={detailStyles.checkInDialogSuccess} role="status">The check-in was saved and sent to the student. This does not mean it has been read.</p>}
        </div>
        <div className={styles.modalActions}>
          <button type="button" className={styles.btnOutline} onClick={() => behavior.requestClose()}>Close</button>
          {["uncertain", "rate-limited"].includes(state.phase) ? (
            <button type="button" className={styles.btnPrimary} disabled={retryBlocked} onClick={onRetry}>
              {retryBlocked ? "Retry later" : "Retry same message"}
            </button>
          ) : state.phase !== "success" ? (
            <button type="button" className={styles.btnPrimary} disabled={state.phase === "sending" || state.characterCount > 1000} onClick={onSend}>
              {state.phase === "sending" ? "Sending…" : "Send check-in"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
