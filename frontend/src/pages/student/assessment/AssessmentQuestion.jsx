import styles from "./AssessmentPlayer.module.css";

export function AssessmentQuestion({
  question,
  selectedChoiceId,
  onSelect,
  disabled = false,
  containerRef,
}) {
  if (!question) return null;
  const groupName = `assessment-question-${question.id}`;

  return (
    <fieldset
      className={styles.question}
      ref={containerRef}
      tabIndex="-1"
      aria-describedby={`${groupName}-help`}
    >
      <legend className={styles.questionText}>{question.questionText}</legend>
      <p id={`${groupName}-help`} className={styles.choiceHelp}>
        Select one answer. Your choice is saved automatically.
      </p>
      <div className={styles.choices}>
        {question.choices.map((choice) => {
          const inputId = `${groupName}-choice-${choice.id}`;
          return (
            <label
              className={styles.choice}
              htmlFor={inputId}
              key={choice.id}
              data-state={selectedChoiceId === choice.id ? "selected" : "unselected"}
            >
              <input
                id={inputId}
                name={groupName}
                type="radio"
                value={choice.id}
                checked={selectedChoiceId === choice.id}
                disabled={disabled}
                onChange={() => onSelect(question.id, choice.id)}
              />
              <span>{choice.choiceText}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default AssessmentQuestion;
