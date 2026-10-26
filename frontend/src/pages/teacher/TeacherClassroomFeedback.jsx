import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiMessageSquare } from "react-icons/fi";
import { listTeacherClassroomFeedback } from "../../services/teacherClassroomFeedbackService.js";
import { getUser, subscribeToAuthChanges } from "../../utils/auth.js";
import styles from "./TeacherPage.module.css";
import detailStyles from "./TeacherClassDetailPage.module.css";
import {
  createTeacherClassroomFeedbackController,
  initialTeacherClassroomFeedbackState,
} from "./teacherClassroomFeedbackState.js";

const studentLabel = (student) => {
  if (!student) return "Student identity unavailable";
  return `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim()
    || student.username
    || "Student identity unavailable";
};

const formatSubmittedAt = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Submission time unavailable" : date.toLocaleString();
};

export function TeacherClassroomFeedbackView({ state, onRetry, onPageChange }) {
  const metadataAvailable = Number.isSafeInteger(state.total) && Number.isSafeInteger(state.totalPages);
  const canGoPrevious = metadataAvailable && !state.loading && state.page > 1;
  const canGoNext = metadataAvailable && !state.loading && state.page < state.totalPages;

  return (
    <div className={detailStyles.feedbackSection}>
      <div className={detailStyles.feedbackHeader}>
        <div>
          <h2>Classroom feedback</h2>
          <p>This is identified classroom feedback, not anonymous. Student names reflect current account details.</p>
        </div>
        <strong>{metadataAvailable ? `${state.total} submission${state.total === 1 ? "" : "s"}` : "Total unavailable"}</strong>
      </div>

      {state.status === "loading" && <div className={styles.loadingText} role="status">Loading classroom feedback…</div>}
      {state.status === "error" && (
        <div className={detailStyles.sectionState} role="alert">
          <span>{state.error}</span>
          <button type="button" className={styles.btnOutline} onClick={onRetry}>Retry feedback</button>
        </div>
      )}
      {state.status === "success" && state.feedback.length === 0 && (
        <div className={detailStyles.feedbackEmpty}>
          <FiMessageSquare aria-hidden="true" />
          <h3>No feedback has been submitted</h3>
          <p>Identified student feedback for this classroom will appear here.</p>
        </div>
      )}
      {state.feedback.length > 0 && (
        <div className={detailStyles.feedbackList}>
          {state.feedback.map((entry) => (
            <article key={entry.id}>
              <header>
                <div>
                  <strong>{studentLabel(entry.student)}</strong>
                  {entry.student?.username && <span>@{entry.student.username}</span>}
                </div>
                <time dateTime={entry.createdAt}>{formatSubmittedAt(entry.createdAt)}</time>
              </header>
              <p>{entry.message}</p>
            </article>
          ))}
        </div>
      )}

      <nav className={detailStyles.feedbackPagination} aria-label="Classroom feedback pages">
        <button type="button" disabled={!canGoPrevious} onClick={() => onPageChange(state.page - 1)} aria-label="Previous feedback page"><FiChevronLeft /> Previous</button>
        <span>{metadataAvailable ? (state.totalPages > 0 ? `Page ${state.page} of ${state.totalPages}` : `Page ${state.page}`) : "Page unavailable"}</span>
        <button type="button" disabled={!canGoNext} onClick={() => onPageChange(state.page + 1)} aria-label="Next feedback page">Next <FiChevronRight /></button>
      </nav>
    </div>
  );
}

export default function TeacherClassroomFeedback({ classroomId, accountId, isTeacher, isActive, controllerRef }) {
  const [state, setState] = useState(initialTeacherClassroomFeedbackState);
  const controller = useMemo(() => createTeacherClassroomFeedbackController({
    request: listTeacherClassroomFeedback,
    onChange: setState,
  }), []);

  useLayoutEffect(() => {
    controller.activate();
    if (controllerRef) controllerRef.current = controller;
    controller.setScope({ accountId, classroomId, isTeacher });
    return () => {
      if (controllerRef?.current === controller) controllerRef.current = null;
    };
  }, [accountId, classroomId, controller, controllerRef, isTeacher]);

  useEffect(() => {
    controller.setActive(isActive && isTeacher);
  }, [accountId, classroomId, controller, isActive, isTeacher]);

  useEffect(() => subscribeToAuthChanges(() => {
    const user = getUser();
    controller.setScope({
      accountId: user?.id,
      classroomId,
      isTeacher: `${user?.role ?? ""}`.toLowerCase() === "teacher",
    });
  }), [classroomId, controller]);

  useEffect(() => () => controller.dispose(), [controller]);

  if (!isTeacher || !isActive) return null;
  return <TeacherClassroomFeedbackView state={state} onRetry={() => controller.retry()} onPageChange={(page) => controller.setPage(page)} />;
}
