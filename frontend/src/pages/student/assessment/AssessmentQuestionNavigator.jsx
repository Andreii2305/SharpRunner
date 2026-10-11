import styles from "./AssessmentPlayer.module.css";

const answerStateFor = (questionId, unansweredIds) => (
  unansweredIds.has(questionId) ? "unanswered" : "answered"
);

const saveStateFor = (questionId, saveStateByQuestion) => {
  const status = saveStateByQuestion?.[questionId]?.status;
  if (status === "dirty" || status === "saving") {
    return { state: "pending", label: "save pending" };
  }
  if (status === "error") return { state: "failed", label: "save failed" };
  if (status === "conflict") return { state: "conflict", label: "reload required" };
  return null;
};

export default function AssessmentQuestionNavigator({
  questions,
  currentIndex,
  unansweredQuestionIds,
  saveStateByQuestion,
  disabled = false,
  onGoToQuestion,
}) {
  const unansweredIds = new Set(unansweredQuestionIds);

  return (
    <nav className={styles.questionNavigator} aria-label="Question navigator">
      <details open>
        <summary className={styles.questionNavigatorSummary}>
          Questions
          <span>{questions.length - unansweredIds.size} of {questions.length} answered</span>
        </summary>
        <div className={styles.questionNavigatorGrid}>
          {questions.map((question, index) => {
            const answerState = answerStateFor(question.id, unansweredIds);
            const saveState = saveStateFor(question.id, saveStateByQuestion);
            const current = index === currentIndex;
            return (
              <button
                key={question.id}
                type="button"
                aria-current={current ? "step" : undefined}
                data-state={current ? "current" : answerState}
                data-answer-state={answerState}
                data-save-state={saveState?.state}
                aria-label={`Question ${index + 1}, ${current ? "current, " : ""}${answerState}${saveState ? `, ${saveState.label}` : ""}`}
                disabled={disabled}
                onClick={() => onGoToQuestion(index)}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
        <p className={styles.navigatorLegend} aria-hidden="true">
          <span data-state="answered">Answered</span>
          <span data-state="unanswered">Unanswered</span>
          <span data-save-state="pending">Save pending</span>
          <span data-save-state="failed">Save failed</span>
          <span data-save-state="conflict">Reload required</span>
        </p>
      </details>
    </nav>
  );
}
