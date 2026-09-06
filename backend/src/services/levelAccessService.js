const UserProgress = require("../models/UserProgress");
const StudentLevelExtension = require("../models/StudentLevelExtension");
const { findPrimaryActiveMembership } = require("./studentClassService");
const { getClassroomLevelSettings } = require("./classroomLevelSettingsService");

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

const evaluateStudentLevelAccess = ({
  levelKey,
  settings,
  progressByKey,
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

  const enabledSettings = settings.filter((setting) => setting.isEnabled);
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

const getStudentLevelAccess = async ({ userId, levelKey, membership = null, now = new Date() }) => {
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

  const settings = await getClassroomLevelSettings(activeMembership.classroomId);
  const progressRows = await UserProgress.findAll({
    where: { userId },
    attributes: ["levelKey", "isCompleted"],
  });
  const progressByKey = new Map(progressRows.map((row) => [row.levelKey, row]));
  const target = settings.find((setting) => setting.levelKey === levelKey);
  const extension = target?.dueAt
    ? await StudentLevelExtension.findOne({
        where: { classroomId: activeMembership.classroomId, studentId: userId, levelKey },
      })
    : null;

  return evaluateStudentLevelAccess({
    levelKey,
    settings,
    progressByKey,
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
  restrictionPayload,
};
