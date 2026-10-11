import { createLessonProgressionViewModel } from "../../utils/lessonProgressionNavigation.js";

const CONTINUATION_ACTIONS = new Set([
  "TAKE_PRE",
  "RESUME_PRE",
  "PLAY_GAME",
  "TAKE_POST",
  "RESUME_POST",
  "RETRY_POST",
  "POST_RECOVERY_REQUIRED",
  "COMPLETE_PREREQUISITE_LESSON",
  "LESSON_COMPLETE",
]);

export function createModuleContinuationModel({ lessonProgression, classroomId, gameHref }) {
  const action = lessonProgression?.nextAction;
  if (!CONTINUATION_ACTIONS.has(action)) return null;
  if (action === "PLAY_GAME" && lessonProgression.gameUnlocked !== true) return null;
  if (action === "LESSON_COMPLETE" && lessonProgression.lessonCompleted !== true) return null;

  const model = createLessonProgressionViewModel({
    lesson: lessonProgression,
    classroomId,
    gameHref,
  });
  return model.action.kind === "module"
    ? { ...model, action: { kind: "game", label: "Play Level", href: gameHref, disabled: false } }
    : model;
}
