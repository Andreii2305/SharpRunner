import styles from "./AssessmentPlayer.module.css";

const answerStateFor = (questionId, unansweredIds) => (
  unansweredIds.has(questionId) ? "unanswered" : "answered"
);

export default function AssessmentQuestionNavigator({
  questions,
  currentIndex,
  unansweredQuestionIds,
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
            const current = index === currentIndex;
            return (
              <button
                key={question.id}
                type="button"
                aria-current={current ? "step" : undefined}
                data-state={current ? "current" : answerState}
                data-answer-state={answerState}
                aria-label={`Question ${index + 1}, ${current ? "current, " : ""}${answerState}`}
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
        </p>
      </details>
    </nav>
  );
}
