import styles from "./AssessmentPlayer.module.css";

const plural = (count, singular, pluralForm = `${singular}s`) => (
  `${count} ${count === 1 ? singular : pluralForm}`
);

const pointsLabel = (points) => plural(points, "point");

const scoreReleaseCopy = (policy) => {
  if (policy === "AFTER_SUBMISSION") return "Your score will be available after you submit.";
  if (policy === "NOT_RELEASED") return "Your score is not released for this assessment.";
  return "Score release timing is not available.";
};

const reviewReleaseCopy = (policy) => {
  if (policy === "AFTER_SUBMISSION") {
    return "Answer review and any provided explanations will be available after you submit.";
  }
  if (policy === "AFTER_FINAL_ATTEMPT") {
    return "Answer review and any provided explanations will be available after your final allowed attempt.";
  }
  if (policy === "NEVER") return "Answer review and explanations are not released for this assessment.";
  return "Answer-review release timing is not available.";
};

const purposeCopy = (type) => (
  type === "PRE"
    ? "This diagnostic shows what you already know before the lesson. It is not a pass-or-fail test."
    : "This assessment checks what you learned in the lesson."
);

const passingCopy = (type, requirement) => {
  if (type !== "POST") return null;
  if (requirement?.required === true && Number.isFinite(requirement.minimumPercentage)) {
    return `A score of ${requirement.minimumPercentage}% or higher is required to pass.`;
  }
  if (requirement?.required === false) return "No passing percentage is required for this assessment.";
  return "Passing requirement information is not available.";
};

export default function AssessmentStart({ outcome, onStart }) {
  const assessment = outcome?.discovery?.assessment ?? {};
  const status = outcome?.discovery?.status ?? {};
  const information = assessment.studentInformation ?? {};
  const type = assessment.type ?? outcome?.route?.type;
  const attemptsBefore = Number.isFinite(status.attemptsRemaining)
    ? Math.max(0, status.attemptsRemaining)
    : null;
  const attemptsAfter = attemptsBefore === null ? null : Math.max(0, attemptsBefore - 1);
  const starting = outcome?.startStatus === "starting";
  const failed = outcome?.kind === "START_ERROR" || outcome?.startStatus === "error";
  const lessonMapHref = outcome?.route?.classroomId
    ? `/Map?classroomId=${encodeURIComponent(outcome.route.classroomId)}`
    : "/Map";
  const requirement = passingCopy(type, information.passingRequirement);

  return (
    <main className={`${styles.page} ${styles.startPage}`} data-view="assessment-start">
      <section className={styles.startPanel} aria-labelledby="assessment-start-title" aria-busy={starting}>
        <header className={styles.startHeader}>
          <p className={styles.startContext}>
            {information.lessonTitle ?? assessment.lessonKey}
            {" · "}
            {type === "PRE" ? "Pre-assessment" : "Post-assessment"}
          </p>
          <h1 id="assessment-start-title">{assessment.title ?? "Assessment"}</h1>
          <p>{purposeCopy(type)}</p>
          {requirement && <p>{requirement}</p>}
        </header>

        <dl className={styles.startFacts} aria-label="Assessment details">
          <div><dt>Questions</dt><dd>{plural(information.questionCount, "question")}</dd></div>
          <div><dt>Total points</dt><dd>{pointsLabel(information.totalPossiblePoints)}</dd></div>
          <div><dt>Attempt allowance</dt><dd>{plural(assessment.maxAttempts, "total attempt")}</dd></div>
        </dl>

        <section className={styles.startSection} aria-labelledby="attempt-availability-title">
          <h2 id="attempt-availability-title">Attempt availability</h2>
          {attemptsBefore === null ? (
            <p>Attempt availability is not available.</p>
          ) : (
            <>
              <p>{plural(attemptsBefore, "attempt")} {attemptsBefore === 1 ? "is" : "are"} available before you start.</p>
              <p>
                After you start, {attemptsAfter === 0
                  ? "no additional attempts will remain."
                  : `${plural(attemptsAfter, "additional attempt")} will remain.`}
              </p>
            </>
          )}
        </section>

        <section className={styles.startSection} aria-labelledby="assessment-behavior-title">
          <h2 id="assessment-behavior-title">While you work</h2>
          <p>Your responses are saved automatically after each change. Wait for the saved status before leaving the page.</p>
          <p>Review your responses before final submission. After final submission, you cannot edit that attempt.</p>
          {assessment.instructions && <p>{assessment.instructions}</p>}
        </section>

        <section className={styles.startSection} aria-labelledby="release-timing-title">
          <h2 id="release-timing-title">After submission</h2>
          <p>{scoreReleaseCopy(information.scoreReleasePolicy)}</p>
          <p>{reviewReleaseCopy(information.answerReviewReleasePolicy)}</p>
        </section>

        {failed && (
          <div className={styles.startError} role="alert">
            We could not confirm that the assessment started. We checked the authoritative assessment status before enabling another try. Your attempt allowance is unchanged unless the server recorded a start.
          </div>
        )}

        <div className={styles.startActions}>
          <button type="button" onClick={onStart} disabled={starting}>
            {starting ? "Starting assessment…" : (failed ? "Try starting again" : "Start assessment")}
          </button>
          <a href={lessonMapHref}>Back to Lesson Map</a>
        </div>
      </section>
    </main>
  );
}
