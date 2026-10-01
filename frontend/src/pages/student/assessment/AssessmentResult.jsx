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
  COMPLETED: "Assessment complete",
  EXHAUSTED: "Post-test attempts complete",
  RETRY_AVAILABLE: "Post-test submitted",
  SUBMITTED: "Assessment submitted",
}[model.state]);

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

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className={styles.page}>
      <section className={styles.resultCard} aria-labelledby="assessment-result-title">
        <h1 ref={headingRef} id="assessment-result-title" tabIndex="-1">
          {resultHeading(model)}
        </h1>
        {isPre ? (
          <p>Your starting point has been recorded. This helps show your learning progress after the lesson.</p>
        ) : model.state === "PASSED" ? (
          <p>You passed this post-test.</p>
        ) : model.state === "EXHAUSTED" ? (
          <p>No attempts remain. Your teacher can help with the next step.</p>
        ) : model.state === "COMPLETED" ? (
          <p>This assessment requirement is complete.</p>
        ) : model.state === "RETRY_AVAILABLE" ? (
          <p>This attempt did not pass. Another attempt is available.</p>
        ) : (
          <p>Your submitted attempt is recorded.</p>
        )}

        <p>Attempt {model.result.attemptNumber}</p>
        {model.attempts && (
          <p>Attempts used: {model.attempts.used} of {model.attempts.max}</p>
        )}

        {model.score && (
          <div className={styles.scoreList} aria-label="Assessment score">
            <p>{isPre ? "Baseline score" : "Latest attempt score"}: {model.score.percentage}%</p>
            <p>Points: {model.score.pointsEarned} of {model.score.maxPoints}</p>
            {!isPre && model.officialGrade?.percentage !== undefined && (
              <p>Official grade (best): {model.officialGrade.percentage}%</p>
            )}
            {!isPre && model.firstPost?.percentage !== undefined && (
              <p>Learning-gain comparison attempt: {model.firstPost.percentage}%</p>
            )}
            {!isPre && model.learningGain?.value !== undefined && (
              <p>{model.learningGain.label}: {percentagePoints(model.learningGain)}</p>
            )}
          </div>
        )}

        {model.reviewAvailable && orderedReview.length > 0 && (
          <section className={styles.reviewResults} aria-labelledby="answer-review-title">
            <h2 id="answer-review-title">Answer review</h2>
            <ol>
              {orderedReview.map(({ entry, question, index }) => (
                <li key={entry.questionId ?? index}>
                  <h3>Question {index + 1}</h3>
                  {question?.questionText && <p>{question.questionText}</p>}
                  {Object.prototype.hasOwnProperty.call(entry, "sourceCode") ? (
                    <AssessmentCodeEditor
                      label={`Submitted source for question ${index + 1}`}
                      value={entry.sourceCode}
                      onChange={() => {}}
                      disabled
                      height="240px"
                    />
                  ) : entry.selectedChoiceId == null ? (
                    <p>Unanswered</p>
                  ) : choiceText(question, entry.selectedChoiceId) ? (
                    <p>Your answer: {choiceText(question, entry.selectedChoiceId)}</p>
                  ) : null}
                  {choiceText(question, entry.correctChoiceId) && (
                    <p>Correct answer: {choiceText(question, entry.correctChoiceId)}</p>
                  )}
                  {typeof entry.isCorrect === "boolean" && (
                    <p>{entry.isCorrect ? "Correct" : "Incorrect"}</p>
                  )}
                  {model.score && entry.pointsAwarded !== undefined && (
                    <p>Points awarded: {entry.pointsAwarded}</p>
                  )}
                  {entry.explanation != null && <p>Explanation: {entry.explanation}</p>}
                </li>
              ))}
            </ol>
          </section>
        )}

        {progressionError && (
          <div role="alert">
            <p>Your result is saved, but the next lesson step could not be refreshed.</p>
            <button type="button" onClick={onRetryProgression}>Retry next-step refresh</button>
          </div>
        )}
        {retakeError && <p role="alert">The retake could not be started. Please try again.</p>}

        <nav className={styles.resultActions} aria-label="Assessment result actions">
          {model.moduleUnlocked && <a href={model.moduleHref}>Continue to module</a>}
          {!isPre && ["PASSED", "COMPLETED"].includes(model.state) && (
            <a href={model.nextHref}>Continue</a>
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
          <a href={model.returnHref}>Return to lesson map</a>
        </nav>
      </section>
    </main>
  );
}
