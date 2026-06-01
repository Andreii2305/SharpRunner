const LESSON_DEFINITIONS = [
  {
    lessonKey: "tutorial",
    lessonTitle: "Tutorial: First Compile Trial",
    totalLevels: 5,
  },
  {
    lessonKey: "arrays",
    lessonTitle: "Arrays",
    totalLevels: 8,
  },
  {
    lessonKey: "functions",
    lessonTitle: "Functions and Methods",
    totalLevels: 12,
  },
  {
    lessonKey: "functions-with-arrays",
    lessonTitle: "Functions with Arrays",
    totalLevels: 4,
  },
  {
    lessonKey: "final",
    lessonTitle: "Final: Bakunawa Eclipse",
    totalLevels: 1,
  },
];

const DEFAULT_LEVEL_PROGRESS = [];

let orderIndex = 1;

for (const lesson of LESSON_DEFINITIONS) {
  for (let levelNumber = 1; levelNumber <= lesson.totalLevels; levelNumber += 1) {
    DEFAULT_LEVEL_PROGRESS.push({
      levelKey: `${lesson.lessonKey}-level-${levelNumber}`,
      lessonTitle: lesson.lessonTitle,
      orderIndex,
    });
    orderIndex += 1;
  }
}

module.exports = {
  LESSON_DEFINITIONS,
  DEFAULT_LEVEL_PROGRESS,
};
