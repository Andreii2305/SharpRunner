import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiMessageSquare } from "react-icons/fi";
import Sidebar from "../../Components/SideBar/Sidebar.jsx";
import {
  listEligibleFeedbackClassrooms,
  listStudentClassroomFeedback,
  submitStudentClassroomFeedback,
} from "../../services/studentClassroomFeedbackService.js";
import { getUser, subscribeToAuthChanges } from "../../utils/auth.js";
import {
  createStudentClassroomFeedbackController,
  initialStudentClassroomFeedbackState,
} from "./studentClassroomFeedbackState.js";
import {
  createStudentClassroomFeedbackSubmissionController,
  initialStudentClassroomFeedbackSubmissionState,
} from "./studentClassroomFeedbackSubmissionState.js";
import styles from "./StudentClassroomFeedbackPage.module.css";

const classroomLabel = (classroom) => {
  if (!classroom) return "Classroom unavailable";
  return [classroom.className, classroom.section, classroom.schoolYear].filter(Boolean).join(" · ")
    || "Classroom unavailable";
};

const submittedLabel = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : "Submission time unavailable";
};

export function StudentClassroomFeedbackSubmissionView({
  state,
  onClassroomChange,
  onMessageChange,
  onSubmit,
  onRetrySubmission,
  onRetryClassrooms,
  onRetryHistoryRefresh,
  onSendAnother,
}) {
  const [clock, setClock] = useState(() => Date.now());
  const locked = ["sending", "uncertain", "rate-limited", "success"].includes(state.phase);
  const metadataReady = state.classroomsStatus === "success";
  const noClassrooms = metadataReady && state.classrooms.length === 0;
  const validMessage = state.message.trim().length > 0 && state.characterCount <= 1000;
  const canSubmit = metadataReady && !noClassrooms && state.selectedClassroomId && validMessage && !locked;
  const retryBlocked = state.phase === "rate-limited" && Number.isFinite(state.retryAt) && clock < state.retryAt;

  useEffect(() => {
    if (state.phase !== "rate-limited" || !Number.isFinite(state.retryAt)) return undefined;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.max(0, state.retryAt - Date.now()) + 10);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.retryAt]);

  return (
    <section className={styles.submission} aria-labelledby="send-classroom-feedback-title">
      <div className={styles.submissionHeader}>
        <div>
          <h2 id="send-classroom-feedback-title">Send classroom feedback</h2>
          <p>This is identified feedback visible to the classroom&apos;s current owning teacher. It is private from classmates, but it is not anonymous.</p>
        </div>
      </div>

      {state.classroomsLoading && <p className={styles.formStatus} role="status">Loading eligible classrooms…</p>}
      {state.classroomsStatus === "error" && (
        <div className={styles.error} role="alert">
          <span>{state.classroomsError}</span>
          <button type="button" onClick={onRetryClassrooms}>Retry classroom loading</button>
        </div>
      )}
      {noClassrooms && <p className={styles.formStatus}>No active classrooms are available for new feedback. Your feedback history remains available below.</p>}

      <div className={styles.formGrid}>
        <label>
          Classroom
          <select
            value={state.selectedClassroomId}
            disabled={!metadataReady || noClassrooms || locked}
            onChange={(event) => onClassroomChange(event.target.value)}
          >
            <option value="">Select a classroom</option>
            {state.classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>{classroomLabel(classroom)}</option>
            ))}
          </select>
        </label>
        <label>
          Feedback
          <textarea
            value={state.message}
            disabled={!metadataReady || noClassrooms || locked}
            onChange={(event) => onMessageChange(event.target.value)}
            placeholder="Share a specific classroom learning experience…"
            aria-describedby="classroom-feedback-count classroom-feedback-submit-status"
          />
        </label>
        <div id="classroom-feedback-count" className={state.characterCount > 1000 ? styles.countError : styles.count}>
          {state.characterCount.toLocaleString()} of 1,000 characters
        </div>
      </div>

      {state.submissionError && <p id="classroom-feedback-submit-status" className={styles.submitError} role="alert">{state.submissionError}</p>}
      {state.phase === "uncertain" && <p className={styles.submitNote}>Retrying uses the same classroom, message, and protected submission identity.</p>}
      {state.phase === "rate-limited" && Number.isFinite(state.retryAt) && (
        <p className={styles.submitNote}>Retry available at {new Date(state.retryAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}.</p>
      )}
      {state.phase === "success" && (
        <div className={styles.submitSuccess} role="status">
          <p>Your feedback was saved. This does not mean it has been read by the teacher.</p>
          {state.historyRefreshStatus === "loading" && <p>Refreshing feedback history…</p>}
          {state.historyRefreshStatus === "error" && (
            <div>
              <span>{state.historyRefreshError}</span>
              <button type="button" onClick={onRetryHistoryRefresh}>Retry history refresh</button>
            </div>
          )}
        </div>
      )}

      <div className={styles.formActions}>
        {["uncertain", "rate-limited"].includes(state.phase) ? (
          <button type="button" disabled={retryBlocked} onClick={onRetrySubmission}>
            {retryBlocked ? "Retry later" : "Retry same feedback"}
          </button>
        ) : state.phase === "success" ? (
          <button type="button" onClick={onSendAnother}>Send another</button>
        ) : (
          <button type="button" disabled={!canSubmit || state.phase === "sending"} onClick={onSubmit}>
            {state.phase === "sending" ? "Submitting…" : "Submit feedback"}
          </button>
        )}
      </div>
    </section>
  );
}

