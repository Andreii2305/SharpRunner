import { useEffect, useRef } from "react";
import { getAnswerSummary, getCurrentQuestion } from "./assessmentState.js";
import AssessmentQuestion from "./AssessmentQuestion.jsx";
import AssessmentCodingQuestion from "./AssessmentCodingQuestion.jsx";
import styles from "./AssessmentPlayer.module.css";

const statusCopy = (saveState, hasSelection) => {
  switch (saveState?.status) {
    case "saving":
      return "Saving...";
    case "dirty":
      return "Not saved - waiting";
    case "error":
      return "Not saved - retry";
    case "conflict":
      return "Answers need to be reloaded";
    default:
      return hasSelection ? "Saved" : "Not answered";
  }
};

export function AssessmentPlayer({
  state,
  onSelect,
  onSourceChange,
  onRunCode,
  onPrevious,
  onNext,
  onGoToQuestion,
  onRetrySave,
  onRecoverConflict,
  onRetrySync,
  onReadyToReview,
}) {
  const questionContainer = useRef(null);
  const saveStatusRef = useRef(null);
  const currentQuestion = getCurrentQuestion(state);
  const summary = getAnswerSummary(state);
  const currentIndex = state.currentQuestionIndex;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === summary.total - 1;
  const selectedChoiceId = currentQuestion
    ? state.selectedByQuestion[currentQuestion.id]
    : undefined;
  const sourceCode = currentQuestion
    ? state.sourceByQuestion?.[currentQuestion.id]
    : undefined;
  const currentSaveState = currentQuestion
    ? state.saveStateByQuestion[currentQuestion.id]
    : null;
  const hasConflict = state.orderedQuestions.some(({ id }) => (
    state.saveStateByQuestion[id]?.status === "conflict"
  ));
  const syncRequired = state.externalSyncRequired === true;
  const syncChecking = state.externalSyncStatus === "checking";
  const syncFailed = state.externalSyncStatus === "error";
  const hasSaveError = currentSaveState?.status === "error";
  const syncBlocking = hasConflict || syncRequired || syncChecking;
  const grading = state.attempt?.status === "GRADING" || state.submitStatus === "grading";
  const editingBlocked = syncBlocking || grading;
  const hasSavedAnswer = currentQuestion?.questionType === "CODING"
    ? state.responseExistsByQuestion?.[currentQuestion.id] === true
      && typeof state.savedSourceByQuestion?.[currentQuestion.id] === "string"
      && state.savedSourceByQuestion[currentQuestion.id].trim().length > 0
    : currentQuestion ? selectedChoiceId != null : false;
  const shouldFocusSaveStatus = syncRequired
    || syncFailed
    || hasSaveError
    || hasConflict;
  const saveStatus = syncRequired
    ? "This assessment changed in another tab. Reload assessment before continuing."
    : syncChecking
      ? "Checking for assessment updates..."
      : syncFailed
        ? "Could not check for assessment updates. Your saved answers are unchanged."
        : hasConflict
          ? "Answers need to be reloaded"
          : grading
            ? "Grading your assessment..."
            : statusCopy(currentSaveState, hasSavedAnswer);
  const failedCount = state.orderedQuestions.filter(({ id }) => (
    state.saveStateByQuestion[id]?.status === "error"
    || state.saveStateByQuestion[id]?.status === "conflict"
  )).length;
  const firstUnansweredId = summary.unansweredQuestionIds[0];
  const firstUnansweredIndex = state.orderedQuestions.findIndex(
    ({ id }) => id === firstUnansweredId,
  );

  useEffect(() => {
    questionContainer.current?.focus();
  }, [currentIndex]);

  useEffect(() => {
    if (shouldFocusSaveStatus) saveStatusRef.current?.focus();
  }, [currentQuestion?.id, currentSaveState?.status, shouldFocusSaveStatus]);

  if (!currentQuestion) {
    return (
      <main className={styles.page} role="alert">
        <h1>Assessment unavailable</h1>
        <p>No questions are available for this attempt.</p>
      </main>
    );
  }

  const advance = () => {
    if (isLast) onReadyToReview();
    else onNext();
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          {state.assessment.type === "PRE" ? "Diagnostic assessment" : "Lesson assessment"}
        </p>
        <h1>{state.assessment.title}</h1>
        {state.assessment.instructions && <p>{state.assessment.instructions}</p>}
        <div className={styles.progressRow} aria-live="polite">
          <span>Question {currentIndex + 1} of {summary.total}</span>
          <span>Answered {summary.answered} of {summary.total}</span>
        </div>
      </header>

      {currentQuestion.questionType === "CODING" ? (
        <AssessmentCodingQuestion
          question={currentQuestion}
          sourceCode={sourceCode}
          onSourceChange={onSourceChange}
          disabled={editingBlocked}
          containerRef={questionContainer}
          runState={state.codingRunByQuestion?.[currentQuestion.id]}
          onRun={onRunCode}
        />
      ) : (
        <AssessmentQuestion
          question={currentQuestion}
          selectedChoiceId={selectedChoiceId}
          onSelect={onSelect}
          disabled={editingBlocked}
          containerRef={questionContainer}
        />
      )}

      <section
        className={styles.saveArea}
        aria-label="Answer save status"
        role={syncRequired || syncFailed || hasSaveError || hasConflict ? "alert" : undefined}
      >
        <p
          ref={saveStatusRef}
          className={styles.saveStatus}
          aria-live="polite"
          aria-atomic="true"
          tabIndex={shouldFocusSaveStatus ? -1 : undefined}
        >
          {saveStatus}
        </p>
        {!editingBlocked && currentSaveState?.status === "error" && (
          <button type="button" className={styles.secondaryButton} onClick={() => onRetrySave(currentQuestion.id)}>
            Retry save
          </button>
        )}
        {(hasConflict || syncRequired) && (
          <button type="button" className={styles.secondaryButton} onClick={onRecoverConflict}>
            Reload assessment
          </button>
        )}
        {syncFailed && (
          <button type="button" className={styles.secondaryButton} onClick={onRetrySync}>
            Check again
          </button>
        )}
      </section>

      <aside className={styles.awareness} aria-label="Answer review status">
        <p>
          {summary.unansweredQuestionIds.length === 0
            ? "All questions answered"
            : `${summary.unansweredQuestionIds.length} unanswered`}
          {failedCount > 0 ? `; ${failedCount} response${failedCount === 1 ? "" : "s"} need attention` : ""}
        </p>
        {firstUnansweredIndex >= 0 && firstUnansweredIndex !== currentIndex && (
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => onGoToQuestion(firstUnansweredIndex)}
          >
            Review unanswered questions
          </button>
        )}
      </aside>

      <nav className={styles.navigation} aria-label="Assessment questions">
        <button type="button" onClick={onPrevious} disabled={isFirst}>
          Previous
        </button>
        <button type="button" onClick={advance} disabled={grading || (isLast && syncBlocking)}>
          {isLast ? "Review answers" : "Next"}
        </button>
      </nav>
    </main>
  );
}

export default AssessmentPlayer;
