const { Op } = require("sequelize");
const Classroom = require("../models/Classroom");
const ClassroomMembership = require("../models/ClassroomMembership");
const ClassroomLesson = require("../models/ClassroomLesson");
const ClassroomLessonPlacement = require("../models/ClassroomLessonPlacement");
const ClassroomLessonProgress = require("../models/ClassroomLessonProgress");
const ClassroomLessonSubmission = require("../models/ClassroomLessonSubmission");
const LevelContentOverride = require("../models/LevelContentOverride");
const User = require("../models/User");
const UserProgress = require("../models/UserProgress");
const {
  LESSON_DEFINITIONS,
  PLAYABLE_LEVEL_KEYS,
} = require("../constants/progressDefaults");

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DIFFICULTY_SAMPLE = 3;
const ATTENTION_RULES = Object.freeze({
  repeatedFailedAttempts: 5,
  incompleteAttemptCount: 4,
  inactivityDays: 14,
  lowProgressPercent: 25,
  hintDependencyMinimumLevels: 3,
  hintDependencyRate: 0.5,
});

const LESSON_BY_KEY = new Map(
  LESSON_DEFINITIONS.map((lesson) => [lesson.lessonKey, lesson]),
);
const PLAYABLE_LEVEL_KEY_SET = new Set(PLAYABLE_LEVEL_KEYS);
const LEVEL_KEYS_BY_LESSON = new Map(
  LESSON_DEFINITIONS.map((lesson) => [
    lesson.lessonKey,
    PLAYABLE_LEVEL_KEYS.filter((levelKey) => levelKey.startsWith(`${lesson.lessonKey}-level-`)),
  ]),
);
const isNumeric = (value) => value !== null
  && value !== undefined
  && value !== ""
  && Number.isFinite(Number(value));

const round = (value, digits = 1) => {
  if (!isNumeric(value)) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
};

const average = (values, digits = 1) => {
  const finite = values.filter(isNumeric).map(Number);
  return finite.length
    ? round(finite.reduce((sum, value) => sum + value, 0) / finite.length, digits)
    : null;
};

const percent = (numerator, denominator, digits = 1) => (
  denominator > 0 ? round((Number(numerator) / Number(denominator)) * 100, digits) : null
);

const parsePositiveInteger = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseLevelKey = (levelKey) => {
  const match = /^(.*)-level-(\d+)$/.exec(String(levelKey || ""));
  return match ? { lessonKey: match[1], levelNumber: Number(match[2]) } : null;
};

const buildCurriculumEligibility = ({
  classroomIds,
  studentIds,
  membershipsByStudent,
  overrides,
}) => {
  const overrideByClassAndLevel = new Map();
  const overridesByClassroom = new Map(classroomIds.map((classroomId) => [classroomId, []]));
  for (const override of overrides) {
    const classroomId = Number(override.classroomId);
    if (!overridesByClassroom.has(classroomId) || !PLAYABLE_LEVEL_KEY_SET.has(override.levelKey)) continue;
    overrideByClassAndLevel.set(`${classroomId}:${override.levelKey}`, override);
    overridesByClassroom.get(classroomId).push(override);
  }

  const enabledLevelKeysByClassroom = new Map(classroomIds.map((classroomId) => [
    classroomId,
    new Set(PLAYABLE_LEVEL_KEYS.filter(
      (levelKey) => overrideByClassAndLevel.get(`${classroomId}:${levelKey}`)?.isEnabled !== false,
    )),
  ]));
  const enabledLevelKeysByStudent = new Map();
  const dueAtByStudentAndLevel = new Map();
  const displayTitleByLevelKey = new Map();

  for (const levelKey of PLAYABLE_LEVEL_KEYS) {
    const titles = classroomIds
      .map((classroomId) => overrideByClassAndLevel.get(`${classroomId}:${levelKey}`))
      .filter((override) => override?.isEnabled !== false)
      .map((override) => typeof override?.lessonCardTitle === "string"
        ? override.lessonCardTitle.trim() || null
        : null);
    const uniqueTitles = new Set(titles.filter(Boolean));
    if (titles.length && titles.every(Boolean) && uniqueTitles.size === 1) {
      displayTitleByLevelKey.set(levelKey, [...uniqueTitles][0]);
    }
  }

  for (const studentId of studentIds) {
    const enabledLevelKeys = new Set();
    const dueAtByLevelKey = new Map();
    const membershipClassroomIds = membershipsByStudent.get(studentId) || new Set();
    for (const classroomId of membershipClassroomIds) {
      for (const levelKey of enabledLevelKeysByClassroom.get(classroomId) || []) {
        enabledLevelKeys.add(levelKey);
      }
      for (const override of overridesByClassroom.get(classroomId) || []) {
        if (override.isEnabled === false || !override.dueAt) continue;
        const current = dueAtByLevelKey.get(override.levelKey);
        if (!current || new Date(override.dueAt) < new Date(current)) {
          dueAtByLevelKey.set(override.levelKey, override.dueAt);
        }
      }
    }
    enabledLevelKeysByStudent.set(studentId, enabledLevelKeys);
    dueAtByStudentAndLevel.set(studentId, dueAtByLevelKey);
  }

  return { enabledLevelKeysByStudent, dueAtByStudentAndLevel, displayTitleByLevelKey };
};

const validDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const maxDate = (...values) => {
  const dates = values.map(validDate).filter(Boolean);
  return dates.length
    ? new Date(Math.max(...dates.map((date) => date.getTime())))
    : null;
};

const parseAnalyticsFilters = (query = {}, now = new Date()) => {
  const classroomId = query.classroomId && query.classroomId !== "all"
    ? parsePositiveInteger(query.classroomId)
    : null;
  if (query.classroomId && query.classroomId !== "all" && !classroomId) {
    const error = new Error("Invalid classroom filter");
    error.status = 400;
    throw error;
  }

  const datePreset = ["all", "7d", "30d", "custom"].includes(query.datePreset)
    ? query.datePreset
    : "all";
  let startAt = null;
  let endAt = null;
  if (datePreset === "7d" || datePreset === "30d") {
    const days = datePreset === "7d" ? 7 : 30;
    endAt = new Date(now);
    startAt = new Date(endAt.getTime() - days * DAY_MS);
  } else if (datePreset === "custom") {
    startAt = validDate(query.startDate);
    endAt = validDate(query.endDate);
    if (!startAt || !endAt) {
      const error = new Error("Custom date filters require valid startDate and endDate values");
      error.status = 400;
      throw error;
    }
    startAt.setHours(0, 0, 0, 0);
    endAt.setHours(23, 59, 59, 999);
    if (startAt > endAt) {
      const error = new Error("startDate must be on or before endDate");
      error.status = 400;
      throw error;
    }
  }

  return {
    classroomId,
    datePreset,
    startAt,
    endAt,
    lessonId: typeof query.lessonId === "string" && query.lessonId !== "all"
      ? query.lessonId.trim()
      : null,
  };
};

const isWithinWindow = (dateValue, filters) => {
  if (!filters.startAt || !filters.endAt) return true;
  const date = validDate(dateValue);
  return Boolean(date && date >= filters.startAt && date <= filters.endAt);
};

const hasProgressEvidence = (row) => Boolean(
  row?.startedAt
  || row?.isCompleted
  || Number(row?.progressPercent) > 0
  || Number(row?.attemptCount) > 0
  || Number(row?.timeSpentSeconds) > 0
  || row?.hintUsed
  || row?.detailedHintUnlocked,
);

