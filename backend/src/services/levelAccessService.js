const { Op } = require("sequelize");
const UserProgress = require("../models/UserProgress");
const StudentLevelExtension = require("../models/StudentLevelExtension");
const { PLAYABLE_LEVEL_KEYS } = require("../constants/progressDefaults");
const { findPrimaryActiveMembership } = require("./studentClassService");
const { getClassroomLevelSettings } = require("./classroomLevelSettingsService");
const { getLessonProgressionState } = require("./lessonProgressionService");
const { CANONICAL_LESSON_ORDER } = require("../constants/lessonProgressionConfig");

const PLAYABLE_LEVEL_KEY_SET = new Set(PLAYABLE_LEVEL_KEYS);

const toTime = (value) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const getEffectiveDueAt = (classDueAt, extensionDueAt) => {
  const classTime = toTime(classDueAt);
  if (classTime == null) return null;
  const extensionTime = toTime(extensionDueAt);
  return new Date(Math.max(classTime, extensionTime ?? classTime));
};

const deadlineFields = (classDueAt, extensionDueAt) => {
  const effectiveDueAt = getEffectiveDueAt(classDueAt, extensionDueAt);
  return {
    classDueAt: classDueAt ?? null,
    extensionDueAt: extensionDueAt ?? null,
    effectiveDueAt,
    hasExtension: Boolean(classDueAt && extensionDueAt && toTime(extensionDueAt) > toTime(classDueAt)),
  };
};

const lessonKeyForLevel = (levelKey) => CANONICAL_LESSON_ORDER.find(
  (lessonKey) => levelKey.startsWith(`${lessonKey}-level-`),
) ?? null;

const canonicalPrefixLevelKeys = (lessonKey) => {
  const lessonIndex = CANONICAL_LESSON_ORDER.indexOf(lessonKey);
  if (lessonIndex < 0) return [];
  const prefixLessonKeys = new Set(CANONICAL_LESSON_ORDER.slice(0, lessonIndex + 1));
  return PLAYABLE_LEVEL_KEYS.filter((levelKey) => (
    prefixLessonKeys.has(lessonKeyForLevel(levelKey))
  ));
};

const orderedEnabledSettings = (settings, lessonKey = null) => settings
  .filter((setting) => (
    setting.isEnabled
    && PLAYABLE_LEVEL_KEY_SET.has(setting.levelKey)
    && (!lessonKey || setting.levelKey.startsWith(`${lessonKey}-level-`))
  ))
  .sort((left, right) => {
    const leftOrder = Number.isFinite(Number(left.displayOrder))
      ? Number(left.displayOrder)
      : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(Number(right.displayOrder))
      ? Number(right.displayOrder)
      : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.levelKey.localeCompare(right.levelKey);
  });

const evaluateStudentLevelAccess = ({
  levelKey,
  settings,
  progressByKey,
  lessonProgressionState = null,
  extensionDueAt = null,
  now = new Date(),
}) => {
  const target = settings.find((setting) => setting.levelKey === levelKey);
  const progress = progressByKey.get(levelKey);
  const deadlines = deadlineFields(target?.dueAt, extensionDueAt);

  // Completion is permanent. A later policy edit must never invalidate it.
  if (progress?.isCompleted) {
    return { allowed: true, reason: "COMPLETED", completed: true, ...deadlines };
  }
  if (!target?.isEnabled) {
    return { allowed: false, reason: "LEVEL_DISABLED", completed: false, ...deadlines };
  }
  if (lessonProgressionState && !lessonProgressionState.curriculumPrerequisiteSatisfied) {
    return {
      allowed: false,
      reason: "LESSON_PREREQUISITE_REQUIRED",
      completed: false,
      lessonKey: lessonProgressionState.lessonKey,
      prerequisiteLessonKey: lessonProgressionState.prerequisiteLessonKey,
      nextAction: lessonProgressionState.nextAction,
      ...deadlines,
    };
  }
  if (lessonProgressionState?.preRequired && !lessonProgressionState.preCompleted) {
    return {
      allowed: false,
      reason: "PRE_ASSESSMENT_REQUIRED",
      completed: false,
      lessonKey: lessonProgressionState.lessonKey,
      assessmentId: lessonProgressionState.preAssessmentId,
      nextAction: lessonProgressionState.nextAction,
      ...deadlines,
    };
  }

  const enabledSettings = orderedEnabledSettings(
    settings,
    lessonProgressionState?.lessonKey ?? lessonKeyForLevel(levelKey),
  );
  const targetIndex = enabledSettings.findIndex((setting) => setting.levelKey === levelKey);
  const prerequisiteLevelKey = targetIndex > 0
    ? enabledSettings[targetIndex - 1].levelKey
    : null;
  if (prerequisiteLevelKey && !progressByKey.get(prerequisiteLevelKey)?.isCompleted) {
    return {
      allowed: false,
      reason: "LEVEL_LOCKED",
      completed: false,
      prerequisiteLevelKey,
      ...deadlines,
    };
  }
  if (target.unlockAt && toTime(target.unlockAt) > now.getTime()) {
    return {
      allowed: false,
      reason: "LEVEL_SCHEDULED",
      completed: false,
      unlockAt: target.unlockAt,
      ...deadlines,
    };
  }
  if (deadlines.effectiveDueAt && now.getTime() > deadlines.effectiveDueAt.getTime()) {
    return { allowed: false, reason: "DEADLINE_PASSED", completed: false, ...deadlines };
  }
  return { allowed: true, reason: null, completed: false, ...deadlines };
};

