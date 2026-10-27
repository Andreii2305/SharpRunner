import { useEffect, useId, useLayoutEffect, useRef } from "react";
import styles from "./AssessmentPlayer.module.css";
import { createAssessmentInterruptionDialogBehavior } from "./assessmentInterruptionDialog.js";

export function AssessmentInterruptionNotice({ onContinue, restoreFocusTarget = null }) {
  const dialogRef = useRef(null);
  const continueRef = useRef(null);
  const onContinueRef = useRef(onContinue);
  const behaviorRef = useRef(null);
  const titleId = useId();
  onContinueRef.current = onContinue;

  if (!behaviorRef.current) {
    behaviorRef.current = createAssessmentInterruptionDialogBehavior({
      onContinue: () => onContinueRef.current?.(),
      restoreTarget: restoreFocusTarget,
    });
  }
  const behavior = behaviorRef.current;

  useLayoutEffect(() => {
    behavior.open(dialogRef.current, continueRef.current);
  }, [behavior]);

  useEffect(() => {
    const onKeyDown = (event) => behavior.handleKeyDown(event, dialogRef.current);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [behavior]);

  return (
    <div className={styles.interruptionBackdrop}>
      <section
        ref={dialogRef}
        className={styles.interruptionDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <span className={styles.statusEyebrow}>Assessment session</span>
        <h2 id={titleId}>Check your assessment session</h2>
        <p>You returned to this assessment. Check your session before continuing.</p>
        <button ref={continueRef} type="button" onClick={behavior.requestContinue}>
          Continue and check session
        </button>
      </section>
    </div>
  );
}

export default AssessmentInterruptionNotice;
