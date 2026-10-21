export const saveLessonAndNotify = async ({ save, onSuccess }) => {
  const savedLesson = await save();
  const message = savedLesson?.status === "draft" ? "Draft saved."
    : savedLesson?.status === "published" ? "Lesson published."
      : savedLesson?.status === "scheduled" ? "Lesson scheduled."
        : "Lesson saved.";
  onSuccess(message);
  return savedLesson;
};
