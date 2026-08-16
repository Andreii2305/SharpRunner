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

// This is the actual playable route order. The Functions curriculum has 12
// progress rows, but its final game scene covers levels 11 and 12 together.
const PLAYABLE_LEVEL_KEYS = [
  ...Array.from({ length: 5 }, (_, index) => `tutorial-level-${index + 1}`),
  ...Array.from({ length: 8 }, (_, index) => `arrays-level-${index + 1}`),
  ...Array.from({ length: 11 }, (_, index) => `functions-level-${index + 1}`),
  ...Array.from(
    { length: 4 },
    (_, index) => `functions-with-arrays-level-${index + 1}`,
  ),
  "final-level-1",
];

const getPreviousPlayableLevelKey = (levelKey) => {
  const index = PLAYABLE_LEVEL_KEYS.indexOf(levelKey);
  return index > 0 ? PLAYABLE_LEVEL_KEYS[index - 1] : null;
};

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
  PLAYABLE_LEVEL_KEYS,
  getPreviousPlayableLevelKey,
};
