const LevelContentOverride = require("../models/LevelContentOverride");
const { PLAYABLE_LEVEL_KEYS } = require("../constants/progressDefaults");

const DEFAULT_WRONG_ATTEMPT_DEDUCTION = 5;
const DEFAULT_LATE_DEDUCTION_PER_DAY = 3;

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getClassroomLevelSettings = async (classroomId) => {
  const rows = classroomId
    ? await LevelContentOverride.findAll({ where: { classroomId } })
    : [];
  const overrides = new Map(rows.map((row) => [row.levelKey, row]));

  return PLAYABLE_LEVEL_KEYS.map((levelKey, index) => {
    const row = overrides.get(levelKey);
    return {
      levelKey,
      isEnabled: row?.isEnabled ?? true,
      displayOrder: Number.isInteger(row?.displayOrder)
        ? row.displayOrder
        : index + 1,
      unlockAt: row?.unlockAt ?? null,
      dueAt: row?.dueAt ?? null,
      hintsEnabled: row?.hintsEnabled ?? true,
      wrongAttemptDeduction: toNumber(
        row?.wrongAttemptDeduction,
        DEFAULT_WRONG_ATTEMPT_DEDUCTION,
      ),
      lateDeductionPerDay: toNumber(
        row?.lateDeductionPerDay,
        DEFAULT_LATE_DEDUCTION_PER_DAY,
      ),
      validatorConfig: row?.validatorConfig ?? null,
    };
  }).sort((a, b) => a.displayOrder - b.displayOrder);
};

module.exports = {
  DEFAULT_WRONG_ATTEMPT_DEDUCTION,
  DEFAULT_LATE_DEDUCTION_PER_DAY,
  getClassroomLevelSettings,
};
