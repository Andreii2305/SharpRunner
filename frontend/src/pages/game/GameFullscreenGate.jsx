import { forwardRef } from "react";
import styles from "./GamePage.module.css";

export const GameFullscreenGate = forwardRef(function GameFullscreenGate({
  state,
  reportingState,
  reportingRequired = false,
  onContinue,
  onLeave,
  onRetrySession,
  onRetryEvents,
}, continueButtonRef) {
  const requesting = state.status === "requesting";
  const retrying = state.status === "error" || state.status === "unsupported";
  const sessionReady = !reportingRequired || reportingState?.sessionStatus === "current";
  const sessionLoading = reportingRequired
    && ["idle", "starting", "rate-limited"].includes(reportingState?.sessionStatus);
  const sessionRetryable = reportingRequired && reportingState?.sessionStatus === "uncertain";
  const sessionTerminal = reportingRequired
    && ["terminal", "error"].includes(reportingState?.sessionStatus);

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
        {reportingRequired ? (
          <section className={styles.interruptionReportingStatus} aria-label="Interruption reporting status">
            {sessionReady ? (
              <>
                <p>Reporting session ready.</p>
                <p>
                  Saved rates for this session: {reportingState.session.scoreDeductionSnapshot} score point(s)
                  and {reportingState.session.xpDeductionSnapshot} XP per recorded interruption.
                </p>
              </>
            ) : sessionLoading ? (
              <p role="status">Preparing the interruption reporting session…</p>
            ) : (
              <p role="alert">{reportingState?.sessionError?.message ?? "The reporting session is unavailable."}</p>
            )}
            {sessionRetryable ? (
              <button type="button" className={styles.fullscreenGateContinue} onClick={onRetrySession}>
                Retry session setup
              </button>
            ) : null}
            {reportingState?.pendingCount > 0 ? (
              <p>
                Pending interruption reports: {reportingState.pendingCount}.
                {reportingState.deliveryStatus === "sending" ? " Saving…" : ""}
              </p>
            ) : null}
            {reportingState?.deliveryError ? (
              <>
                <p role="alert">{reportingState.deliveryError.message} Pending reports have not been discarded.</p>
                <button type="button" className={styles.fullscreenGateContinue} onClick={onRetryEvents}>
                  Retry pending reports
                </button>
              </>
            ) : null}
          </section>
        ) : null}
        {state.error ? <p className={styles.fullscreenGateError} role="alert">{state.error}</p> : null}
        <div className={styles.fullscreenGateActions}>
          <button
            ref={continueButtonRef}
            type="button"
            className={styles.fullscreenGateContinue}
            onClick={onContinue}
            disabled={requesting || !sessionReady || sessionTerminal}
          >
            {sessionLoading
              ? "Preparing session…"
              : requesting ? "Entering fullscreen…" : retrying ? "Try fullscreen again" : "Continue"}
          </button>
          <button type="button" className={styles.fullscreenGateLeave} onClick={onLeave}>
            Leave level
          </button>
        </div>
      </section>
    </div>
  );
});
