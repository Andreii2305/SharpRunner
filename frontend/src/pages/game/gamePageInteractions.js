export const GAMEPLAY_TABS = ["game", "code", "lesson"];

export const getNextGameplayTab = (currentTab, key) => {
  const currentIndex = GAMEPLAY_TABS.indexOf(currentTab);
  if (currentIndex < 0) return null;
  if (key === "Home") return GAMEPLAY_TABS[0];
  if (key === "End") return GAMEPLAY_TABS.at(-1);
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;

  const offset = key === "ArrowRight" ? 1 : -1;
  return GAMEPLAY_TABS[(currentIndex + offset + GAMEPLAY_TABS.length) % GAMEPLAY_TABS.length];
};

export const createEvaluationLifecycle = (onChange = () => {}, inFlightRef = { current: false }) => {
  return {
    isRunning: () => inFlightRef.current,
    start() {
      if (inFlightRef.current) return false;
      inFlightRef.current = true;
      onChange(true);
      return true;
    },
    finish() {
      if (!inFlightRef.current) return false;
      inFlightRef.current = false;
      onChange(false);
      return true;
    },
  };
};

export const dispatchEvaluation = (lifecycle, dispatch) => {
  if (!lifecycle.start()) return false;
  try {
    dispatch();
    return true;
  } catch (error) {
    lifecycle.finish();
    throw error;
  }
};

export const cancelEvaluation = (lifecycle, activityRef) => {
  if (activityRef) activityRef.current = null;
  lifecycle.finish();
};

export const shouldAcceptEvaluationOutcome = ({
  outcomeLevelNumber,
  currentLevelNumber,
  evaluationRunning,
}) => outcomeLevelNumber === currentLevelNumber && evaluationRunning === true;
