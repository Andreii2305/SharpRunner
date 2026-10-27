import { useEffect, useRef, useState } from "react";
import {
  createAssessmentFullscreenController,
  initialAssessmentFullscreenState,
} from "./assessmentFullscreenController.js";
import styles from "./AssessmentPlayer.module.css";

export function AssessmentFullscreenControls({ state, onEnter, onExit }) {
  const isFullscreen = ["fullscreen", "exiting"].includes(state.status);
  const pending = ["checking", "requesting", "exiting"].includes(state.status);
  const label = isFullscreen
    ? state.status === "exiting" ? "Exiting fullscreen..." : "Exit fullscreen"
    : state.status === "requesting" ? "Entering fullscreen..." : "Enter fullscreen";

  return (
    <section className={styles.fullscreenControls} aria-label="Fullscreen availability">
      {state.status !== "unsupported" && state.status !== "unavailable" && (
        <button type="button" disabled={pending} onClick={isFullscreen ? onExit : onEnter}>
          {label}
        </button>
      )}
      {state.message && (
        <p role={state.status === "error" ? "alert" : "status"} aria-live="polite">
          {state.message}
        </p>
      )}
    </section>
  );
}

export function AssessmentFullscreenBoundary({ eligible, identity, controllerRef, children }) {
  const boundaryRef = useRef(null);
  const internalControllerRef = useRef(null);
  const [state, setState] = useState(initialAssessmentFullscreenState);

  useEffect(() => {
    const controller = createAssessmentFullscreenController({ onStateChange: setState });
    internalControllerRef.current = controller;
    if (controllerRef) controllerRef.current = controller;
    return () => {
      controller.dispose();
      if (internalControllerRef.current === controller) internalControllerRef.current = null;
      if (controllerRef?.current === controller) controllerRef.current = null;
    };
  }, [controllerRef]);

  useEffect(() => {
    internalControllerRef.current?.setScope({
      identity,
      element: boundaryRef.current,
      eligible,
    });
  }, [eligible, identity]);

  return (
    <div
      ref={boundaryRef}
      className={styles.fullscreenBoundary}
      data-assessment-fullscreen-boundary="true"
    >
      {(eligible || ["fullscreen", "exiting"].includes(state.status)) && (
        <AssessmentFullscreenControls
          state={state}
          onEnter={() => internalControllerRef.current?.enter()}
          onExit={() => internalControllerRef.current?.exit()}
        />
      )}
      {children}
    </div>
  );
}

export default AssessmentFullscreenBoundary;
