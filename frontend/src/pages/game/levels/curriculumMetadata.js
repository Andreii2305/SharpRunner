const MODULE_METADATA = Object.freeze({
  tutorial: { moduleName: "Tutorial / Prologue", difficulty: "Beginner", difficultyOrder: 1 },
  arrays: { moduleName: "Arrays", difficulty: "Beginner", difficultyOrder: 1 },
  functions: { moduleName: "Functions and Methods", difficulty: "Intermediate", difficultyOrder: 2 },
  "functions-with-arrays": { moduleName: "Functions with Arrays", difficulty: "Advanced", difficultyOrder: 3 },
  final: { moduleName: "Final Combined Challenge", difficulty: "Advanced", difficultyOrder: 3 },
});

const CURRICULUM_SOURCE = "CodeChum";
const REFERENCE_ACCESS_NOTE = "Restricted to authorized/enrolled CodeChum users.";

export const getCurriculumMetadata = (levelConfig) => {
  const progressKey = levelConfig?.progressKey ?? "";
  const lessonKey = progressKey.replace(/-level-\d+$/, "");
  const module = MODULE_METADATA[lessonKey] ?? {
    moduleName: levelConfig?.lessonTitle ?? "C# Fundamentals",
    difficulty: "Beginner",
    difficultyOrder: 1,
  };

  return {
    levelId: progressKey || null,
    curriculumSource: CURRICULUM_SOURCE,
    moduleName: module.moduleName,
    lessonName: levelConfig?.title ?? null,
    topic: levelConfig?.subtitle ?? levelConfig?.lessonCard?.title ?? null,
    learningObjective: levelConfig?.goal?.description ?? null,
    sharpRunnerLevel: levelConfig?.levelNumber ?? null,
    difficulty: module.difficulty,
    difficultyOrder: module.difficultyOrder,
    referenceUrl: null,
    referenceAccessNote: REFERENCE_ACCESS_NOTE,
  };
};

export const CURRICULUM_REFERENCE_POLICY = Object.freeze({
  curriculumSource: CURRICULUM_SOURCE,
  referenceAccessNote: REFERENCE_ACCESS_NOTE,
});
