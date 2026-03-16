const lessonContentSeed = require("../data/lessonContent.seed.json");

const normalizeLesson = (lesson, lessonIndex) => {
  const normalizedLevels = (lesson.levels ?? []).map((level) => {
    const levelNumber = Number(level.levelNumber);
    return {
      ...level,
      levelNumber,
      levelKey: `${lesson.lessonKey}-level-${levelNumber}`,
      orderIndex: lessonIndex * 10 + levelNumber,
    };
  });

  return {
    ...lesson,
    levels: normalizedLevels.sort((a, b) => a.levelNumber - b.levelNumber),
  };
};

const getLessonContentSeed = () => {
  const lessons = (lessonContentSeed.lessons ?? []).map(normalizeLesson);
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