const progressActivityAt = (row) => maxDate(
  row?.startedAt,
  row?.completedAt,
  row?.latestFailureAt,
  row?.hintUsedAt,
  row?.detailedHintPurchasedAt,
  hasProgressEvidence(row) ? row?.updatedAt : null,
);

const progressInWindow = (row, filters) => (
  hasProgressEvidence(row) && isWithinWindow(progressActivityAt(row), filters)
);

const formatDuration = (seconds) => {
  if (!isNumeric(seconds)) return null;
  const total = Math.max(0, Math.round(Number(seconds)));
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (!hours) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
};

const difficultyLabel = (score) => {
  if (!isNumeric(score)) return null;
  if (score >= 67) return "High";
  if (score >= 34) return "Moderate";
  return "Low";
};

/**
 * Difficulty is a transparent, normalized 0-100 composite:
 *   35% failed-attempt rate (failed attempts / all recorded solution attempts)
 *   30% non-completion rate (1 - completed / started)
 *   20% score deficit (1 - average score / 100)
 *   15% hint-use rate (students using any hint / students started)
 * Missing signals are omitted and the remaining weights are re-normalized.
 * A lesson needs at least three starters and at least one recorded attempt or
 * completion; raw time is intentionally not treated as evidence of difficulty.
 */
const calculateDifficulty = ({
  studentsStarted,
  studentsCompleted,
  failedAttempts,
  totalSolutionAttempts,
  averageScore,
  studentsUsingHints,
  hintTrackingAvailable = true,
}) => {
  const started = Math.max(0, Number(studentsStarted) || 0);
  const completed = Math.max(0, Number(studentsCompleted) || 0);
  const failures = Math.max(0, Number(failedAttempts) || 0);
  const attempts = Math.max(0, Number(totalSolutionAttempts) || 0);
  if (started < MIN_DIFFICULTY_SAMPLE || attempts + completed === 0) {
    return { score: null, label: null, sufficientData: false };
  }

  const signals = [
    { weight: 0.35, value: attempts > 0 ? failures / attempts : null },
    { weight: 0.30, value: 1 - Math.min(1, completed / started) },
    {
      weight: 0.20,
      value: isNumeric(averageScore)
        ? 1 - Math.min(100, Math.max(0, Number(averageScore))) / 100
        : null,
    },
    {
      weight: 0.15,
      value: hintTrackingAvailable
        ? Math.min(1, Math.max(0, Number(studentsUsingHints) || 0) / started)
        : null,
    },
  ].filter((signal) => Number.isFinite(signal.value));
  const availableWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
  if (!availableWeight) return { score: null, label: null, sufficientData: false };
  const score = round(
    (signals.reduce((sum, signal) => sum + signal.value * signal.weight, 0)
      / availableWeight) * 100,
    1,
  );
  return { score, label: difficultyLabel(score), sufficientData: true };
};

const hasSolutionAttempt = (row) => Boolean(
  row && (Number(row.attemptCount) > 0 || row.isCompleted),
);

const FAILURE_CATEGORY_LABELS = Object.freeze({
  compilation: "Compilation",
  syntax: "Syntax",
  wrong_logic: "Incorrect logic",
  incorrect_output: "Incorrect output",
  structure_requirement: "Required code structure",
  incomplete_solution: "Incomplete solution",
  unknown: "Unknown",
});

