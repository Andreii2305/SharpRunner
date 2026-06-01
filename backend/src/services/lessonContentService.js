const lessonContentSeed = require("../data/lessonContent.seed.json");

const normalizeLesson = (lesson, startingOrderIndex) => {
  const normalizedLevels = (lesson.levels ?? []).map((level) => {
    const levelNumber = Number(level.levelNumber);
    return {
      ...level,
      levelNumber,
      levelKey: `${lesson.lessonKey}-level-${levelNumber}`,
      orderIndex: startingOrderIndex + levelNumber - 1,
    };
  });

  return {
    ...lesson,
    levels: normalizedLevels.sort((a, b) => a.levelNumber - b.levelNumber),
  };
};

const getLessonContentSeed = () => {
  let nextOrderIndex = 1;
  const lessons = (lessonContentSeed.lessons ?? []).map((lesson) => {
    const normalizedLesson = normalizeLesson(lesson, nextOrderIndex);
    nextOrderIndex += normalizedLesson.levels.length;
    return normalizedLesson;
  });
  return {
    version: lessonContentSeed.version ?? 1,
    updatedAt: lessonContentSeed.updatedAt ?? null,
    lessonCount: lessons.length,
    lessons,
  };
};

const getLessonSeedByKey = (lessonKey) => {
  const normalizedKey =
    typeof lessonKey === "string" ? lessonKey.trim().toLowerCase() : "";
  if (!normalizedKey) {
    return null;
  }

  const payload = getLessonContentSeed();
  return payload.lessons.find((lesson) => lesson.lessonKey === normalizedKey) ?? null;
};

module.exports = {
  getLessonContentSeed,
  getLessonSeedByKey,
};
