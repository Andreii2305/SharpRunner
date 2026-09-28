const lessonContentSeed = require("../data/lessonContent.seed.json");

const toCatalogueLesson = (lesson, displayOrder) => ({
  lessonKey: lesson.lessonKey,
  lessonTitle: lesson.lessonTitle,
  theme: lesson.theme,
  description: lesson.description,
  displayOrder,
});

const getLessonContentSeed = () => {
  const lessons = (lessonContentSeed.lessons ?? []).map(toCatalogueLesson);
  return {
    version: lessonContentSeed.version ?? 1,
    updatedAt: lessonContentSeed.updatedAt ?? null,
    lessonCount: lessons.length,
    lessons,
  };
};

module.exports = {
  getLessonContentSeed,
};