const readableFailureValue = (value, fallback = "Unknown") => {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  const words = normalized.toLowerCase().replace(/[_-]+/g, " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};

const failureCategoryLabel = (category) => (
  FAILURE_CATEGORY_LABELS[category] || readableFailureValue(category)
);

const buildFailureSignal = ({ row, lesson, filters }) => {
  if (!row?.latestFailureAt || (!row.latestFailureCategory && !row.latestFailureCode)) return null;
  if (!isWithinWindow(row.latestFailureAt, filters)) return null;
  const parsed = parseLevelKey(row.levelKey);
  const category = row.latestFailureCategory || "unknown";
  const code = row.latestFailureCode || "UNKNOWN";
  return {
    studentId: Number(row.userId),
    lessonId: `curriculum:${lesson.lessonKey}`,
    lessonKey: lesson.lessonKey,
    lessonTitle: lesson.lessonTitle,
    levelKey: row.levelKey,
    levelNumber: parsed?.levelNumber ?? null,
    levelTitle: parsed?.levelNumber ? `Level ${parsed.levelNumber}` : row.levelKey,
    category,
    categoryLabel: failureCategoryLabel(category),
    code,
    codeLabel: readableFailureValue(code),
    latestOccurrence: validDate(row.latestFailureAt),
    resolution: row.isCompleted ? "completed_after_failure" : "unresolved",
  };
};

const aggregateFailureSignalGroup = (signals) => {
  const categoryMap = new Map();
  const affectedStudentIds = new Set();
  const affectedLevelKeys = new Set();
  const affectedLessonIds = new Set();
  let latestOccurrence = null;

  for (const signal of signals) {
    affectedStudentIds.add(signal.studentId);
    affectedLevelKeys.add(signal.levelKey);
    affectedLessonIds.add(signal.lessonId);
    latestOccurrence = maxDate(latestOccurrence, signal.latestOccurrence);
    if (!categoryMap.has(signal.category)) {
      categoryMap.set(signal.category, {
        category: signal.category,
        label: signal.categoryLabel,
        signalCount: 0,
        studentIds: new Set(),
        levelKeys: new Set(),
        lessonIds: new Set(),
        latestOccurrence: null,
        codeMap: new Map(),
        levelMap: new Map(),
      });
    }
    const category = categoryMap.get(signal.category);
    category.signalCount += 1;
    category.studentIds.add(signal.studentId);
    category.levelKeys.add(signal.levelKey);
    category.lessonIds.add(signal.lessonId);
    category.latestOccurrence = maxDate(category.latestOccurrence, signal.latestOccurrence);

    if (!category.codeMap.has(signal.code)) {
      category.codeMap.set(signal.code, {
        code: signal.code,
        label: signal.codeLabel,
        studentIds: new Set(),
        levelKeys: new Set(),
        latestOccurrence: null,
      });
    }
    const code = category.codeMap.get(signal.code);
    code.studentIds.add(signal.studentId);
    code.levelKeys.add(signal.levelKey);
    code.latestOccurrence = maxDate(code.latestOccurrence, signal.latestOccurrence);

    if (!category.levelMap.has(signal.levelKey)) {
      category.levelMap.set(signal.levelKey, {
        levelKey: signal.levelKey,
        levelNumber: signal.levelNumber,
        title: signal.levelTitle,
        lessonId: signal.lessonId,
        lessonTitle: signal.lessonTitle,
        studentIds: new Set(),
        latestOccurrence: null,
      });
    }
    const level = category.levelMap.get(signal.levelKey);
    level.studentIds.add(signal.studentId);
    level.latestOccurrence = maxDate(level.latestOccurrence, signal.latestOccurrence);
  }

  const categories = [...categoryMap.values()].map((category) => {
    const codes = [...category.codeMap.values()].map((code) => ({
      code: code.code,
      label: code.label,
      affectedStudents: code.studentIds.size,
      affectedLevels: code.levelKeys.size,
      latestOccurrence: code.latestOccurrence,
    })).sort((left, right) => right.affectedStudents - left.affectedStudents || left.label.localeCompare(right.label));
    const levels = [...category.levelMap.values()].map((level) => ({
      levelKey: level.levelKey,
      levelNumber: level.levelNumber,
      title: level.title,
      lessonId: level.lessonId,
      lessonTitle: level.lessonTitle,
      affectedStudents: level.studentIds.size,
      latestOccurrence: level.latestOccurrence,
    })).sort((left, right) => right.affectedStudents - left.affectedStudents
      || left.lessonTitle.localeCompare(right.lessonTitle)
      || (left.levelNumber ?? 0) - (right.levelNumber ?? 0));
    return {
      category: category.category,
      label: category.label,
      signalCount: category.signalCount,
      affectedStudents: category.studentIds.size,
      affectedLevels: category.levelKeys.size,
      affectedLessons: category.lessonIds.size,
      latestOccurrence: category.latestOccurrence,
      mostAffected: levels[0] || null,
      codes,
      levels,
    };
  }).sort((left, right) => right.affectedStudents - left.affectedStudents
    || right.signalCount - left.signalCount
    || left.label.localeCompare(right.label));

  return {
    signalCount: signals.length,
    affectedStudents: affectedStudentIds.size,
    affectedLevels: affectedLevelKeys.size,
    affectedLessons: affectedLessonIds.size,
    latestOccurrence,
    categories,
  };
};

const buildFailurePatterns = (signals) => ({
  semantics: "One latest recorded signal per applicable student-level; counts are not historical error frequency.",
  unresolved: aggregateFailureSignalGroup(
    signals.filter((signal) => signal.resolution === "unresolved"),
  ),
  completedAfterFailure: aggregateFailureSignalGroup(
    signals.filter((signal) => signal.resolution === "completed_after_failure"),
  ),
});

const summarizeFailureSignals = (signals) => {
  const grouped = buildFailurePatterns(signals);
  const categories = new Map();
  for (const [key, group] of [["unresolved", grouped.unresolved], ["completedAfterFailure", grouped.completedAfterFailure]]) {
    for (const category of group.categories) {
      if (!categories.has(category.category)) {
        categories.set(category.category, {
          category: category.category,
          label: category.label,
          unresolvedAffectedStudents: 0,
          completedAfterFailureStudents: 0,
          latestOccurrence: null,
        });
      }
      const item = categories.get(category.category);
      if (key === "unresolved") item.unresolvedAffectedStudents = category.affectedStudents;
      else item.completedAfterFailureStudents = category.affectedStudents;
      item.latestOccurrence = maxDate(item.latestOccurrence, category.latestOccurrence);
    }
  }
  return {
    unresolvedAffectedStudents: grouped.unresolved.affectedStudents,
    completedAfterFailureStudents: grouped.completedAfterFailure.affectedStudents,
    latestOccurrence: maxDate(
      grouped.unresolved.latestOccurrence,
      grouped.completedAfterFailure.latestOccurrence,
    ),
    categories: [...categories.values()].sort((left, right) => (
      right.unresolvedAffectedStudents - left.unresolvedAffectedStudents
      || right.completedAfterFailureStudents - left.completedAfterFailureStudents
      || left.label.localeCompare(right.label)
    )),
  };
};

const buildLearningFunnel = (studentStates) => {
  const applicable = studentStates.filter((state) => state.applicable).length;
  const started = studentStates.filter((state) => state.started).length;
  const attempted = studentStates.filter((state) => state.attempted).length;
  const completed = studentStates.filter((state) => state.completed).length;
  return {
    applicable,
    started,
    startedRate: percent(started, applicable),
    attempted,
    attemptedRate: percent(attempted, applicable),
    completed,
    completionRate: percent(completed, applicable),
    startedFromApplicable: percent(started, applicable),
    attemptedFromStarted: percent(attempted, started),
    completedFromAttempted: percent(completed, attempted),
  };
};

const buildCurriculumLevelMetric = ({
  lesson,
  levelKey,
  eligibleStudentIds,
  enabledLevelKeysByStudent,
  rowByStudentAndLevel,
  displayTitleByLevelKey,
  filters,
}) => {
  const parsed = parseLevelKey(levelKey);
  const title = displayTitleByLevelKey.get(levelKey) || `Level ${parsed?.levelNumber ?? ""}`.trim();
  const states = eligibleStudentIds.map((studentId) => {
    const applicable = (enabledLevelKeysByStudent.get(studentId) || new Set()).has(levelKey);
    const row = applicable ? rowByStudentAndLevel.get(`${studentId}:${levelKey}`) : null;
    const activeRow = row && progressInWindow(row, filters) ? row : null;
    return {
      studentId,
      applicable,
      row,
      started: Boolean(activeRow && hasProgressEvidence(activeRow)),
      attempted: Boolean(activeRow && hasSolutionAttempt(activeRow)),
      completed: Boolean(activeRow?.isCompleted),
    };
  });
  const applicableStates = states.filter((state) => state.applicable);
  if (!applicableStates.length) return null;
  const startedStates = applicableStates.filter((state) => state.started);
  const attemptedStates = applicableStates.filter((state) => state.attempted);
  const completedStates = applicableStates.filter((state) => state.completed);
  const attemptValues = attemptedStates.map((state) => (
    Math.max(0, Number(state.row.attemptCount) || 0) + (state.row.isCompleted ? 1 : 0)
  ));
  const failedAttemptValues = attemptedStates.map(
    (state) => Math.max(0, Number(state.row.attemptCount) || 0),
  );
  const scoreValues = completedStates
    .filter((state) => isNumeric(state.row.finalScore))
    .map((state) => Number(state.row.finalScore));
  const activeTimes = startedStates
    .map((state) => Number(state.row.timeSpentSeconds) || 0)
    .filter((seconds) => seconds > 0);
  const hintStates = startedStates.filter((state) => state.row.hintUsed);
  const totalFailedAttempts = failedAttemptValues.reduce((sum, value) => sum + value, 0);
  const totalSolutionAttempts = attemptValues.reduce((sum, value) => sum + value, 0);
  const averageScore = average(scoreValues);
  const failureSignals = applicableStates
    .map((state) => state.row ? buildFailureSignal({ row: state.row, lesson, filters }) : null)
    .filter(Boolean);

  return {
    levelKey,
    levelNumber: parsed?.levelNumber ?? null,
    order: PLAYABLE_LEVEL_KEYS.indexOf(levelKey) + 1,
    title,
    displayTitle: displayTitleByLevelKey.get(levelKey) || null,
    applicableStudents: applicableStates.length,
    studentsStarted: startedStates.length,
    studentsAttempted: attemptedStates.length,
    studentsCompleted: completedStates.length,
    startRate: percent(startedStates.length, applicableStates.length),
    attemptRate: percent(attemptedStates.length, applicableStates.length),
    completionRate: percent(completedStates.length, startedStates.length),
    averageScore,
    averageAttempts: average(attemptValues),
    averageFailedAttempts: average(failedAttemptValues),
    totalFailedAttempts,
    averageActiveSeconds: average(activeTimes, 0),
    averageActiveTimeLabel: formatDuration(average(activeTimes, 0)),
    hintUsageRate: percent(hintStates.length, startedStates.length),
    basicHintUsers: hintStates.filter((state) => state.row.hintType === "basic").length,
    purchasedHintUsers: startedStates.filter(
      (state) => state.row.detailedHintUnlocked || state.row.hintType === "detailed",
    ).length,
    firstAttemptSuccessRate: percent(
      completedStates.filter((state) => (Number(state.row.attemptCount) || 0) === 0).length,
      completedStates.length,
    ),
    difficulty: calculateDifficulty({
      studentsStarted: startedStates.length,
      studentsCompleted: completedStates.length,
      failedAttempts: totalFailedAttempts,
      totalSolutionAttempts,
      averageScore,
      studentsUsingHints: hintStates.length,
    }),
    failurePatterns: summarizeFailureSignals(failureSignals),
    failureSignals,
  };
};

const buildCurriculumLessonMetric = ({
  lesson,
  rows,
  eligibleStudentIds,
  enabledLevelKeysByStudent,
  displayTitleByLevelKey,
  filters,
}) => {
  const lessonLevelKeys = LEVEL_KEYS_BY_LESSON.get(lesson.lessonKey) || [];
  const lessonLevelKeySet = new Set(lessonLevelKeys);
  const lessonRows = rows.filter((row) => lessonLevelKeySet.has(row.levelKey));
  const byStudent = new Map();
  const rowByStudentAndLevel = new Map();
  for (const row of lessonRows) {
    const studentId = Number(row.userId);
    if (!byStudent.has(studentId)) byStudent.set(studentId, []);
    byStudent.get(studentId).push(row);
    rowByStudentAndLevel.set(`${studentId}:${row.levelKey}`, row);
  }

  const studentStates = eligibleStudentIds.map((studentId) => {
    const enabledLevelKeys = enabledLevelKeysByStudent.get(studentId) || new Set();
    const applicableLevelKeys = lessonLevelKeys.filter((levelKey) => enabledLevelKeys.has(levelKey));
    const applicableLevelKeySet = new Set(applicableLevelKeys);
    const allRows = (byStudent.get(studentId) || []).filter(
      (row) => applicableLevelKeySet.has(row.levelKey),
    );
    const activeRows = allRows.filter((row) => progressInWindow(row, filters));
    const expectedLevels = applicableLevelKeys.length;
    const applicable = expectedLevels > 0;
    const started = applicable && activeRows.some(hasProgressEvidence);
    const attempted = applicable && activeRows.some(hasSolutionAttempt);
    const completedLevels = activeRows.filter((row) => row.isCompleted).length;
    const totalProgress = activeRows.reduce((sum, row) => sum + (Number(row.progressPercent) || 0), 0);
    const failedAttempts = activeRows.reduce((sum, row) => sum + Math.max(0, Number(row.attemptCount) || 0), 0);
    const completionAttempts = activeRows.filter((row) => row.isCompleted).length;
    return {
      studentId,
      applicable,
      started,
      attempted,
      completed: applicable && started && completedLevels >= expectedLevels,
      completedLevels,
      expectedLevels,
      progressPercent: applicable
        ? started ? round(totalProgress / expectedLevels, 1) : 0
        : null,
      failedAttempts,
      totalAttempts: failedAttempts + completionAttempts,
      attemptValues: activeRows
        .filter((row) => row.isCompleted || Number(row.attemptCount) > 0)
        .map((row) => Math.max(0, Number(row.attemptCount) || 0) + (row.isCompleted ? 1 : 0)),
      failedAttemptValues: activeRows
        .filter((row) => row.isCompleted || Number(row.attemptCount) > 0)
        .map((row) => Math.max(0, Number(row.attemptCount) || 0)),
      scoreValues: activeRows.filter((row) => row.isCompleted && isNumeric(row.finalScore)).map((row) => Number(row.finalScore)),
      activeSeconds: activeRows.reduce((sum, row) => sum + Math.max(0, Number(row.timeSpentSeconds) || 0), 0),
      hintUsed: activeRows.some((row) => row.hintUsed),
      basicHintUsed: activeRows.some((row) => row.hintUsed && row.hintType === "basic"),
      purchasedHintUsed: activeRows.some((row) => row.detailedHintUnlocked || row.hintType === "detailed"),
      attemptsBeforeHint: activeRows.filter((row) => isNumeric(row.attemptCountAtHintUnlock)).map((row) => Number(row.attemptCountAtHintUnlock)),
      lastActivityAt: maxDate(...activeRows.map(progressActivityAt)),
      rows: activeRows,
    };
  });

  const internalLevelMetrics = lessonLevelKeys.map((levelKey) => buildCurriculumLevelMetric({
    lesson,
    levelKey,
    eligibleStudentIds,
    enabledLevelKeysByStudent,
    rowByStudentAndLevel,
    displayTitleByLevelKey,
    filters,
  })).filter(Boolean);
  const failureSignals = internalLevelMetrics.flatMap((level) => level.failureSignals);
  const levels = internalLevelMetrics.map(({ failureSignals: _failureSignals, ...level }) => level);

  const applicableStates = studentStates.filter((state) => state.applicable);
  const startedStates = studentStates.filter((state) => state.started);
  const completedStates = startedStates.filter((state) => state.completed);
  const scoreValues = startedStates.flatMap((state) => state.scoreValues);
  const failedAttempts = startedStates.reduce((sum, state) => sum + state.failedAttempts, 0);
  const totalAttempts = startedStates.reduce((sum, state) => sum + state.totalAttempts, 0);
  const attemptValues = startedStates.flatMap((state) => state.attemptValues);
  const failedAttemptValues = startedStates.flatMap((state) => state.failedAttemptValues);
  const studentsUsingHints = startedStates.filter((state) => state.hintUsed).length;
  const averageScore = average(scoreValues);
  const difficulty = calculateDifficulty({
    studentsStarted: startedStates.length,
    studentsCompleted: completedStates.length,
    failedAttempts,
    totalSolutionAttempts: totalAttempts,
    averageScore,
    studentsUsingHints,
  });

  return {
    id: `curriculum:${lesson.lessonKey}`,
    source: "curriculum",
    lessonKey: lesson.lessonKey,
    lessonId: null,
    classroomId: filters.classroomId,
    title: lesson.lessonTitle,
    available: applicableStates.length > 0,
    eligibleStudents: eligibleStudentIds.length,
    applicableStudents: applicableStates.length,
    studentsStarted: startedStates.length,
    studentsCompleted: completedStates.length,
    completionRate: percent(completedStates.length, startedStates.length),
    averageProgress: average(startedStates.map((state) => state.progressPercent)),
    averageScore,
    averageAttempts: average(attemptValues),
    averageFailedAttempts: average(failedAttemptValues),
    failedAttempts,
    averageActiveSeconds: average(startedStates.filter((state) => state.activeSeconds > 0).map((state) => state.activeSeconds), 0),
    averageActiveTimeLabel: formatDuration(average(startedStates.filter((state) => state.activeSeconds > 0).map((state) => state.activeSeconds), 0)),
    hintUsageRate: percent(studentsUsingHints, startedStates.length),
    studentsUsingHints,
    basicHintUsers: startedStates.filter((state) => state.basicHintUsed).length,
    purchasedHintUsers: startedStates.filter((state) => state.purchasedHintUsed).length,
    averageAttemptsBeforeHint: average(startedStates.flatMap((state) => state.attemptsBeforeHint)),
    completedAfterHint: startedStates.filter((state) => state.hintUsed && state.completed).length,
    totalSolutionAttempts: totalAttempts,
    firstAttemptCompletions: completedStates.filter((state) => state.failedAttempts === 0).length,
    difficulty,
    funnel: buildLearningFunnel(studentStates),
    levels,
    failurePatterns: summarizeFailureSignals(failureSignals),
    failureSignals,
    studentStates,
    activityRows: studentStates.flatMap((state) => state.rows),
    tracking: {
      score: true,
      failedAttempts: true,
      activeTime: true,
      hints: true,
    },
  };
};

const normalizeCustomScore = (submission, lesson) => {
  if (!isNumeric(submission?.grade)) return null;
  const maxScore = Math.max(1, Number(lesson?.maxScore) || 100);
  return round(Math.min(100, Math.max(0, (Number(submission.grade) / maxScore) * 100)), 1);
};

const buildCustomLessonMetric = ({
  entry,
  studentIds,
  progressRows,
  submissions,
  filters,
  classroomName,
  showClassroomName,
}) => {
  const lesson = entry.lesson;
  const assignedIds = Array.isArray(lesson.assignedStudentIds)
    ? new Set(lesson.assignedStudentIds.map(Number))
    : new Set();
  const eligibleStudentIds = assignedIds.size
    ? studentIds.filter((id) => assignedIds.has(Number(id)))
    : studentIds;
  const progressByStudent = new Map(
    progressRows
      .filter((row) => Number(row.classroomId) === Number(entry.classroomId) && Number(row.lessonId) === Number(lesson.id))
      .map((row) => [Number(row.studentId), row]),
  );
  const submissionByStudent = new Map(
    submissions
      .filter((row) => Number(row.classroomId) === Number(entry.classroomId) && Number(row.lessonId) === Number(lesson.id))
      .map((row) => [Number(row.studentId), row]),
  );
  const isAssignment = lesson.contentType === "assignment";
  const states = eligibleStudentIds.map((studentId) => {
    const progress = progressByStudent.get(Number(studentId));
    const submission = submissionByStudent.get(Number(studentId));
    const activityAt = maxDate(
      progress?.viewedAt,
      progress?.completedAt,
      submission?.submittedAt,
      submission?.gradedAt,
    );
    const inWindow = isWithinWindow(activityAt, filters);
    const started = inWindow && Boolean(progress?.viewedAt || submission?.submittedAt);
    const completed = started && Boolean(isAssignment ? submission?.submittedAt : progress?.completedAt);
    return {
      studentId,
      started,
      completed,
      completedLevels: completed ? 1 : 0,
      expectedLevels: 1,
      progressPercent: completed ? 100 : started ? 50 : 0,
      failedAttempts: null,
      totalAttempts: started && isAssignment ? Math.max(1, Number(submission?.attemptCount) || 1) : null,
      attemptValues: started && isAssignment ? [Math.max(1, Number(submission?.attemptCount) || 1)] : [],
      failedAttemptValues: [],
      scoreValues: started ? [normalizeCustomScore(submission, lesson)].filter(Number.isFinite) : [],
      activeSeconds: null,
      hintUsed: null,
      lastActivityAt: started ? activityAt : null,
      rows: [],
    };
  });
  const started = states.filter((state) => state.started);
  const completed = started.filter((state) => state.completed);
  const scores = started.flatMap((state) => state.scoreValues);
  const attempts = started.map((state) => state.totalAttempts).filter(Number.isFinite);

  return {
    id: `custom:${entry.classroomId}:${lesson.id}`,
    source: "classroom",
    lessonKey: null,
    lessonId: lesson.id,
    classroomId: entry.classroomId,
    title: showClassroomName ? `${lesson.title} · ${classroomName}` : lesson.title,
    eligibleStudents: eligibleStudentIds.length,
    studentsStarted: started.length,
    studentsCompleted: completed.length,
    completionRate: percent(completed.length, started.length),
    averageProgress: average(started.map((state) => state.progressPercent)),
    averageScore: average(scores),
    averageAttempts: average(attempts),
    averageFailedAttempts: null,
    failedAttempts: null,
    averageActiveSeconds: null,
    averageActiveTimeLabel: null,
    hintUsageRate: null,
    studentsUsingHints: null,
    basicHintUsers: null,
    purchasedHintUsers: null,
    averageAttemptsBeforeHint: null,
    completedAfterHint: null,
    totalSolutionAttempts: attempts.reduce((sum, value) => sum + value, 0),
    firstAttemptCompletions: isAssignment
      ? completed.filter((state) => state.totalAttempts === 1).length
      : null,
    difficulty: { score: null, label: null, sufficientData: false },
    studentStates: states,
    activityRows: [],
    tracking: {
      score: isAssignment,
      failedAttempts: false,
      activeTime: false,
      hints: false,
    },
  };
};

const studentHeatmapState = (state) => {
  if (state?.applicable === false) return { key: "unavailable", label: "Unavailable" };
  if (!state?.started) return { key: "not_started", label: "Not started" };
  if (state.completed) return { key: "completed", label: "Completed" };
  if ((state.failedAttempts ?? 0) >= 4) return { key: "high", label: "High difficulty" };
  if ((state.failedAttempts ?? 0) >= 2 || state.hintUsed) return { key: "moderate", label: "Moderate difficulty" };
  return { key: "healthy", label: "Healthy progress" };
};

const scoreDistribution = (scores) => {
  const ranges = [
    { key: "90-100", label: "90–100", min: 90, max: 100 },
    { key: "80-89", label: "80–89", min: 80, max: 89.999 },
    { key: "70-79", label: "70–79", min: 70, max: 79.999 },
    { key: "60-69", label: "60–69", min: 60, max: 69.999 },
    { key: "below-60", label: "Below 60", min: -Infinity, max: 59.999 },
  ];
  return ranges.map((range) => ({
    key: range.key,
    label: range.label,
    count: scores.filter((score) => score >= range.min && score <= range.max).length,
  }));
};

const dateKey = (dateValue) => {
  const date = validDate(dateValue);
  return date ? date.toISOString().slice(0, 10) : null;
};

const buildActivity = (progressRows, filters) => {
  const dayMap = new Map();
  const recent = [];
  const addDay = (date, field, studentId) => {
    if (!date || !isWithinWindow(date, filters)) return;
    const key = dateKey(date);
    if (!dayMap.has(key)) dayMap.set(key, { date: key, activeStudentIds: new Set(), completions: 0 });
    const day = dayMap.get(key);
    if (studentId) day.activeStudentIds.add(studentId);
    if (field === "completion") day.completions += 1;
  };
  for (const row of progressRows) {
    if (row.startedAt) addDay(row.startedAt, "start", row.userId);
    if (row.completedAt) addDay(row.completedAt, "completion", row.userId);
    const activityAt = progressActivityAt(row);
    if (activityAt && isWithinWindow(activityAt, filters)) {
      const parsed = parseLevelKey(row.levelKey);
      recent.push({
        studentId: Number(row.userId),
        lessonId: `curriculum:${parsed?.lessonKey}`,
        levelKey: row.levelKey,
        occurredAt: activityAt,
        type: row.isCompleted ? "completion" : Number(row.attemptCount) > 0 ? "attempt" : "activity",
      });
    }
  }
  return {
    byDay: [...dayMap.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((day) => ({ date: day.date, activeStudents: day.activeStudentIds.size, completions: day.completions })),
    recent: recent.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)).slice(0, 20),
    unavailableMetrics: [
      "Attempts by day (only cumulative failed-attempt totals are stored)",
      "Active learning time by day (only cumulative confirmed active time is stored)",
    ],
  };
};

const buildAttentionReasons = ({ student, states, dueAtByLevelKey, now }) => {
  const reasons = [];
  for (const state of states) {
    if (!state.started || state.completed || !state.lessonTitle) continue;
    if ((state.failedAttempts || 0) >= ATTENTION_RULES.repeatedFailedAttempts) {
      reasons.push(`${state.failedAttempts} failed attempts in ${state.lessonTitle}; not yet completed.`);
    } else if ((state.totalAttempts || 0) >= ATTENTION_RULES.incompleteAttemptCount) {
      reasons.push(`${state.totalAttempts} attempts in ${state.lessonTitle}; not yet completed.`);
    }
  }
  const progressStates = states.filter((state) => state.started);
  const overallProgress = average(progressStates.map((state) => state.progressPercent)) ?? 0;
  if (progressStates.length && overallProgress <= ATTENTION_RULES.lowProgressPercent) {
    reasons.push(`Current progress is ${round(overallProgress, 0)}% across started work.`);
  }
  const hintStates = progressStates.filter((state) => state.hintUsed != null);
  const hintRate = hintStates.length ? hintStates.filter((state) => state.hintUsed).length / hintStates.length : 0;
  if (hintStates.length >= ATTENTION_RULES.hintDependencyMinimumLevels && hintRate >= ATTENTION_RULES.hintDependencyRate) {
    reasons.push(`Hints were used in ${round(hintRate * 100, 0)}% of started lessons.`);
  }
  const lastActivityAt = maxDate(...states.map((state) => state.lastActivityAt));
  if (lastActivityAt && now - lastActivityAt >= ATTENTION_RULES.inactivityDays * DAY_MS) {
    reasons.push(`No recorded learning activity for ${Math.floor((now - lastActivityAt) / DAY_MS)} days.`);
  }
  for (const state of states) {
    if (state.completed || !state.rows?.length) continue;
    const overdue = state.rows.some((row) => {
      const dueAt = dueAtByLevelKey.get(row.levelKey);
      return dueAt && new Date(dueAt) < now;
    });
    if (overdue) {
      reasons.push(`${state.lessonTitle} has unfinished work past its class due date.`);
    }
  }
  return [...new Set(reasons)];
};

const getTeacherAnalytics = async ({ req, query = {}, now = new Date() }) => {
  const filters = parseAnalyticsFilters(query, now);
  const teacherId = req.userRole === "admin"
    ? parsePositiveInteger(query.teacherId)
    : req.userId;
  const classroomWhere = teacherId ? { teacherId } : {};
  const availableClassrooms = await Classroom.findAll({
    where: { ...classroomWhere, isActive: true },
    attributes: ["id", "className", "section", "teacherId", "isActive"],
    order: [["className", "ASC"]],
  });
  if (filters.classroomId && !availableClassrooms.some((item) => Number(item.id) === filters.classroomId)) {
    const error = new Error("Classroom is not available to this teacher");
    error.status = 403;
    throw error;
  }
  const classrooms = filters.classroomId
    ? availableClassrooms.filter((item) => Number(item.id) === filters.classroomId)
    : availableClassrooms;
  const classroomIds = classrooms.map((item) => Number(item.id));
  if (!classroomIds.length) {
    return emptyAnalyticsPayload({ filters, availableClassrooms });
  }

  const memberships = await ClassroomMembership.findAll({
    where: { classroomId: { [Op.in]: classroomIds }, status: "active" },
    attributes: ["classroomId", "studentId", "joinedAt"],
  });
  const requestedStudentId = parsePositiveInteger(query.studentId);
  const scopedMemberships = requestedStudentId
    ? memberships.filter((row) => Number(row.studentId) === requestedStudentId)
    : memberships;
  if (requestedStudentId && !scopedMemberships.length) {
    const error = new Error("Student is not an active member of the selected classroom scope");
    error.status = 403;
    throw error;
  }
  const candidateStudentIds = [...new Set(scopedMemberships.map((row) => Number(row.studentId)))];
  const students = candidateStudentIds.length ? await User.findAll({
    where: { id: { [Op.in]: candidateStudentIds }, role: "student", status: "active" },
    attributes: ["id", "firstName", "lastName", "username", "status", "createdAt", "updatedAt"],
  }) : [];
  const studentIds = students.map((student) => Number(student.id));
  const studentIdSet = new Set(studentIds);
  const validMemberships = scopedMemberships.filter((row) => studentIdSet.has(Number(row.studentId)));

  const [progressRows, overrides, placements, directLessons] = await Promise.all([
    studentIds.length ? UserProgress.findAll({
      where: { userId: { [Op.in]: studentIds }, levelKey: { [Op.in]: PLAYABLE_LEVEL_KEYS } },
      attributes: [
        "userId", "levelKey", "progressPercent", "isCompleted", "completedAt", "attemptCount",
        "timeSpentSeconds", "finalScore", "startedAt", "hintUsed", "hintUsedAt", "hintType",
        "attemptCountAtHintUnlock", "detailedHintUnlocked", "detailedHintPurchasedAt",
        "latestFailureCode", "latestFailureCategory", "latestFailureAt",
        "latestFailureAttemptCount", "updatedAt",
      ],
    }) : [],
    LevelContentOverride.findAll({
      where: { classroomId: { [Op.in]: classroomIds } },
      attributes: ["classroomId", "levelKey", "lessonCardTitle", "isEnabled", "dueAt"],
    }),
    ClassroomLessonPlacement.findAll({
      where: { classroomId: { [Op.in]: classroomIds } },
      attributes: ["classroomId", "lessonId", "moduleId", "displayOrder"],
    }),
    ClassroomLesson.findAll({
      where: { classroomId: { [Op.in]: classroomIds }, archivedAt: null },
      attributes: ["id", "classroomId", "title", "contentType", "maxScore", "assignedStudentIds", "dueAt", "isPublished", "archivedAt"],
    }),
  ]);

  const placedLessonIds = [...new Set(placements.map((row) => Number(row.lessonId)))];
  const placedLessons = placedLessonIds.length ? await ClassroomLesson.findAll({
    where: { id: { [Op.in]: placedLessonIds }, archivedAt: null },
    attributes: ["id", "classroomId", "title", "contentType", "maxScore", "assignedStudentIds", "dueAt", "isPublished", "archivedAt"],
  }) : [];
  const placedLessonById = new Map(placedLessons.map((lesson) => [Number(lesson.id), lesson]));
  const customEntries = [];
  const seenCustom = new Set();
  for (const placement of placements) {
    const lesson = placedLessonById.get(Number(placement.lessonId));
    if (!lesson || lesson.contentType !== "lesson") continue;
    const key = `${placement.classroomId}:${lesson.id}`;
    if (!seenCustom.has(key)) {
      seenCustom.add(key);
      customEntries.push({ classroomId: Number(placement.classroomId), lesson });
    }
  }
  for (const lesson of directLessons) {
    if (lesson.contentType === "module") continue;
    const key = `${lesson.classroomId}:${lesson.id}`;
    if (!seenCustom.has(key)) {
      seenCustom.add(key);
      customEntries.push({ classroomId: Number(lesson.classroomId), lesson });
    }
  }

  const customLessonIds = [...new Set(customEntries.map((entry) => Number(entry.lesson.id)))];
  const [customProgressRows, submissions] = await Promise.all([
    customLessonIds.length && studentIds.length ? ClassroomLessonProgress.findAll({
      where: {
        classroomId: { [Op.in]: classroomIds },
        lessonId: { [Op.in]: customLessonIds },
        studentId: { [Op.in]: studentIds },
      },
      attributes: ["classroomId", "lessonId", "studentId", "viewedAt", "completedAt", "updatedAt"],
    }) : [],
    customLessonIds.length && studentIds.length ? ClassroomLessonSubmission.findAll({
      where: {
        classroomId: { [Op.in]: classroomIds },
        lessonId: { [Op.in]: customLessonIds },
        studentId: { [Op.in]: studentIds },
      },
      attributes: ["classroomId", "lessonId", "studentId", "submittedAt", "grade", "gradedAt", "attemptCount", "status"],
    }) : [],
  ]);

  const membershipsByStudent = new Map();
  const studentIdsByClassroom = new Map(classroomIds.map((id) => [id, new Set()]));
  for (const membership of validMemberships) {
    const studentId = Number(membership.studentId);
    const classroomId = Number(membership.classroomId);
    if (!membershipsByStudent.has(studentId)) membershipsByStudent.set(studentId, new Set());
    membershipsByStudent.get(studentId).add(classroomId);
    studentIdsByClassroom.get(classroomId)?.add(studentId);
  }
  const {
    enabledLevelKeysByStudent,
    dueAtByStudentAndLevel,
    displayTitleByLevelKey,
  } = buildCurriculumEligibility({
    classroomIds,
    studentIds,
    membershipsByStudent,
    overrides,
  });

  const curriculumMetrics = LESSON_DEFINITIONS.map((lesson) => buildCurriculumLessonMetric({
    lesson,
    rows: progressRows,
    eligibleStudentIds: studentIds,
    enabledLevelKeysByStudent,
    displayTitleByLevelKey,
    filters,
  }));
  const classroomById = new Map(classrooms.map((item) => [Number(item.id), item]));
  const customMetrics = customEntries.map((entry) => buildCustomLessonMetric({
    entry,
    studentIds: [...(studentIdsByClassroom.get(entry.classroomId) || new Set())],
    progressRows: customProgressRows,
    submissions,
    filters,
    classroomName: classroomById.get(entry.classroomId)?.className || "Classroom",
    showClassroomName: classrooms.length > 1,
  }));
  const allLessonPerformance = [...curriculumMetrics, ...customMetrics];
  if (filters.lessonId && !allLessonPerformance.some((lesson) => lesson.id === filters.lessonId)) {
    const error = new Error("Lesson is not available in the selected teacher scope");
    error.status = 403;
    throw error;
  }
  let lessonPerformance = allLessonPerformance;
  if (filters.lessonId) lessonPerformance = lessonPerformance.filter((lesson) => lesson.id === filters.lessonId);

  const statesByStudent = new Map(studentIds.map((id) => [id, []]));
  for (const lesson of lessonPerformance) {
    for (const state of lesson.studentStates) {
      if (!statesByStudent.has(Number(state.studentId))) continue;
      statesByStudent.get(Number(state.studentId)).push({ ...state, lessonId: lesson.id, lessonTitle: lesson.title });
    }
  }
  const studentsById = new Map(students.map((student) => [Number(student.id), student]));
  const studentPerformance = studentIds.map((studentId) => {
    const student = studentsById.get(studentId);
    const states = statesByStudent.get(studentId) || [];
    const startedStates = states.filter((state) => state.started);
    const curriculumStates = startedStates.filter((state) => state.lessonId.startsWith("curriculum:"));
    const scores = startedStates.flatMap((state) => state.scoreValues || []);
    const attempts = startedStates.flatMap((state) => state.attemptValues || []);
    const failed = startedStates.flatMap((state) => state.failedAttemptValues || []);
    const activeSeconds = curriculumStates.reduce((sum, state) => sum + (Number(state.activeSeconds) || 0), 0);
    const lastActivityAt = maxDate(...states.map((state) => state.lastActivityAt));
    const dueAtByLevelKey = dueAtByStudentAndLevel.get(studentId) || new Map();
    const reasons = buildAttentionReasons({ student, states, dueAtByLevelKey, now });
    return {
      studentId,
      name: `${student.firstName || ""} ${student.lastName || ""}`.trim() || student.username,
      username: student.username,
      progress: average(curriculumStates.map((state) => state.progressPercent)),
      averageScore: average(scores),
      averageAttempts: average(attempts),
      averageFailedAttempts: average(failed),
      activeSeconds,
      activeTimeLabel: activeSeconds > 0 ? formatDuration(activeSeconds) : null,
      completedLevels: curriculumStates.reduce((sum, state) => sum + state.completedLevels, 0),
      lastActivityAt,
      status: reasons.length ? "needs_attention" : startedStates.length ? "on_track" : "no_activity",
      statusLabel: reasons.length ? "Needs attention" : startedStates.length ? "On track" : "No activity",
      attentionReasons: reasons,
    };
  });

  const startedStates = [...statesByStudent.values()].flat().filter((state) => state.started);
  const completedStates = startedStates.filter((state) => state.completed);
  const allScores = startedStates.flatMap((state) => state.scoreValues || []);
  const allAttempts = startedStates.flatMap((state) => state.attemptValues || []);
  const allActiveTimes = startedStates.map((state) => state.activeSeconds).filter((value) => Number.isFinite(value) && value > 0);
  const hintTrackableStates = startedStates.filter((state) => state.hintUsed != null);
  const hintUsingStates = hintTrackableStates.filter((state) => state.hintUsed);
  const curriculumProgressStates = startedStates.filter((state) => state.lessonId.startsWith("curriculum:"));
  const selectedCurriculumMetrics = lessonPerformance.filter((lesson) => lesson.source === "curriculum");
  const selectedCurriculumRows = selectedCurriculumMetrics.flatMap((lesson) => lesson.activityRows);
  const failurePatterns = buildFailurePatterns(
    selectedCurriculumMetrics.flatMap((lesson) => lesson.failureSignals),
  );
  const completedWithAttempts = selectedCurriculumRows.filter((row) => row.isCompleted);
  const mostCompletedLesson = [...lessonPerformance]
    .filter((lesson) => lesson.studentsStarted > 0)
    .sort((a, b) => (b.completionRate ?? -1) - (a.completionRate ?? -1) || b.studentsCompleted - a.studentsCompleted)[0] || null;
  const mostDifficultLesson = [...lessonPerformance]
    .filter((lesson) => lesson.difficulty.sufficientData)
    .sort((a, b) => b.difficulty.score - a.difficulty.score)[0] || null;

  const attemptsDistribution = [
    { key: "1", label: "1 attempt", min: 1, max: 1 },
    { key: "2", label: "2 attempts", min: 2, max: 2 },
    { key: "3", label: "3 attempts", min: 3, max: 3 },
    { key: "4", label: "4 attempts", min: 4, max: 4 },
    { key: "5+", label: "5+ attempts", min: 5, max: Infinity },
  ].map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    count: allAttempts.filter((value) => value >= bucket.min && value <= bucket.max).length,
  }));
  const activity = buildActivity(selectedCurriculumRows, filters);
  for (const item of activity.recent) {
    item.studentName = studentsById.get(item.studentId)
      ? `${studentsById.get(item.studentId).firstName || ""} ${studentsById.get(item.studentId).lastName || ""}`.trim()
      : "Student";
    item.lessonTitle = lessonPerformance.find((lesson) => lesson.id === item.lessonId)?.title || item.levelKey;
  }

  const publicLessons = lessonPerformance.map(({
    studentStates: _studentStates,
    activityRows: _activityRows,
    failureSignals: _failureSignals,
    ...lesson
  }) => lesson);
  return {
    meta: {
      generatedAt: now,
      filters: {
        classroomId: filters.classroomId,
        datePreset: filters.datePreset,
        startAt: filters.startAt,
        endAt: filters.endAt,
        lessonId: filters.lessonId,
      },
      formulas: {
        totalStudents: "Distinct active student accounts with an active membership in the selected active classroom(s).",
        averageProgress: "Mean current progress across started, enabled curriculum lessons in scope; unstarted work and classroom documents are excluded.",
        completionRate: "Completed student-lesson outcomes divided by started student-lesson outcomes in the selected activity window.",
        averageScore: "Mean stored first-completion curriculum score plus normalized graded assignment scores; replays do not replace first-completion results.",
        averageAttempts: "Mean recorded solution attempts: failed attempts plus one successful completion attempt; assignment submissions use their stored submission attempt count.",
        averageActiveTime: "Mean confirmed foreground active time for started curriculum lessons with a positive timer value.",
        studentsNeedingAttention: "Distinct students matching one or more centralized deterministic attention rules; each result includes its reasons.",
        hintUsageRate: "Started curriculum student-lesson outcomes with any recorded hint use divided by started curriculum outcomes.",
        dateFilter: "Date windows include outcomes whose latest recorded activity falls in the window. Roster size is always current; historical snapshots are not fabricated.",
        difficulty: "35% failed-attempt rate + 30% non-completion rate + 20% score deficit + 15% hint-use rate, reweighted for available signals; minimum sample is 3 starters.",
        levelCompletionRate: "Completed applicable student-level outcomes divided by started applicable student-level outcomes; start and attempt rates use applicable students.",
        learningFunnel: "Applicable means at least one enabled lesson level; started requires progress evidence; attempted requires a failed submission or completion; completed requires every applicable enabled level.",
        failurePatterns: "Each applicable student-level contributes at most its latest recorded failure signal. Unfinished signals are separate from completed-after-failure outcomes and are not historical error totals.",
      },
      limitations: [
        "Built-in UserProgress records predate classroom-scoped progress and remain student-scoped; access is limited to current valid classroom membership.",
        "When all classrooms are selected, each student is counted once and curriculum eligibility is the union of levels enabled across that student's selected classroom memberships.",
        "Cumulative records cannot reconstruct attempts or active time by historical day.",
        "Latest failure fields retain only one signal per student-level and remain after later completion; failure-pattern date filters use latestFailureAt.",
        "Classroom lesson reading progress does not track active time, failed attempts, or hints.",
      ],
    },
    filters: {
      classrooms: availableClassrooms.map((item) => ({ id: item.id, name: item.className, section: item.section })),
      lessons: [...curriculumMetrics, ...customMetrics].map((lesson) => ({ id: lesson.id, title: lesson.title, source: lesson.source })),
    },
    overview: {
      totalStudents: studentIds.length,
      averageProgress: average(curriculumProgressStates.map((state) => state.progressPercent)),
      completionRate: percent(completedStates.length, startedStates.length),
      averageScore: average(allScores),
      averageAttempts: average(allAttempts),
      averageActiveSeconds: average(allActiveTimes, 0),
      averageActiveTimeLabel: formatDuration(average(allActiveTimes, 0)),
      studentsNeedingAttention: studentPerformance.filter((student) => student.attentionReasons.length).length,
      hintUsageRate: percent(hintUsingStates.length, hintTrackableStates.length),
    },
    highlights: {
      mostCompletedLesson: mostCompletedLesson ? {
        id: mostCompletedLesson.id,
        title: mostCompletedLesson.title,
        completionRate: mostCompletedLesson.completionRate,
      } : null,
      mostDifficultLesson: mostDifficultLesson ? {
        id: mostDifficultLesson.id,
        title: mostDifficultLesson.title,
        ...mostDifficultLesson.difficulty,
        averageAttempts: mostDifficultLesson.averageAttempts,
        completionRate: mostDifficultLesson.completionRate,
        hintUsageRate: mostDifficultLesson.hintUsageRate,
      } : null,
    },
    lessonPerformance: publicLessons,
    failurePatterns,
    studentPerformance,
    attention: studentPerformance.filter((student) => student.attentionReasons.length),
    heatmap: {
      lessons: publicLessons.map((lesson) => ({ id: lesson.id, title: lesson.title })),
      students: studentPerformance.map((student) => ({
        studentId: student.studentId,
        name: student.name,
        cells: (statesByStudent.get(student.studentId) || []).map((state) => ({
          lessonId: state.lessonId,
          ...studentHeatmapState(state),
          progress: state.progressPercent,
          failedAttempts: state.failedAttempts,
          expectedLevels: state.expectedLevels,
          completedLevels: state.completedLevels,
        })),
      })),
    },
    scoresAndAttempts: {
      scoreDistribution: scoreDistribution(allScores),
      firstAttemptSuccessRate: percent(
        completedWithAttempts.filter((row) => (Number(row.attemptCount) || 0) === 0).length,
        completedWithAttempts.length,
      ),
      averageAttemptsBeforeCompletion: average(completedWithAttempts.map((row) => (Number(row.attemptCount) || 0) + 1)),
      attemptDistribution: attemptsDistribution,
      failedAttemptsByLesson: publicLessons.map((lesson) => ({
        lessonId: lesson.id,
        title: lesson.title,
        failedAttempts: lesson.failedAttempts,
      })).filter((item) => item.failedAttempts != null),
    },
    hints: {
      basicHintUsers: selectedCurriculumMetrics.reduce((sum, lesson) => sum + lesson.basicHintUsers, 0),
      purchasedHintUsers: selectedCurriculumMetrics.reduce((sum, lesson) => sum + lesson.purchasedHintUsers, 0),
      studentsUsingHints: new Set(selectedCurriculumMetrics.flatMap((lesson) => lesson.studentStates.filter((state) => state.hintUsed).map((state) => state.studentId))).size,
      averageAttemptsBeforeHint: average(selectedCurriculumMetrics.flatMap((lesson) => lesson.studentStates.flatMap((state) => state.attemptsBeforeHint || []))),
      completionAfterHintRate: percent(
        selectedCurriculumMetrics.reduce((sum, lesson) => sum + lesson.completedAfterHint, 0),
        selectedCurriculumMetrics.reduce((sum, lesson) => sum + lesson.studentsUsingHints, 0),
      ),
      byLesson: publicLessons.filter((lesson) => lesson.tracking.hints).map((lesson) => ({
        lessonId: lesson.id,
        title: lesson.title,
        hintUsageRate: lesson.hintUsageRate,
        basicHintUsers: lesson.basicHintUsers,
        purchasedHintUsers: lesson.purchasedHintUsers,
      })),
    },
    activity,
  };
};

