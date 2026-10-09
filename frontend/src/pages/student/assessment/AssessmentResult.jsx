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

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className={styles.page}>
      <section className={styles.resultCard} aria-labelledby="assessment-result-title">
        <h1 ref={headingRef} id="assessment-result-title" tabIndex="-1">
          {resultHeading(model)}
        </h1>
        <p>{model.lessonTitle} · {model.type}</p>
        <h2>{model.assessmentTitle}</h2>
        <p>Status: Submitted{submittedAt ? ` · ${submittedAt}` : ""}</p>
        {isPre ? (
          model.baselineEligible ? (
            <p>Your starting point has been recorded. This helps show your learning progress after the lesson.</p>
          ) : (
            <p>Your diagnostic result has been recorded.</p>
          )
        ) : model.attemptOutcome === "PASSED" ? (
          <p>You passed this post-test.</p>
        ) : model.requirementCompletedOnAnotherAttempt ? (
          <p>This attempt did not pass. Your post-test requirement was completed on another attempt.</p>
        ) : model.state === "REQUIREMENT_COMPLETED" ? (
          <p>Your submitted attempt is recorded. The post-test requirement is complete.</p>
        ) : model.state === "EXHAUSTED" ? (
          <p>{model.attemptOutcome === "FAILED" ? "This attempt did not pass. " : ""}No attempts remain. Your teacher can help with the next step.</p>
        ) : model.state === "COMPLETED" ? (
          <p>{model.attemptOutcome === "FAILED" ? "This attempt did not pass. " : ""}This assessment requirement is complete.</p>
        ) : model.state === "RETRY_AVAILABLE" ? (
          <p>{model.attemptOutcome === "FAILED" ? "This attempt did not pass. " : "Your submitted attempt is recorded. "}Another attempt is available.</p>
        ) : (
          <p>Your submitted attempt is recorded.</p>
        )}

        <p>Attempt {model.result.attemptNumber}</p>
        {model.attempts && (
          <p>
            Attempts used: {model.attempts.used} of {model.attempts.max}
            {model.attempts.remaining !== undefined ? ` · Remaining: ${model.attempts.remaining}` : ""}
          </p>
        )}

        {model.score && (
          <div className={styles.scoreList} aria-label="Assessment score">
            <p>{isPre
              ? model.baselineEligible ? "Baseline score" : "Diagnostic score"
              : "Attempt score"}: {model.score.percentage}%</p>
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
            <h2 id="answer-review-title">Review Answers</h2>
            <ol>
              {orderedReview.map(({ entry, question, index }) => (
                <li key={entry.questionId ?? index}>
                  <h3>Question {index + 1}</h3>
                  {(question?.questionText ?? entry.questionText) && (
                    <p>{question?.questionText ?? entry.questionText}</p>
                  )}
                  {Object.prototype.hasOwnProperty.call(entry, "sourceCode") ? (
                    <AssessmentCodeEditor
                      label={`Submitted source for question ${index + 1}`}
                      value={entry.sourceCode}
                      onChange={() => {}}
                      disabled
                      height="240px"
                    />
                  ) : (entry.studentAnswer ?? choiceText(question, entry.selectedChoiceId)) ? (
                    <p>Your answer: {entry.studentAnswer ?? choiceText(question, entry.selectedChoiceId)}</p>
                  ) : entry.selectedChoiceId == null ? (
                    <p>Unanswered</p>
                  ) : null}
                  {(entry.correctAnswer ?? choiceText(question, entry.correctChoiceId)) && (
                    <p>Correct answer: {entry.correctAnswer ?? choiceText(question, entry.correctChoiceId)}</p>
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
            <a href={model.continuation.href}>{model.continuation.label}</a>
          )}
          {isPre && !progressionError && model.continuation?.disabled && (
            <p role="status">{model.continuation.label}</p>
          )}
          {!isPre && ["PASSED", "COMPLETED", "REQUIREMENT_COMPLETED"].includes(model.state) && (
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
          <a href={model.returnHref}>Back to Lesson Map</a>
        </nav>
      </section>
    </main>
  );
}
