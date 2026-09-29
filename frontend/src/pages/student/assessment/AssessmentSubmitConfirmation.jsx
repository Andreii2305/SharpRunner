import { useEffect, useRef } from "react";
import { handleSubmitConfirmationKeyDown } from "./assessmentDialogFocus.js";
import styles from "./AssessmentPlayer.module.css";

export default function AssessmentSubmitConfirmation({
  unansweredCount,
  submitting,
  onCancel,
  onConfirm,
}) {
  const confirmRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div
      className={styles.dialogBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="assessment-submit-title"
      aria-describedby="assessment-submit-description"
      onKeyDown={(event) => handleSubmitConfirmationKeyDown({
        event,
        panel: panelRef.current,
        submitting,
        onCancel,
      })}
    >
      <section ref={panelRef} className={styles.dialogPanel}>
        <h2 id="assessment-submit-title">Submit this assessment?</h2>
        <p id="assessment-submit-description">
          {unansweredCount > 0
            ? `You still have ${unansweredCount} unanswered question${unansweredCount === 1 ? "" : "s"}. You may return to answer them or submit now.`
            : "Your saved answers will be submitted for grading."}
        </p>
        <div className={styles.dialogActions}>
          <button type="button" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Submit assessment"}
          </button>
        </div>
      </section>
    </div>
  );
}