const emptyAnalyticsPayload = ({ filters, availableClassrooms }) => ({
  meta: {
    generatedAt: new Date(),
    filters,
    formulas: {},
    limitations: [],
  },
  filters: {
    classrooms: availableClassrooms.map((item) => ({ id: item.id, name: item.className, section: item.section })),
    lessons: [],
  },
  overview: {
    totalStudents: 0,
    averageProgress: null,
    completionRate: null,
    averageScore: null,
    averageAttempts: null,
    averageActiveSeconds: null,
    averageActiveTimeLabel: null,
    studentsNeedingAttention: 0,
    hintUsageRate: null,
  },
  highlights: { mostCompletedLesson: null, mostDifficultLesson: null },
  lessonPerformance: [],
  failurePatterns: buildFailurePatterns([]),
  studentPerformance: [],
  attention: [],
  heatmap: { lessons: [], students: [] },
  scoresAndAttempts: {
    scoreDistribution: scoreDistribution([]),
    firstAttemptSuccessRate: null,
    averageAttemptsBeforeCompletion: null,
    attemptDistribution: [],
    failedAttemptsByLesson: [],
  },
  hints: {
    basicHintUsers: 0,
    purchasedHintUsers: 0,
    studentsUsingHints: 0,
    averageAttemptsBeforeHint: null,
    completionAfterHintRate: null,
    byLesson: [],
  },
  activity: { byDay: [], recent: [], unavailableMetrics: [] },
});

module.exports = {
  ATTENTION_RULES,
  MIN_DIFFICULTY_SAMPLE,
  buildAttentionReasons,
  calculateDifficulty,
  formatDuration,
  getTeacherAnalytics,
  parseAnalyticsFilters,
  scoreDistribution,
};
