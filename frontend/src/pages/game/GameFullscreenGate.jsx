import { forwardRef } from "react";
import styles from "./GamePage.module.css";

export const GameFullscreenGate = forwardRef(function GameFullscreenGate({
  state,
  onContinue,
  onLeave,
}, continueButtonRef) {
  const requesting = state.status === "requesting";
  const retrying = state.status === "error" || state.status === "unsupported";

  return (
    <div className={styles.fullscreenGateOverlay} role="presentation">
      <section
        className={styles.fullscreenGateDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-fullscreen-gate-title"
        aria-describedby="game-fullscreen-gate-description"
        tabIndex={-1}
      >
        <h2 id="game-fullscreen-gate-title">Please enter fullscreen to continue playing.</h2>
        <p id="game-fullscreen-gate-description">
          Gameplay stays paused until this level is fullscreen and the game tab is visible.
        </p>
        <dl className={styles.fullscreenGateCounter}>
          <div>
            <dt>Tab changes</dt>
            <dd>{state.interruptionCount}</dd>
          </div>
        </dl>
        <p className={styles.fullscreenGateExplanation}>
          Fullscreen exits and leaving the game tab are included. This counter resets when you leave the level.
        </p>
        {state.error ? <p className={styles.fullscreenGateError} role="alert">{state.error}</p> : null}
        <div className={styles.fullscreenGateActions}>
          <button
            ref={continueButtonRef}
            type="button"
            className={styles.fullscreenGateContinue}
            onClick={onContinue}
            disabled={requesting}
          >
            {requesting ? "Entering fullscreen…" : retrying ? "Try fullscreen again" : "Continue"}
          </button>
          <button type="button" className={styles.fullscreenGateLeave} onClick={onLeave}>
            Leave level
          </button>
        </div>
      </section>
    </div>
  );
});
