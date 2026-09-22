import { markTutorialComplete } from "./gameTutorialState.js";

export const finishGameTutorialSession = ({
  storage,
  userId,
  pendingDialogue = null,
  deferredIntro = false,
}) => {
  markTutorialComplete(storage, userId);
  if (pendingDialogue) return { kind: "triggered", payload: pendingDialogue };
  return { kind: deferredIntro ? "intro" : "none" };
};

export const shouldDismissPortraitPrompt = ({
  tutorialRequested,
  tutorialWasVisible,
  isMobile,
  isPortrait,
  orientationPromptDismissed,
}) => Boolean(
  tutorialRequested && tutorialWasVisible && isMobile && isPortrait
  && !orientationPromptDismissed
);
