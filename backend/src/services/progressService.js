const {
  DEFAULT_LEVEL_PROGRESS,
  LESSON_DEFINITIONS,
} = require("../constants/progressDefaults");
const UserProgress = require("../models/UserProgress");

const LEVEL_KEY_PATTERN = /^(.*)-level-(\d+)$/;
const DEFAULT_LEVEL_KEY_SET = new Set(
  DEFAULT_LEVEL_PROGRESS.map((level) => level.levelKey)
);
const MAX_PLAYER_XP = 1000;
const XP_LEVEL_STEP = 250;
const LESSON_TITLE_BY_KEY = new Map(
  LESSON_DEFINITIONS.map((lesson) => [lesson.lessonKey, lesson.lessonTitle])
);
const LESSON_ORDER_BY_KEY = new Map(
  LESSON_DEFINITIONS.map((lesson, index) => [lesson.lessonKey, index])
);

const parseLevelKey = (levelKey) => {
  const match = LEVEL_KEY_PATTERN.exec(levelKey);
  if (!match) {
    return null;
  }

  const lessonKey = match[1];
  const levelNumber = Number(match[2]);

  if (!lessonKey || !Number.isInteger(levelNumber)) {
    return null;
  }

  return {
    lessonKey,
    levelNumber,
  };
};

const normalizeLevelRows = (rows) =>
  rows
    .filter((row) => DEFAULT_LEVEL_KEY_SET.has(row.levelKey))
    .map((row) => {
      const parsed = parseLevelKey(row.levelKey);

      return {
        id: row.id,
        levelKey: row.levelKey,
        lessonKey: parsed?.lessonKey ?? "unknown",
        lessonTitle:
          LESSON_TITLE_BY_KEY.get(parsed?.lessonKey) ?? row.lessonTitle,
        levelNumber: parsed?.levelNumber ?? null,
        orderIndex: row.orderIndex,
        progressPercent: row.progressPercent,
        isCompleted: row.isCompleted,
        completedAt: row.completedAt,
      };
    });

const computeXpFromTotalPercent = (totalPercent) => {
  const parsed = Number(totalPercent);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(MAX_PLAYER_XP, Math.round(parsed / 4)));
};

const computeXpToNextLevel = (xp) => {
  if (xp >= MAX_PLAYER_XP) {
    return MAX_PLAYER_XP;
  }

  const nextThreshold = Math.ceil((xp + 1) / XP_LEVEL_STEP) * XP_LEVEL_STEP;
  return Math.max(XP_LEVEL_STEP, Math.min(MAX_PLAYER_XP, nextThreshold));
};

const formatCurrentLevelName = (lessonKey, levelNumber) => {
  const lessonOrder = LESSON_ORDER_BY_KEY.get(lessonKey);
  if (!Number.isInteger(lessonOrder) || !Number.isInteger(levelNumber)) {
    return null;
  }

  return `Level ${lessonOrder + 1}-${levelNumber}`;
};

const ensureProgressRowsForUser = async (userId) => {
  const existingRows = await UserProgress.findAll({
    where: { userId },
    attributes: ["levelKey"],
  });

  const existingKeys = new Set(existingRows.map((row) => row.levelKey));
  const missingRows = DEFAULT_LEVEL_PROGRESS.filter(
    (level) => !existingKeys.has(level.levelKey)
  ).map((level) => ({
    userId,
    levelKey: level.levelKey,
    lessonTitle: level.lessonTitle,
    orderIndex: level.orderIndex,
    progressPercent: 0,
    isCompleted: false,
    completedAt: null,
  }));

  if (missingRows.length > 0) {
    await UserProgress.bulkCreate(missingRows);
  }

  const rows = await UserProgress.findAll({
    where: { userId },
    order: [["orderIndex", "ASC"]],
  });

  return rows.filter((row) => DEFAULT_LEVEL_KEY_SET.has(row.levelKey));
};

const buildProgressSummary = (rows, { classRank = null, classSize = null } = {}) => {
  const normalizedRows = normalizeLevelRows(rows);
  const totalLevels = normalizedRows.length;
  const completedLevels = normalizedRows.filter((row) => row.isCompleted).length;
  const totalPercent = normalizedRows.reduce(
    (sum, row) => sum + row.progressPercent,
    0
  );

  const lessonAccumulator = new Map();

  for (const row of normalizedRows) {
    if (!lessonAccumulator.has(row.lessonKey)) {
      lessonAccumulator.set(row.lessonKey, {
        lessonKey: row.lessonKey,
        lessonTitle: row.lessonTitle,
        orderIndex:
          LESSON_ORDER_BY_KEY.get(row.lessonKey) ?? Number.MAX_SAFE_INTEGER,
        completedLevels: 0,
        totalLevels: 0,
        totalPercent: 0,
      });
    }

    const lesson = lessonAccumulator.get(row.lessonKey);
    lesson.totalLevels += 1;
    lesson.totalPercent += row.progressPercent;
    if (row.isCompleted) {
      lesson.completedLevels += 1;
    }
  }

  const lessons = Array.from(lessonAccumulator.values())
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((lesson) => {
      const progressPercent =
        lesson.totalLevels === 0
          ? 0
          : Math.round(lesson.totalPercent / lesson.totalLevels);

      return {
        lessonKey: lesson.lessonKey,
        lessonTitle: lesson.lessonTitle,
        progressPercent,
        completedLevels: lesson.completedLevels,
        totalLevels: lesson.totalLevels,
        isCompleted: lesson.completedLevels === lesson.totalLevels,
      };
    });

  const completedLessons = lessons.filter((lesson) => lesson.isCompleted).length;
  const currentLevelRow =
    normalizedRows.find((row) => !row.isCompleted) ??
    normalizedRows[normalizedRows.length - 1] ??
    null;
  const currentLesson = currentLevelRow?.lessonTitle ?? null;
  const currentLessonKey = currentLevelRow?.lessonKey ?? null;
  const currentLevelKey = currentLevelRow?.levelKey ?? null;
  const currentLevelName = formatCurrentLevelName(
    currentLevelRow?.lessonKey,
    currentLevelRow?.levelNumber
  );
  const overallProgress =
    totalLevels === 0 ? 0 : Math.round(totalPercent / totalLevels);
  const xp = computeXpFromTotalPercent(totalPercent);
  const xpToNextLevel = computeXpToNextLevel(xp);
  const currentLevelHint = currentLevelName
    ? `Continue ${currentLevelName} to keep progressing.`
    : "Open the map to continue your journey.";

  return {
    summary: {
      overallProgress,
      completedLessons,
      totalLessons: lessons.length,
      completedLevels,
      totalLevelsCleared: completedLevels,
      totalLevels,
      currentLesson,
      currentLessonKey,
      currentLevelKey,
      currentLevelName,
      currentLevelHint,
      xp,
      xpToNextLevel,
      classRank,
      classSize,
      totalTimePlayed: null,
      commonMistakes: [],
    },
    lessons: lessons.map((lesson) => ({
      ...lesson,
      levelsCleared: lesson.completedLevels,
      timeSpent: "-",
    })),
    levels: normalizedRows,
  };
};

module.exports = {
  DEFAULT_LEVEL_PROGRESS,
  ensureProgressRowsForUser,
  buildProgressSummary,
  computeXpFromTotalPercent,
};
