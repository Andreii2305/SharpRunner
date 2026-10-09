import { useEffect, useRef } from "react";
import { createAssessmentResultModel } from "./assessmentResultModel.js";
import AssessmentCodeEditor from "../../../Components/AssessmentCodeEditor/AssessmentCodeEditor.jsx";
import styles from "./AssessmentPlayer.module.css";

const percentagePoints = (learningGain) => {
  if (learningGain?.unit === "percentage_points") return `${learningGain.value} percentage points`;
  return `${learningGain?.value ?? ""} ${learningGain?.unit ?? ""}`.trim();
};

const resultHeading = (model) => ({
  DIAGNOSTIC_COMPLETE: "Diagnostic complete",
  PASSED: "Post-test complete",
  REQUIREMENT_COMPLETED: "Post-test requirement complete",
  COMPLETED: "Assessment complete",
  EXHAUSTED: "Post-test attempts complete",
  RETRY_AVAILABLE: "Post-test submitted",
  SUBMITTED: "Assessment submitted",
}[model.state]);

const formatSubmittedAt = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export default function AssessmentResult({
  envelope,
  progression,
  progressionError,
  route,
  questions,
  retakeStatus,
  externalSyncStatus,
  retakeError,
  onRetake,
  onRetryProgression,
}) {
  const headingRef = useRef(null);
  const model = createAssessmentResultModel({ envelope, progression, route });
  const isPre = model.type === "PRE";
  const syncChecking = externalSyncStatus === "checking";
  const reviewByQuestionId = new Map(
    model.review.map((entry) => [String(entry.questionId), entry]),
  );
  const orderedReview = Array.isArray(questions) && questions.length > 0
    ? questions.map((question, index) => ({
        entry: reviewByQuestionId.get(String(question.id)),
        question,
        index,
      })).filter(({ entry }) => entry)
    : model.review.map((entry, index) => ({ entry, question: null, index }));
  const choiceText = (question, choiceId) => question?.choices
    ?.find((choice) => String(choice.id) === String(choiceId))?.choiceText;
  const submittedAt = formatSubmittedAt(model.result.submittedAt);
  const resultMessage = isPre
    ? model.baselineEligible
      ? "Your starting point has been recorded. This helps show your learning progress after the lesson."
      : "Your diagnostic result has been recorded."
    : model.attemptOutcome === "PASSED"
      ? "You passed this post-test."
      : model.requirementCompletedOnAnotherAttempt
        ? "This attempt did not pass. Your post-test requirement was completed on another attempt."
        : model.state === "REQUIREMENT_COMPLETED"
          ? "Your submitted attempt is recorded. The post-test requirement is complete."
          : model.state === "EXHAUSTED"
            ? `${model.attemptOutcome === "FAILED" ? "This attempt did not pass. " : ""}No attempts remain. Your teacher can help with the next step.`
            : model.state === "COMPLETED"
              ? `${model.attemptOutcome === "FAILED" ? "This attempt did not pass. " : ""}This assessment requirement is complete.`
              : model.state === "RETRY_AVAILABLE"
                ? `${model.attemptOutcome === "FAILED" ? "This attempt did not pass. " : "Your submitted attempt is recorded. "}Another attempt is available.`
                : "Your submitted attempt is recorded.";

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className={styles.page}>
      <section className={styles.resultCard} aria-labelledby="assessment-result-title">
        <header className={styles.resultHeader}>
          <div className={styles.identityRow}>
            <span className={styles.typeBadge}>{model.type}-Test</span>
            <span className={styles.assessmentKind}>{model.lessonTitle}</span>
          </div>
          <h1 ref={headingRef} id="assessment-result-title" tabIndex="-1">
            {resultHeading(model)}
          </h1>
          <h2>{model.assessmentTitle}</h2>
          <p className={styles.resultMeta}>Submitted{submittedAt ? ` · ${submittedAt}` : ""}</p>
          <p className={styles.resultMessage}>{resultMessage}</p>
        </header>

        <div className={styles.resultSummary} aria-label="Result summary">
          <div className={styles.summaryCard}>
            <p>Attempt: {model.result.attemptNumber}</p>
          </div>
          {model.attempts && (
            <div className={styles.summaryCard}>
              <p>Attempts used: {model.attempts.used} of {model.attempts.max}</p>
              {model.attempts.remaining !== undefined && <small>{model.attempts.remaining} remaining</small>}
            </div>
          )}
          {model.score && (
            <>
              <div className={styles.summaryCard}>
                <p>{isPre
                  ? model.baselineEligible ? "Baseline score" : "Diagnostic score"
                  : "Attempt score"}: {model.score.percentage}%</p>
              </div>
              <div className={styles.summaryCard}>
                <p>Points: {model.score.pointsEarned} of {model.score.maxPoints}</p>
              </div>
              {!isPre && model.officialGrade?.percentage !== undefined && (
                <div className={styles.summaryCard}>
                  <p>Official grade (best): {model.officialGrade.percentage}%</p>
                </div>
              )}
              {!isPre && model.firstPost?.percentage !== undefined && (
                <div className={styles.summaryCard}>
                  <p>Learning-gain comparison attempt: {model.firstPost.percentage}%</p>
                </div>
              )}
              {!isPre && model.learningGain?.value !== undefined && (
                <div className={styles.summaryCard}>
                  <p>{model.learningGain.label}: {percentagePoints(model.learningGain)}</p>
                </div>
              )}
            </>
          )}
        </div>

        {model.reviewAvailable && orderedReview.length > 0 && (
          <section className={styles.reviewResults} aria-labelledby="answer-review-title">
            <h2 id="answer-review-title">Review Answers</h2>
            <ol>
              {orderedReview.map(({ entry, question, index }) => {
                const studentAnswer = entry.studentAnswer
                  ?? choiceText(question, entry.selectedChoiceId);
                const correctAnswer = entry.correctAnswer
                  ?? choiceText(question, entry.correctChoiceId);
                const answersMatch = studentAnswer != null
                  && correctAnswer != null
                  && String(studentAnswer) === String(correctAnswer);
                return (
                  <li key={entry.questionId ?? index}>
                    <div className={styles.reviewQuestionHeader}>
                      <span>Question {index + 1}</span>
                      {typeof entry.isCorrect === "boolean" && (
                        <strong data-status={entry.isCorrect ? "correct" : "incorrect"}>
                          {entry.isCorrect ? "Correct" : "Incorrect"}
                        </strong>
                      )}
                    </div>
                    {(question?.questionText ?? entry.questionText) && (
                      <h3>{question?.questionText ?? entry.questionText}</h3>
                    )}
                    {Object.prototype.hasOwnProperty.call(entry, "sourceCode") ? (
                      <div className={styles.codeReview}>
                        <AssessmentCodeEditor
                          label={`Submitted source for question ${index + 1}`}
                          value={entry.sourceCode}
                          onChange={() => {}}
                          disabled
                          height="240px"
                        />
                      </div>
                    ) : studentAnswer ? (
                      <div className={styles.answerArea} data-kind="student">
                        <p>Your answer: {studentAnswer}</p>
                      </div>
                    ) : entry.selectedChoiceId == null ? (
                      <div className={styles.answerArea} data-kind="unanswered"><p>Unanswered</p></div>
                    ) : null}
                    {correctAnswer && !answersMatch && (
                      <div className={styles.answerArea} data-kind="correct">
                        <p>Correct answer: {correctAnswer}</p>
                      </div>
                    )}
                    {model.score && entry.pointsAwarded !== undefined && (
                      <p className={styles.pointsAwarded}>Points awarded: {entry.pointsAwarded}</p>
                    )}
                    {entry.explanation != null && (
                      <div className={styles.explanation}><strong>Explanation</strong><p>{entry.explanation}</p></div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        )}
        {!model.reviewAvailable && (
          <p role="status">Answer review is not available for this attempt.</p>
        )}

        {progressionError && (
          <div role="alert">
            <p>Your result is saved, but the next lesson step could not be refreshed.</p>
            <button type="button" onClick={onRetryProgression}>Retry next-step refresh</button>
          </div>
        )}
        {retakeError && <p role="alert">The retake could not be started. Please try again.</p>}

        <nav className={styles.resultActions} aria-label="Assessment result actions">
          {isPre && !progressionError && model.continuation?.href && !model.continuation.disabled && (
            <a className={styles.primaryAction} href={model.continuation.href}>{model.continuation.label}</a>
          )}
          {isPre && !progressionError && model.continuation?.disabled && (
            <p role="status">{model.continuation.label}</p>
          )}
          {!isPre && ["PASSED", "COMPLETED", "REQUIREMENT_COMPLETED"].includes(model.state) && (
            <a className={styles.primaryAction} href={model.nextHref}>Continue</a>
          )}
          {model.retakeAllowed && (
            <button
              type="button"
              onClick={onRetake}
              disabled={retakeStatus === "starting" || syncChecking}
            >
              {syncChecking
                ? "Checking for updates"
                : retakeStatus === "starting" ? "Starting retake..." : "Retake Post-Test"}
            </button>
          )}
          <a href={model.returnHref}>Back to Lesson Map</a>
        </nav>
      </section>
    </main>
  );
}