export function StudentClassroomFeedbackHistoryView({ state, onRetry, onPageChange }) {
  const metadataAvailable = Number.isSafeInteger(state.total) && Number.isSafeInteger(state.totalPages);
  const canGoPrevious = metadataAvailable && !state.loading && state.page > 1;
  const canGoNext = metadataAvailable && !state.loading && state.page < state.totalPages;

  return (
    <section className={styles.history} aria-labelledby="classroom-feedback-title">
      <header className={styles.header}>
        <div>
          <h1 id="classroom-feedback-title">Classroom feedback</h1>
          <p>Your feedback identifies you to the classroom&apos;s current owning teacher. It is not anonymous and is not public.</p>
        </div>
        <strong>{metadataAvailable ? `${state.total} submission${state.total === 1 ? "" : "s"}` : "Total unavailable"}</strong>
      </header>

      {state.loading && <div className={styles.loading} role="status">Loading feedback history…</div>}
      {state.status === "error" && (
        <div className={styles.error} role="alert">
          <span>{state.error}</span>
          <button type="button" onClick={onRetry}>Retry</button>
        </div>
      )}
      {state.status === "success" && state.feedback.length === 0 && (
        <div className={styles.empty}>
          <FiMessageSquare aria-hidden="true" />
          <h2>No classroom feedback yet</h2>
          <p>Feedback you submit will remain available here as classroom history.</p>
        </div>
      )}
      {state.feedback.length > 0 && (
        <div className={styles.list}>
          {state.feedback.map((entry) => (
            <article key={entry.id}>
              <header>
                <div>
                  <strong>{classroomLabel(entry.classroom)}</strong>
                  {entry.classroom && entry.classroom.isActive === false && <span>Archived classroom</span>}
                </div>
                <time dateTime={entry.createdAt || undefined}>{submittedLabel(entry.createdAt)}</time>
              </header>
              <p>{entry.message}</p>
            </article>
          ))}
        </div>
      )}

      <nav className={styles.pagination} aria-label="Classroom feedback pages">
        <button aria-label="Previous feedback page" type="button" disabled={!canGoPrevious} onClick={() => onPageChange(state.page - 1)}><FiChevronLeft /> Previous</button>
        <span>{metadataAvailable ? (state.totalPages > 0 ? `Page ${state.page} of ${state.totalPages}` : `Page ${state.page}`) : "Page unavailable"}</span>
        <button aria-label="Next feedback page" type="button" disabled={!canGoNext} onClick={() => onPageChange(state.page + 1)}>Next <FiChevronRight /></button>
      </nav>
    </section>
  );
}

export default function StudentClassroomFeedbackPage() {
  const [historyState, setHistoryState] = useState(initialStudentClassroomFeedbackState);
  const [submissionState, setSubmissionState] = useState(initialStudentClassroomFeedbackSubmissionState);
  const historyController = useMemo(() => createStudentClassroomFeedbackController({
    request: listStudentClassroomFeedback,
    onChange: setHistoryState,
  }), []);
  const submissionController = useMemo(() => createStudentClassroomFeedbackSubmissionController({
    loadClassrooms: listEligibleFeedbackClassrooms,
    submit: submitStudentClassroomFeedback,
    refreshHistory: () => historyController.refreshFromFirstPage(),
    onChange: setSubmissionState,
  }), [historyController]);

  useLayoutEffect(() => {
    historyController.activate();
    submissionController.activate();
    const synchronizeAccount = () => {
      const user = getUser();
      const isStudent = `${user?.role ?? ""}`.toLowerCase() === "student";
      const scope = { accountId: isStudent ? user?.id : null, isStudent };
      historyController.setScope(scope);
      submissionController.setScope(scope);
      if (isStudent) {
        historyController.load();
        submissionController.loadClassrooms();
      }
    };
    synchronizeAccount();
    const unsubscribe = subscribeToAuthChanges(synchronizeAccount);
    return () => {
      unsubscribe();
      submissionController.dispose();
      historyController.dispose();
    };
  }, [historyController, submissionController]);

  const changePage = (page) => {
    if (historyController.setPage(page)) historyController.load();
  };

  return (
    <div className={styles.page}>
      <Sidebar />
      <main className={styles.main}>
        <StudentClassroomFeedbackSubmissionView
          state={submissionState}
          onClassroomChange={(value) => submissionController.selectClassroom(value)}
          onMessageChange={(value) => submissionController.updateMessage(value)}
          onSubmit={() => submissionController.submit()}
          onRetrySubmission={() => submissionController.retrySubmission()}
          onRetryClassrooms={() => submissionController.retryClassrooms()}
          onRetryHistoryRefresh={() => submissionController.retryHistoryRefresh()}
          onSendAnother={() => submissionController.sendAnother()}
        />
        <StudentClassroomFeedbackHistoryView
          state={historyState}
          onRetry={() => historyController.retry()}
          onPageChange={changePage}
        />
      </main>
    </div>
  );
}
