import { createLessonProgressionViewModel } from "../../utils/lessonProgressionNavigation.js";

const ALLOWED_COMPLETION_ACTIONS = new Set([
  "TAKE_POST", "RESUME_POST", "RETRY_POST", "POST_RECOVERY_REQUIRED", "LESSON_COMPLETE",
]);

export const createGameCompletionAction = ({ progress, levelConfig }) => {
  if (!progress || !levelConfig?.lessonKey || levelConfig.lessonKey === "final") return null;
  const lesson = progress.lessons?.find((item) => item.lessonKey === levelConfig.lessonKey);
  if (!lesson?.gameCompleted || !ALLOWED_COMPLETION_ACTIONS.has(lesson.nextAction)) return null;
  const { action } = createLessonProgressionViewModel({
    lesson,
    classroomId: progress.classroomId,
  });
  return { label: action.label, href: action.href, disabled: action.disabled };
};
