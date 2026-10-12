import { useRef } from "react";
import AssessmentSubmitConfirmation from "./AssessmentSubmitConfirmation.jsx";
import styles from "./AssessmentPlayer.module.css";

export default function AssessmentSubmitReview({
  summary,
  readiness,
  confirmationOpen,
  submitting,
  submissionError,
  onReturnToQuestions,
  onFirstUnanswered,
  onFirstUnresolved,
  onOpenConfirmation,
  onCancelConfirmation,
  onConfirm,
}) {
  const openButtonRef = useRef(null);
  const unresolvedIds = new Set([
    ...readiness.dirtyQuestionIds,
    ...readiness.savingQuestionIds,
    ...readiness.failedQuestionIds,
  ]);
  const unresolvedCount = unresolvedIds.size;
  const failedIds = new Set(readiness.failedQuestionIds);
  const pendingIds = new Set([
    ...readiness.dirtyQuestionIds,
    ...readiness.savingQuestionIds,
  ].filter((questionId) => !failedIds.has(questionId)));
  const pending = pendingIds.size > 0;

  return (
    <main className={styles.page}>
      <section className={styles.reviewCard} aria-labelledby="assessment-review-title">
        <h1 id="assessment-review-title">Review your answers</h1>
        <p>Check your response status before submitting.</p>
        <dl className={styles.reviewSummary} aria-label="Response summary">
          <div><dt>Answered</dt><dd>{summary.answered} of {summary.total}</dd></div>
          <div><dt>Unanswered</dt><dd>{summary.unansweredQuestionIds.length}</dd></div>
          <div data-tone={pendingIds.size > 0 ? "pending" : undefined}>
            <dt>Pending saves</dt><dd>{pendingIds.size}</dd>
          </div>
          <div data-tone={failedIds.size > 0 ? "error" : undefined}>
            <dt>Failed or conflicted</dt><dd>{failedIds.size}</dd>
          </div>
        </dl>
        {pending && (
          <p className={styles.reviewNotice} data-tone="pending" role="status">
            Saving is still in progress. Submission will remain unavailable.
          </p>
        )}
        {failedIds.size > 0 && (
          <p className={styles.reviewNotice} data-tone="error" role="alert">
            {failedIds.size} response{failedIds.size === 1 ? " needs" : "s need"} attention before submission.
          </p>
        )}
        {submissionError && (
          <p className={styles.reviewNotice} data-tone="error" role="alert">
            Grading could not complete. Your answers are preserved and this attempt remains available to try again.
          </p>
        )}
        <div className={styles.reviewActions}>
          <button type="button" onClick={onReturnToQuestions} disabled={submitting}>Back to questions</button>
          {summary.unansweredQuestionIds.length > 0 && (
            <button type="button" onClick={onFirstUnanswered} disabled={submitting}>Jump to first unanswered question</button>
          )}
          {unresolvedCount > 0 && (
            <button type="button" onClick={onFirstUnresolved} disabled={submitting}>
              Review first unresolved response
            </button>
          )}
          <button
            ref={openButtonRef}
            type="button"
            onClick={onOpenConfirmation}
            disabled={!readiness.ready || submitting}
          >
            Continue to submission
          </button>
        </div>
      </section>
      {confirmationOpen && (
        <AssessmentSubmitConfirmation
          unansweredCount={summary.unansweredQuestionIds.length}
          submitting={submitting}
          onCancel={() => {
            onCancelConfirmation();
            queueMicrotask(() => openButtonRef.current?.focus());
          }}
          onConfirm={onConfirm}
        />
      )}
    </main>
  );
}
