const DEFAULT_LEVELS_PER_LESSON = 10;

const LESSON_DEFINITIONS = [
  {
    lessonKey: "variables-and-data-types",
    lessonTitle: "Variables and Data Types",
    totalLevels: DEFAULT_LEVELS_PER_LESSON,
  },
  {
    lessonKey: "operators",
    lessonTitle: "Operators",
    totalLevels: DEFAULT_LEVELS_PER_LESSON,
  },
  {
    lessonKey: "conditional-statements",
    lessonTitle: "Conditional Statements",
    totalLevels: DEFAULT_LEVELS_PER_LESSON,
  },
  {
    lessonKey: "loops",
    lessonTitle: "Loops",
    totalLevels: DEFAULT_LEVELS_PER_LESSON,
  },
];

const DEFAULT_LEVEL_PROGRESS = LESSON_DEFINITIONS.flatMap(
  (lesson, lessonIndex) =>
    Array.from({ length: lesson.totalLevels }, (_, levelIndex) => {
      const levelNumber = levelIndex + 1;
      const orderIndex = lessonIndex * DEFAULT_LEVELS_PER_LESSON + levelNumber;

      return {
        levelKey: `${lesson.lessonKey}-level-${levelNumber}`,
        lessonTitle: lesson.lessonTitle,
        orderIndex,
      };
    })
);

module.exports = {
  DEFAULT_LEVELS_PER_LESSON,
  LESSON_DEFINITIONS,
  DEFAULT_LEVEL_PROGRESS,
};