const getStudentLevelAccess = async ({
  userId,
  levelKey,
  membership = null,
  lessonProgressionState = null,
  levelSettings = null,
  progressRows = null,
  now = new Date(),
}) => {
  const activeMembership = membership ?? await findPrimaryActiveMembership(userId);
  if (!activeMembership) {
    return {
      allowed: false,
      reason: "CLASS_MEMBERSHIP_REQUIRED",
      completed: false,
      classDueAt: null,
      extensionDueAt: null,
      effectiveDueAt: null,
      hasExtension: false,
    };
  }

  const settings = levelSettings ?? await getClassroomLevelSettings(activeMembership.classroomId);
  const targetLessonKey = lessonKeyForLevel(levelKey);
  const requiredProgressLevelKeys = Array.from(new Set([
    ...(targetLessonKey ? canonicalPrefixLevelKeys(targetLessonKey) : []),
    levelKey,
  ]));
  const resolvedProgressRows = progressRows ?? await UserProgress.findAll({
    where: { userId, levelKey: { [Op.in]: requiredProgressLevelKeys } },
    attributes: ["levelKey", "isCompleted"],
  });
  const progressByKey = new Map(resolvedProgressRows.map((row) => [row.levelKey, row]));
  const target = settings.find((setting) => setting.levelKey === levelKey);
  const extension = target?.dueAt
    ? await StudentLevelExtension.findOne({
        where: { classroomId: activeMembership.classroomId, studentId: userId, levelKey },
      })
    : null;
  const state = lessonProgressionState ?? (targetLessonKey
    ? await getLessonProgressionState({
        classroomId: activeMembership.classroomId,
        studentId: userId,
        lessonKey: targetLessonKey,
        authorizedMembership: activeMembership,
        progressRows: resolvedProgressRows,
        levelSettings: settings,
      })
    : null);

  return evaluateStudentLevelAccess({
    levelKey,
    settings,
    progressByKey,
    lessonProgressionState: state,
    extensionDueAt: extension?.extendedDueAt ?? null,
    now,
  });
};

const restrictionPayload = (access) => {
  const common = {
    code: access.reason,
    effectiveDueAt: access.effectiveDueAt ?? null,
  };
  if (access.reason === "DEADLINE_PASSED") {
    return { ...common, message: "The deadline for this level has passed." };
  }
  if (access.reason === "LEVEL_DISABLED") {
    return { ...common, message: "Your teacher has disabled this level for the classroom." };
  }
  if (access.reason === "LEVEL_SCHEDULED") {
    return {
      ...common,
      message: "This level is not available yet.",
      unlockAt: access.unlockAt,
    };
  }
  if (access.reason === "LESSON_PREREQUISITE_REQUIRED") {
    return {
      ...common,
      message: "Complete the prerequisite lesson before opening this lesson.",
      lessonKey: access.lessonKey,
      prerequisiteLessonKey: access.prerequisiteLessonKey,
      nextAction: access.nextAction,
    };
  }
  if (access.reason === "PRE_ASSESSMENT_REQUIRED") {
    return {
      ...common,
      message: "Complete the required pre-test before opening this lesson.",
      lessonKey: access.lessonKey,
      assessmentId: access.assessmentId,
      nextAction: access.nextAction,
    };
  }
  return {
    ...common,
    message: "Complete the previous assigned level before opening this level.",
    prerequisiteLevelKey: access.prerequisiteLevelKey,
  };
};

module.exports = {
  deadlineFields,
  evaluateStudentLevelAccess,
  getEffectiveDueAt,
  getStudentLevelAccess,
  lessonKeyForLevel,
  restrictionPayload,
};
